// api/evidence.js
//
// Call 2 of 2. Takes the atomic claims from api/triage.js and produces
// a full per-claim analysis. Empirical/Causal claims get Google Search
// grounding; Prediction-or-promise/Normative/Mixed claims get the same
// depth of analysis but ungrounded (there's nothing to search-check in
// a value judgment or an unresolved future). One Gemini call per claim,
// isolated with Promise.allSettled — one claim's failure never takes
// down the others, and a claim that can't be analyzed gets an explicit
// error entry rather than a fabricated result.

const { LANGUAGE_NAMES, ASSESSMENT_ENUM, CONFIDENCE_ENUM, sourceDomain, tierForDomain, callGeminiJSON } = require("./_lib/gemini.js");

const MAX_CLAIMS_PER_REQUEST = 12;
// Generous headroom: these schemas pack several full-sentence fields (plus,
// for Empirical/Causal, a "thinking" model's internal reasoning eats into
// the same budget), and a truncated response fails JSON.parse outright.
const MAX_OUTPUT_TOKENS = 3072;
const GROUNDING_TOOLS = [{ google_search: {} }];

const NOT_SOURCE_CHECKED_NOTE = {
  he: " (לא בוצע חיפוש מקורות עבור ניתוח זה; זו הערכה כללית בלבד.)",
  en: " (No source search was performed for this analysis; this is a general-knowledge assessment only.)"
};
const ZERO_SOURCES_NOTE = {
  he: " (לא נמצאו מקורות מהימנים בחיפוש; ההערכה עודכנה בהתאם.)",
  en: " (No credible sources were found in search; the assessment was adjusted accordingly.)"
};

const EVIDENCE_RULES =
  "Evidence rules: mentally tier sources you rely on — Primary official government/" +
  "institutional data (e.g. Israeli Central Bureau of Statistics, Bank of Israel, Knesset " +
  "records, State Comptroller, courts, ministry data), Academic sources, Established " +
  "journalism, Fact-check organizations, or Other — and prefer higher tiers when available. " +
  "If the claim concerns an event within roughly the last 7 days, or an ongoing/developing " +
  "situation, default to assessment='Too recent to assess' unless at least two independent " +
  "sources that clearly postdate the claim corroborate it; this recency caution overrides an " +
  "apparent single-source confirmation. Never fabricate a source, statistic, or number — if " +
  "search turned up nothing usable, say so plainly with assessment='Not enough information' " +
  "rather than guessing. If you end up reasoning from general knowledge rather than a specific " +
  "source you found, say so explicitly in evidenceSummary. For claims in Hebrew or about " +
  "Israel, prefer Hebrew-language and Israeli sources where relevant and available. Never " +
  "assign a numeric score or percentage — assessment is categorical only.";

function baseInstructionPreamble(lang, claimKind) {
  var languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return (
    "You are the evidence/analysis step of a calm, rigorous claim-analysis tool, looking " +
    "at one already-identified " + claimKind + " claim. Write every free-text field in " +
    languageName + ". Keep fields brief — a short phrase or one sentence, except where 2-3 " +
    "sentences are explicitly requested. "
  );
}

function buildEmpiricalInstruction(lang) {
  return (
    baseInstructionPreamble(lang, "Empirical") +
    "Use Google Search to check the claim, then fill: assessment, confidence + " +
    "confidenceReason (one sentence on why), whatWouldChangeAssessment (one sentence), " +
    "evidenceSummary (2-3 sentences on what the evidence shows), denominatorCheck (what is " +
    "this compared to — absolute vs. per-capita, which timeframe, is the comparison fair), " +
    "precisionCheck (one sentence: is the claim specific enough to be falsifiable, or vague). " +
    EVIDENCE_RULES
  );
}

function buildCausalInstruction(lang) {
  return (
    baseInstructionPreamble(lang, "Causal") +
    "Use Google Search to check the claim, then fill: assessment, confidence + " +
    "confidenceReason, whatWouldChangeAssessment, evidenceSummary (2-3 sentences), " +
    "alternativeExplanations (2-3 alternative explanations consistent with the same facts), " +
    "correlationCautionNeeded (true if this looks like correlation being mistaken for " +
    "causation) with correlationCautionNote explaining briefly (or a short 'not a concern " +
    "here' if correlationCautionNeeded is false), distinguishingEvidence (what evidence would " +
    "let someone tell the competing explanations apart). " +
    EVIDENCE_RULES
  );
}

