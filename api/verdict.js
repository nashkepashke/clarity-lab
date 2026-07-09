// api/verdict.js
//
// Call 3 of 3 (only reached if at least one claim from api/evidence.js
// analyzed successfully). Synthesizes the whole submission's per-claim
// results into one plain-language "bottom line": a verdict TYPE from a
// fixed enum, plus an optional short custom clause for specificity. The
// frontend maps the type to a translated base sentence (translations.js)
// and to a traffic-light action via an explicit, auditable lookup table
// in app.js (VERDICT_ACTION_MAP) — never model judgment for the action
// itself, only for which type best fits the analysis. Deliberately not
// a numeric score anywhere in this pipeline.
//
// A failure here is not fatal to the overall analysis — see
// analyzeClaim.js, which catches and swallows errors from this call so
// the detailed per-claim results still render without a bottom line.

const { LANGUAGE_NAMES, mapCodeToHttp, callGeminiJSON } = require("./_lib/gemini.js");

const MAX_CLAIMS = 12; // matches api/evidence.js's own cap; this always receives evidence.js's output
// A "thinking" model's internal reasoning eats into this budget before it
// ever writes the JSON output — the same truncation trap already hit (and
// fixed) for api/evidence.js. 512 was nowhere near enough in live testing:
// most real multi-claim inputs failed JSON.parse outright with a
// genuinely truncated response, even though the actual JSON payload here
// (one enum value + a short clause) is tiny.
const MAX_OUTPUT_TOKENS = 2048;

const VERDICT_TYPES = [
  "well_supported",
  "contradicted",
  "partly_true_missing_context",
  "unfalsifiable_polarizing",
  "likely_unfounded",
  "value_judgment",
  "prediction",
  "insufficient_info",
  "mixed_claims"
];

const VERDICT_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdictType: { type: "STRING", enum: VERDICT_TYPES },
    customClause: { type: "STRING" }
  },
  required: ["verdictType", "customClause"]
};

function buildSystemInstruction(lang) {
  var languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return (
    "You are the final synthesis step of a calm, rigorous claim-analysis tool. You're given " +
    "a compact summary of every claim already analyzed from one user submission (which may be " +
    "one claim or several). Your only job is to pick the single verdictType that best " +
    "describes the whole submission's overall epistemic pattern, from exactly these types:\n" +
    "- well_supported: the evidence clearly backs the claim(s) up.\n" +
    "- contradicted: the evidence directly and clearly contradicts the claim(s).\n" +
    "- partly_true_missing_context: technically accurate but missing context that changes " +
    "how it should be read, or a mix of supported and unsupported parts. If a claim's own " +
    "missingContext note describes something that would materially change how someone reads " +
    "an otherwise-'Supported'/'Mostly supported' claim, that's this type, not well_supported — " +
    "well_supported means the claim holds up with no significant missing context, not merely " +
    "that a source was found.\n" +
    "- unfalsifiable_polarizing: too vague or unfalsifiable to check, and/or framed in a " +
    "polarizing or loaded way (see the framing signals in the input).\n" +
    "- likely_unfounded: not directly contradicted by a single clean source, but shows " +
    "multiple independent warning signs (framing signals, unsourced claims, no credible " +
    "sources found, thin/hedging reasoning) that add up to real doubt. Use this rather than " +
    "'contradicted' when there isn't one clear contradicting source, and rather than " +
    "'unfalsifiable_polarizing' when the claim IS checkable in principle but just doesn't " +
    "hold up.\n" +
    "- value_judgment: this is a values/opinion claim, not a factual one — reasonable people " +
    "can disagree.\n" +
    "- prediction: this is about the future (a prediction or promise) — its outcome isn't " +
    "knowable yet.\n" +
    "- insufficient_info: not enough reliable information was found to assess this, and none " +
    "of the above patterns fit better.\n" +
    "- mixed_claims: the submission contains several claims with genuinely different verdicts " +
    "and no single pattern above describes the whole thing fairly.\n" +
    "Weigh the whole set of claims, not just the first one. Never pick a type that " +
    "contradicts what the per-claim assessments actually say. Two concrete examples: don't " +
    "pick well_supported if the claims were assessed Contradicted; and if every checkable " +
    "claim came back assessed exactly 'Not enough information' (no source-checked claim was " +
    "Supported, Mostly supported, Mixed or context-dependent, or Contradicted), the type MUST " +
    "be insufficient_info — never well_supported, even if a source was cited somewhere, since " +
    "'a source exists' is not the same as 'the source supports the claim'. If the input has " +
    "just one claim, the type should follow directly from that claim's own type and " +
    "should follow directly from that claim's own type and assessment. A Normative claim is " +
    "often listed together with a factual premise extracted from inside it (e.g. 'this unfair " +
    "law raised unemployment' produces both a Normative claim and an Empirical/Causal one) — " +
    "when the extracted premise is a supporting detail rather than an equally-weighted separate " +
    "topic, let the Normative claim's own nature (value_judgment) lead rather than defaulting " +
    "to mixed_claims just because two claims are present.\n" +
    "Also produce customClause: an optional short trailing clause (not a full sentence, no " +
    "leading capital unless it's a proper noun) that adds real specificity from THIS " +
    "submission when it helps — e.g. naming what was contradicted, or what context is " +
    "missing. It will be appended directly after a fixed base sentence, so phrase it to read " +
    "naturally as a continuation (for example: 'though the increase was smaller than " +
    "claimed' or 'confirmed by three independent government sources'). Leave it as an empty " +
    "string if the base sentence already says enough on its own — don't pad it with filler. " +
    "Write customClause in " + languageName + ". Never invent a specific fact, source, or " +
    "number that isn't already present in the claim summaries you were given."
  );
}

