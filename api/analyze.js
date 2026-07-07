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

const SYSTEM_INSTRUCTION =
  "You are a calm, neutral claim-analysis assistant for a demo app. Given a short " +
  "claim or statement from a user:\n" +
  "1. Restate the claim in plain, neutral language without adding your own spin.\n" +
  "2. Classify it as exactly one of: 'Factual claim' (a checkable statement about how " +
  "things are or were), 'Prediction' (a claim about the future), or 'Opinion or value " +
  "judgment' (depends on values or preferences and isn't simply true or false).\n" +
  "3. Assess its status as exactly one of: 'Supported', 'Mixed or uncertain', " +
  "'Contradicted', or 'Not enough information'.\n" +
  "4. Give a short, plain-language explanation (2-3 sentences) for that status.\n" +
  "5. List 2-3 concrete considerations a reader should weigh when evaluating the claim " +
  "themselves.\n" +
  "6. Note in one sentence what values or priorities are in tension in the claim or in " +
  "how people react to it.\n" +
  "Be measured — don't assert more confidence than the evidence supports.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    claim: { type: "STRING" },
    type: {
      type: "STRING",
      enum: ["Factual claim", "Prediction", "Opinion or value judgment"]
    },
    status: {
      type: "STRING",
      enum: ["Supported", "Mixed or uncertain", "Contradicted", "Not enough information"]
    },
    explanation: { type: "STRING" },
    considerations: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 2,
      maxItems: 3
    },
    tension: { type: "STRING" }
  },
  required: ["claim", "type", "status", "explanation", "considerations", "tension"],
  propertyOrdering: ["claim", "type", "status", "explanation", "considerations", "tension"]
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
          responseSchema: RESPONSE_SCHEMA
        }
      })
    });
  } catch (err) {
    console.error("Failed to reach Gemini API:", err);
    res.status(502).json({ error: "upstream_unreachable", message: "Couldn't reach the analysis service." });
    return;
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