function buildPredictionInstruction(lang) {
  var languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return (
    baseInstructionPreamble(lang, "Prediction-or-promise") +
    "This is a prediction or a promise/commitment about the future — its outcome cannot be " +
    "known yet, so do not try to say whether it's true or false. Fill: confidence + " +
    "confidenceReason (how well-reasoned is the prediction itself, not whether it'll happen), " +
    "whatWouldChangeAssessment (one sentence on what would let someone judge this once it " +
    "plays out, or what current information could still update the analysis), " +
    "referenceClassAndBaseRate (what similar past cases/predictions suggest, and roughly how " +
    "often things like this pan out), feasibility (does the person/institution making this " +
    "have the authority and a plausible mechanism to make it happen). Write in " + languageName +
    ". Never fabricate a specific statistic. Never assign a numeric score."
  );
}

function buildNormativeInstruction(lang) {
  return (
    baseInstructionPreamble(lang, "Normative") +
    "This is a value judgment or opinion, not a checkable fact (any factual premises inside " +
    "it were already extracted as separate claims elsewhere). Fill: assessment (usually " +
    "'Not empirically assessable' unless there's a checkable element you can still speak to), " +
    "confidence + confidenceReason, whatWouldChangeAssessment, tension (one sentence: which " +
    "values or priorities this claim serves, and which it presses against), steelman (2-3 " +
    "sentences: the strongest, fairest version of the position behind this claim), " +
    "strawmanWarning (1-2 sentences: the distorted/exaggerated version people are likely to " +
    "argue against instead of the real claim). Never assign a numeric score."
  );
}

function buildMixedInstruction(lang) {
  return (
    baseInstructionPreamble(lang, "Mixed") +
    "This claim genuinely fuses more than one kind of assertion and couldn't be cleanly " +
    "split. Fill just: assessment, confidence + confidenceReason, whatWouldChangeAssessment. " +
    "Never assign a numeric score."
  );
}

const EMPIRICAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    assessment: { type: "STRING", enum: ASSESSMENT_ENUM },
    confidence: { type: "STRING", enum: CONFIDENCE_ENUM },
    confidenceReason: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" },
    evidenceSummary: { type: "STRING" },
    denominatorCheck: { type: "STRING" },
    precisionCheck: { type: "STRING" }
  },
  required: [
    "assessment", "confidence", "confidenceReason", "whatWouldChangeAssessment",
    "evidenceSummary", "denominatorCheck", "precisionCheck"
  ]
};

const CAUSAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    assessment: { type: "STRING", enum: ASSESSMENT_ENUM },
    confidence: { type: "STRING", enum: CONFIDENCE_ENUM },
    confidenceReason: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" },
    evidenceSummary: { type: "STRING" },
    alternativeExplanations: { type: "ARRAY", items: { type: "STRING" }, minItems: 2, maxItems: 3 },
    correlationCautionNeeded: { type: "BOOLEAN" },
    correlationCautionNote: { type: "STRING" },
    distinguishingEvidence: { type: "STRING" }
  },
  required: [
    "assessment", "confidence", "confidenceReason", "whatWouldChangeAssessment", "evidenceSummary",
    "alternativeExplanations", "correlationCautionNeeded", "correlationCautionNote", "distinguishingEvidence"
  ]
};

const PREDICTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    confidence: { type: "STRING", enum: CONFIDENCE_ENUM },
    confidenceReason: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" },
    referenceClassAndBaseRate: { type: "STRING" },
    feasibility: { type: "STRING" }
  },
  required: ["confidence", "confidenceReason", "whatWouldChangeAssessment", "referenceClassAndBaseRate", "feasibility"]
};

const NORMATIVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    assessment: { type: "STRING", enum: ASSESSMENT_ENUM },
    confidence: { type: "STRING", enum: CONFIDENCE_ENUM },
    confidenceReason: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" },
    tension: { type: "STRING" },
    steelman: { type: "STRING" },
    strawmanWarning: { type: "STRING" }
  },
  required: [
    "assessment", "confidence", "confidenceReason", "whatWouldChangeAssessment", "tension", "steelman", "strawmanWarning"
  ]
};

const MIXED_SCHEMA = {
  type: "OBJECT",
  properties: {
    assessment: { type: "STRING", enum: ASSESSMENT_ENUM },
    confidence: { type: "STRING", enum: CONFIDENCE_ENUM },
    confidenceReason: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" }
  },
  required: ["assessment", "confidence", "confidenceReason", "whatWouldChangeAssessment"]
};

