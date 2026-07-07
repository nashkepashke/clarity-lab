// api/analyze.js
//
// Vercel serverless function. Takes the claim text from the frontend,
// asks Gemini to analyze it with a JSON schema so the shape of the
// response is guaranteed, and hands that parsed object back.
//
// GEMINI_API_KEY is read from the environment only — set it in Vercel's
// project settings (or a local .env, see .env.example) and never commit it.

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  GEMINI_MODEL +
  ":generateContent";

const MAX_CLAIM_LENGTH = 2000;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

const SYSTEM_INSTRUCTION =
  "You are a calm, rigorous claim-analysis assistant for a demo app. Given a short " +
  "claim or statement from a user, produce a structured breakdown. Keep every field " +
  "brief — a short phrase or one sentence, except where 2-3 sentences are explicitly " +
  "requested below. Never fabricate specific sources, studies, statistics, or numbers " +
  "you cannot verify; when your assessment relies on general background knowledge " +
  "rather than a specific citable source, say so plainly instead of inventing one. " +
  "Never assign a numeric score or percentage anywhere — assessments are categorical " +
  "only. If a claim is too vague, subjective, or unfalsifiable to evaluate, say so " +
  "('Not enough information' or 'Not empirically assessable') rather than guessing.\n" +
  "1. claim: Restate the claim in plain, neutral language, without adding your own spin.\n" +
  "2. type: Classify as exactly one of: 'Factual' (a checkable statement about how " +
  "things are or were), 'Causal' (asserts one thing causes or caused another), " +
  "'Prediction' (a claim about the future), 'Opinion or value judgment' (depends on " +
  "values or preferences, not simply true or false), or 'Mixed' (combines more than " +
  "one of the above).\n" +
  "3. assessment: Assess as exactly one of: 'Supported', 'Mostly supported', 'Mixed or " +
  "context-dependent', 'Contradicted', 'Not enough information', or 'Not empirically " +
  "assessable' (for claims that are fundamentally about values or preferences rather " +
  "than facts).\n" +
  "4. confidence: How confident you are in that assessment — exactly one of 'Low', " +
  "'Medium', 'High'.\n" +
  "5. confidenceReason: One sentence on why that confidence level — what makes you more " +
  "or less sure.\n" +
  "6. evidenceBasis: 2-3 short bullets on what kind of evidence bears on this claim and " +
  "what it generally shows. Be explicit when you're reasoning from general knowledge " +
  "rather than specific sources.\n" +
  "7. steelman: In 2-3 sentences, give the strongest, fairest version of the position " +
  "behind this claim — how a thoughtful person holding it would argue for it.\n" +
  "8. strawmanWarning: In 1-2 sentences, describe the distorted or exaggerated version " +
  "of this claim that people are likely to argue against or spread, so the reader can " +
  "recognize when a fight is against that instead of the real claim.\n" +
  "9. tension: One sentence on which values or priorities this claim serves, and which " +
  "it presses against.\n" +
  "10. whatWouldChangeAssessment: One sentence on what new evidence or information " +
  "would change this assessment.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    claim: { type: "STRING" },
    type: {
      type: "STRING",
      enum: ["Factual", "Causal", "Prediction", "Opinion or value judgment", "Mixed"]
    },
    assessment: {
      type: "STRING",
      enum: [
        "Supported",
        "Mostly supported",
        "Mixed or context-dependent",
        "Contradicted",
        "Not enough information",
        "Not empirically assessable"
      ]
    },
    confidence: { type: "STRING", enum: ["Low", "Medium", "High"] },
    confidenceReason: { type: "STRING" },
    evidenceBasis: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 2,
      maxItems: 3
    },
    steelman: { type: "STRING" },
    strawmanWarning: { type: "STRING" },
    tension: { type: "STRING" },
    whatWouldChangeAssessment: { type: "STRING" }
  },
  required: [
    "claim",
    "type",
    "assessment",
    "confidence",
    "confidenceReason",
    "evidenceBasis",
    "steelman",
    "strawmanWarning",
    "tension",
    "whatWouldChangeAssessment"
  ],
  propertyOrdering: [
    "claim",
    "type",
    "assessment",
    "confidence",
    "confidenceReason",
    "evidenceBasis",
    "steelman",
    "strawmanWarning",
    "tension",
    "whatWouldChangeAssessment"
  ]
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const claim = req.body && typeof req.body.claim === "string" ? req.body.claim.trim() : "";

  if (!claim) {
    res.status(400).json({ error: "bad_request", message: "Missing claim text." });
    return;
  }

  if (claim.length > MAX_CLAIM_LENGTH) {
    res.status(400).json({
      error: "bad_request",
      message: "Claim is too long (max " + MAX_CLAIM_LENGTH + " characters)."
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server_misconfigured", message: "Server is missing an API key." });
    return;
  }

  let geminiRes;
  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: [{ text: claim }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: MAX_OUTPUT_TOKENS
          }
        })
      });
    } catch (err) {
      console.error("Failed to reach Gemini API:", err);
      res.status(502).json({ error: "upstream_unreachable", message: "Couldn't reach the analysis service." });
      return;
    }

    // 503 means Gemini is momentarily overloaded, not that anything is wrong
    // with the request — worth a couple of quick retries before giving up.
    if (geminiRes.status === 503 && attempt < MAX_ATTEMPTS) {
      console.warn("Gemini overloaded (attempt " + attempt + " of " + MAX_ATTEMPTS + "), retrying...");
      await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    break;
  }

  if (!geminiRes.ok) {
    let detail = "";
    try {
      const errBody = await geminiRes.json();
      detail = errBody && errBody.error && errBody.error.message;
    } catch (_) {
      // response wasn't JSON, ignore
    }

    if (geminiRes.status === 429) {
      res.status(429).json({
        error: "rate_limited",
        message: "The free-tier rate limit was hit. Wait a bit and try again."
      });
      return;
    }

    if (geminiRes.status === 503) {
      res.status(503).json({
        error: "model_overloaded",
        message: "Gemini is under heavy load right now. Wait a moment and try again."
      });
      return;
    }

    console.error("Gemini API error:", geminiRes.status, detail);
    res.status(502).json({ error: "upstream_error", message: "The analysis service returned an error." });
    return;
  }

  const geminiData = await geminiRes.json();
  const rawText =
    geminiData &&
    geminiData.candidates &&
    geminiData.candidates[0] &&
    geminiData.candidates[0].content &&
    geminiData.candidates[0].content.parts &&
    geminiData.candidates[0].content.parts[0] &&
    geminiData.candidates[0].content.parts[0].text;

  if (!rawText) {
    const blockReason = geminiData && geminiData.promptFeedback && geminiData.promptFeedback.blockReason;
    console.error("Gemini response had no text.", blockReason ? "blockReason: " + blockReason : geminiData);
    res.status(502).json({ error: "no_result", message: "The analysis service didn't return a result." });
    return;
  }

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (err) {
    console.error("Gemini returned non-JSON text:", rawText);
    res.status(502).json({ error: "invalid_response", message: "The analysis service returned an unreadable result." });
    return;
  }

  res.status(200).json(result);
};