function summarizeClaimsForPrompt(claims) {
  return claims
    .map(function (c, i) {
      if (c.error) {
        return i + 1 + ". [could not be analyzed — technical error]";
      }
      var lines = [
        i + 1 + ". claimText: " + c.claimText,
        "type: " + c.type,
        "assessment: " + (c.assessment || "(none)"),
        "confidence: " + (c.confidence || "(none)")
      ];
      if (c.grounded === true) {
        lines.push("sourceChecked: yes, " + (c.sources ? c.sources.length : 0) + " source(s) found");
      } else if (c.grounded === false) {
        lines.push("sourceChecked: no (general-knowledge assessment only)");
      }
      if (c.missingContext) {
        lines.push("missingContext: " + c.missingContext);
      }
      if (Array.isArray(c.framingSignals) && c.framingSignals.length > 0) {
        lines.push("framingSignals: " + c.framingSignals.map(function (s) { return s.signal; }).join(", "));
      }
      return lines.join("; ");
    })
    .join("\n");
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
  if (claims.length > MAX_CLAIMS) {
    res.status(400).json({ error: "bad_request", message: "Too many claims." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server_misconfigured", message: "Server is missing an API key." });
    return;
  }

  const outcome = await callGeminiJSON({
    apiKey: apiKey,
    systemInstruction: buildSystemInstruction(lang),
    userText: summarizeClaimsForPrompt(claims),
    responseSchema: VERDICT_SCHEMA,
    maxOutputTokens: MAX_OUTPUT_TOKENS
  });

  if (!outcome.ok) {
    console.error("verdict failed:", outcome.code, outcome.message);
    const mapped = mapCodeToHttp(outcome.code, outcome.message);
    res.status(mapped.status).json(mapped.body);
    return;
  }

  let verdictType = VERDICT_TYPES.indexOf(outcome.result.verdictType) !== -1 ? outcome.result.verdictType : "insufficient_info";
  const customClause = typeof outcome.result.customClause === "string" ? outcome.result.customClause.trim() : "";

  // Code-level guarantee, not model self-regulation — mirrors the same
  // "zero sources found -> force Not enough information" safety net in
  // api/evidence.js. Caught live: the model was inconsistent picking
  // between insufficient_info and well_supported for the exact same
  // all-"Not enough information" input across repeated calls.
  const assessedClaims = claims.filter(function (c) { return !c.error && c.assessment; });
  const allInsufficient = assessedClaims.length > 0 && assessedClaims.every(function (c) {
    return c.assessment === "Not enough information";
  });
  if (allInsufficient) {
    verdictType = "insufficient_info";
  }

  res.status(200).json({ verdictType: verdictType, customClause: customClause });
};