const GROUNDED_TYPES = { Empirical: true, Causal: true };

function schemaAndInstructionFor(type, lang) {
  if (type === "Empirical") return { schema: EMPIRICAL_SCHEMA, instruction: buildEmpiricalInstruction(lang) };
  if (type === "Causal") return { schema: CAUSAL_SCHEMA, instruction: buildCausalInstruction(lang) };
  if (type === "Prediction-or-promise") return { schema: PREDICTION_SCHEMA, instruction: buildPredictionInstruction(lang) };
  if (type === "Normative") return { schema: NORMATIVE_SCHEMA, instruction: buildNormativeInstruction(lang) };
  return { schema: MIXED_SCHEMA, instruction: buildMixedInstruction(lang) };
}

var KNOWN_TYPES = { Empirical: true, Causal: true, "Prediction-or-promise": true, Normative: true };

async function analyzeOneClaim(claim, lang, apiKey) {
  var type = KNOWN_TYPES[claim.type] ? claim.type : "Mixed";
  var picked = schemaAndInstructionFor(type, lang);
  var grounded = !!GROUNDED_TYPES[type];

  var outcome = await callGeminiJSON({
    apiKey: apiKey,
    systemInstruction: picked.instruction,
    userText: claim.claimText,
    responseSchema: picked.schema,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    tools: grounded ? GROUNDING_TOOLS : undefined
  });

  var actuallyGrounded = grounded;

  if (!outcome.ok && grounded) {
    // The grounding-tool call itself failed (e.g. unsupported combination on
    // this tier/model) — retry once ungrounded rather than give up outright.
    outcome = await callGeminiJSON({
      apiKey: apiKey,
      systemInstruction: picked.instruction,
      userText: claim.claimText,
      responseSchema: picked.schema,
      maxOutputTokens: MAX_OUTPUT_TOKENS
    });
    actuallyGrounded = false;
  }

  if (!outcome.ok) {
    return {
      id: claim.id,
      claimText: claim.claimText,
      type: claim.type,
      error: true,
      errorCode: outcome.code
    };
  }

  var result = outcome.result;

  if (type === "Prediction-or-promise") {
    result.assessment = "Outcome not yet knowable";
  }

  var sources = [];
  if (grounded && actuallyGrounded) {
    sources = (outcome.groundingChunks || []).map(function (chunk) {
      var domain = sourceDomain(chunk.uri, chunk.title);
      return { uri: chunk.uri, title: chunk.title, domain: domain, tier: tierForDomain(domain) };
    });
    if (sources.length === 0) {
      result.assessment = "Not enough information";
      result.confidenceReason = (result.confidenceReason || "") + ZERO_SOURCES_NOTE[lang];
    }
  } else if (grounded && !actuallyGrounded) {
    result.confidenceReason = (result.confidenceReason || "") + NOT_SOURCE_CHECKED_NOTE[lang];
  }

  return Object.assign(
    {
      id: claim.id,
      claimText: claim.claimText,
      type: claim.type,
      error: false,
      grounded: grounded ? actuallyGrounded : null,
      sources: sources,
      premiseIds: Array.isArray(claim.premiseIds) ? claim.premiseIds : []
    },
    result
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const claims = Array.isArray(req.body && req.body.claims) ? req.body.claims : null;
  const lang = req.body && req.body.lang === "en" ? "en" : "he";

  if (!claims || claims.length === 0) {
    res.status(400).json({ error: "bad_request", message: "Missing claims." });
    return;
  }
  if (claims.length > MAX_CLAIMS_PER_REQUEST) {
    res.status(400).json({ error: "bad_request", message: "Too many claims." });
    return;
  }
  for (var i = 0; i < claims.length; i++) {
    if (!claims[i] || typeof claims[i].id !== "string" || typeof claims[i].claimText !== "string") {
      res.status(400).json({ error: "bad_request", message: "Malformed claim entry." });
      return;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server_misconfigured", message: "Server is missing an API key." });
    return;
  }

  const settled = await Promise.allSettled(claims.map(function (c) { return analyzeOneClaim(c, lang, apiKey); }));

  const results = settled.map(function (s, i) {
    if (s.status === "fulfilled") return s.value;
    console.error("evidence call threw for claim", claims[i].id, s.reason);
    return { id: claims[i].id, claimText: claims[i].claimText, type: claims[i].type, error: true, errorCode: "upstream_error" };
  });

  res.status(200).json({ results: results });
};
