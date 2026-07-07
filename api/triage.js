// api/triage.js
//
// Call 1 of 2. Takes the raw pasted text, decomposes it into 1-5 atomic
// claims, types each one, and — for any Normative claim — extracts its
// embedded factual premises as additional atomic claims in the same
// list (routed to the empirical/causal track), with the Normative
// claim pointing at them via premiseIds. No grounding here; that's
// api/evidence.js, which takes this endpoint's output as input.

const { LANGUAGE_NAMES, mapCodeToHttp, callGeminiJSON } = require("./_lib/gemini.js");

const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_TOKENS = 2048;

const CLAIM_TYPES = ["Empirical", "Causal", "Prediction-or-promise", "Normative", "Mixed"];

const TRIAGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    claims: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          claimText: { type: "STRING" },
          type: { type: "STRING", enum: CLAIM_TYPES },
          premiseIds: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["id", "claimText", "type", "premiseIds"],
        propertyOrdering: ["id", "claimText", "type", "premiseIds"]
      }
    }
  },
  required: ["claims"]
};

function buildSystemInstruction(lang) {
  var languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return (
    "You are the triage step of a calm, rigorous claim-analysis tool. The user pastes a " +
    "short statement or a paragraph that may contain several claims. Your only job here " +
    "is decomposition and typing — not evidence, not assessment.\n" +
    "1. Break the input into 1-5 atomic claims: distinct, self-contained assertions that " +
    "could each be evaluated on their own. A single-sentence input is usually one claim; " +
    "a paragraph may contain several.\n" +
    "2. Restate each atomic claim's text (claimText) in plain, neutral " + languageName + ", " +
    "without adding your own spin.\n" +
    "3. Classify each atomic claim's type as exactly one of: 'Empirical' (a checkable " +
    "statement about how things are or were), 'Causal' (asserts one thing causes or " +
    "caused another), 'Prediction-or-promise' (a claim about the future, including a " +
    "campaign promise or commitment), 'Normative' (depends on values or preferences, not " +
    "simply true or false), or 'Mixed' (genuinely fuses more than one of the above and " +
    "cannot reasonably be split further).\n" +
    "4. For every Normative claim, look for factual premises embedded inside it (e.g. " +
    "'this unfair law raised unemployment' embeds the factual premise 'this law raised " +
    "unemployment'). Extract each embedded factual premise as its OWN additional entry in " +
    "the same claims list, typed 'Empirical' or 'Causal' as appropriate, restated as a " +
    "standalone claim. Do not extract premises from claims that are already fully " +
    "empirical/causal/predictive on their own.\n" +
    "5. Assign every entry (primary claims and extracted premises alike) a short unique " +
    "id in order: 'c1', 'c2', 'c3', etc.\n" +
    "6. On every Normative claim, set premiseIds to the ids of the factual premises you " +
    "extracted from it (empty array if none). On every other claim, premiseIds is always " +
    "an empty array — premises are never extracted from claims that aren't Normative.\n" +
    "Do not evaluate, assess, or fact-check anything here — only decompose and classify."
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const text = req.body && typeof req.body.text === "string" ? req.body.text.trim() : "";
  const lang = req.body && req.body.lang === "en" ? "en" : "he";

  if (!text) {
    res.status(400).json({ error: "bad_request", message: "Missing input text." });
    return;
  }
  if (text.length > MAX_INPUT_LENGTH) {
    res.status(400).json({
      error: "bad_request",
      message: "Input is too long (max " + MAX_INPUT_LENGTH + " characters)."
    });
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
    userText: text,
    responseSchema: TRIAGE_SCHEMA,
    maxOutputTokens: MAX_OUTPUT_TOKENS
  });

  if (!outcome.ok) {
    console.error("triage failed:", outcome.code, outcome.message);
    const mapped = mapCodeToHttp(outcome.code, outcome.message);
    res.status(mapped.status).json(mapped.body);
    return;
  }

  const rawClaims = Array.isArray(outcome.result.claims) ? outcome.result.claims : [];
  const validIds = new Set(rawClaims.map(function (c) { return c.id; }));
  const claims = rawClaims.map(function (c) {
    return {
      id: c.id,
      claimText: c.claimText,
      type: c.type,
      premiseIds: Array.isArray(c.premiseIds) ? c.premiseIds.filter(function (id) { return validIds.has(id) && id !== c.id; }) : []
    };
  });

  if (claims.length === 0) {
    res.status(502).json({ error: "no_result", message: "No claims were extracted." });
    return;
  }

  res.status(200).json({ claims: claims });
};
