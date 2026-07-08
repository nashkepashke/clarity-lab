// api/extract.js
//
// Image-to-claim extraction. Takes a base64-encoded screenshot (already
// downscaled client-side) and asks Gemini to transcribe the claim or
// statement visible in it — a social media post, a headline, a chat
// screenshot. This is a separate, ungrounded, non-triage call: its only
// job is "what does the image say", not analysis. The extracted text
// then flows through the *unchanged* triage/evidence pipeline exactly
// like manually-typed text would, once the user confirms it client-side.

const { LANGUAGE_NAMES, mapCodeToHttp, callGeminiJSON } = require("./_lib/gemini.js");

const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Client-side already rejects originals over ~4MB and downscales anything
// large before base64-encoding, so a well-behaved request never gets close
// to this — it's a defense-in-depth cap on the decoded byte size, not the
// primary size control.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 1024;

const EXTRACT_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    extractedText: { type: "STRING" }
  },
  required: ["found", "extractedText"]
};

function buildSystemInstruction(lang) {
  var languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return (
    "You are looking at an image that may be a screenshot of a social media post, a news " +
    "headline, or a chat/message screenshot (e.g. WhatsApp). Find the main claim or " +
    "statement being made and transcribe it. " +
    "Transcribe it verbatim in whatever language it's actually written in the image — do " +
    "not translate it, even though these instructions are in " + languageName + ". Clean up " +
    "only obvious visual noise (timestamps, read receipts, usernames, like/share counts, UI " +
    "chrome) and keep just the substantive claim or statement text. If there are multiple " +
    "messages or posts visible, transcribe the main or most prominent one. " +
    "Set found to true and extractedText to that transcription if you found a clear claim " +
    "or statement. If the image has no legible text, or the text present doesn't amount to " +
    "any checkable claim or statement (e.g. it's just a photo, a meme with no real claim, or " +
    "illegible), set found to false and leave extractedText empty — never invent a claim " +
    "that isn't actually there."
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const imageBase64 = req.body && typeof req.body.image === "string" ? req.body.image : "";
  const mimeType = req.body && typeof req.body.mimeType === "string" ? req.body.mimeType : "";
  const lang = req.body && req.body.lang === "en" ? "en" : "he";

  if (!imageBase64 || !mimeType) {
    res.status(400).json({ error: "bad_request", message: "Missing image." });
    return;
  }
  if (ACCEPTED_MIME_TYPES.indexOf(mimeType) === -1) {
    res.status(400).json({ error: "unsupported_file_type", message: "Unsupported image type: " + mimeType });
    return;
  }
  var approxBytes = imageBase64.length * 0.75;
  if (approxBytes > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: "file_too_large", message: "Decoded image exceeds " + MAX_IMAGE_BYTES + " bytes." });
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
    userText: "Extract the claim from this image.",
    imageParts: [{ mimeType: mimeType, data: imageBase64 }],
    responseSchema: EXTRACT_SCHEMA,
    maxOutputTokens: MAX_OUTPUT_TOKENS
  });

  if (!outcome.ok) {
    console.error("extract failed:", outcome.code, outcome.message);
    const mapped = mapCodeToHttp(outcome.code, outcome.message);
    res.status(mapped.status).json(mapped.body);
    return;
  }

  const found = !!outcome.result.found;
  const extractedText = typeof outcome.result.extractedText === "string" ? outcome.result.extractedText.trim() : "";

  if (!found || !extractedText) {
    res.status(422).json({ error: "no_claim_found", message: "No analyzable claim was found in the image." });
    return;
  }

  res.status(200).json({ extractedText: extractedText });
};
