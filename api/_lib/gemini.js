// api/_lib/gemini.js
//
// Shared by api/triage.js and api/evidence.js. Underscore-prefixed
// directory so Vercel doesn't treat this as a route on its own.
//
// callGeminiJSON() is the one place that knows how to call Gemini's
// generateContent, retry on 503, and turn the response into either a
// parsed JSON result (+ grounding chunks, if the caller asked for
// grounding) or a normalized error code. Callers never see a raw
// fetch Response — just { ok, result, groundingChunks } or
// { ok: false, code, message }, so triage.js and evidence.js can each
// decide how to turn that into their own HTTP response without
// duplicating retry/error-classification logic.

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  GEMINI_MODEL +
  ":generateContent";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;

const LANGUAGE_NAMES = { he: "Hebrew", en: "English" };

const ASSESSMENT_ENUM = [
  "Supported",
  "Mostly supported",
  "Mixed or context-dependent",
  "Contradicted",
  "Not enough information",
  "Not empirically assessable",
  "Too recent to assess"
];

const CONFIDENCE_ENUM = ["Low", "Medium", "High"];

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Best-effort domain -> source tier. Unmatched domains fall back to
// "Other" rather than guessing. Extend these lists as gaps show up in
// real grounding results; this is not meant to be exhaustive.
const TIER_DOMAINS = {
  "Primary official": [
    "gov.il",
    "knesset.gov.il",
    "cbs.gov.il",
    "boi.org.il",
    "mevaker.gov.il",
    "court.gov.il",
    ".gov"
  ],
  Academic: [".ac.il", ".edu", "scholar.google.", "jstor.org", "ncbi.nlm.nih.gov", "arxiv.org"],
  "Fact-check org": ["factcheck.org", "snopes.com", "politifact.com", "fullfact.org"],
  "Established journalism": [
    "ynet.co.il",
    "haaretz.co.il",
    "haaretz.com",
    "timesofisrael.com",
    "calcalist.co.il",
    "globes.co.il",
    "kan.org.il",
    "mako.co.il",
    "walla.co.il",
    "jpost.com",
    "maariv.co.il",
    "israelhayom.co.il",
    "davar1.co.il",
    "themarker.com",
    "n12.co.il",
    "ynetnews.com",
    "nytimes.com",
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "theguardian.com",
    "wsj.com",
    "washingtonpost.com",
    "ft.com",
    "economist.com",
    "aljazeera.com"
  ]
};

var BARE_DOMAIN_PATTERN = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

// Gemini's grounding `uri` is a Google redirect link
// (vertexaisearch.cloud.google.com/...), not the real source URL — its
// hostname is useless for tiering or display. In practice `title` comes
// back as the bare real domain (e.g. "cbs.gov.il"). Prefer that; only
// fall back to parsing `uri` (which will usually just yield the Google
// redirect host, degrading to "Other") if `title` isn't domain-shaped —
// e.g. when it's a real headline instead.
function sourceDomain(uri, title) {
  if (title && BARE_DOMAIN_PATTERN.test(title.trim())) {
    return title.trim().replace(/^www\./, "");
  }
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch (err) {
    return null;
  }
}

function tierForDomain(domain) {
  if (!domain) return "Other";
  var tiers = Object.keys(TIER_DOMAINS);
  for (var i = 0; i < tiers.length; i++) {
    var domains = TIER_DOMAINS[tiers[i]];
    for (var j = 0; j < domains.length; j++) {
      if (domain === domains[j] || domain.endsWith("." + domains[j]) || domain.endsWith(domains[j])) {
        return tiers[i];
      }
    }
  }
  return "Other";
}

// Maps a normalized error code to the HTTP status/body triage.js and
// evidence.js should send. Kept in one place so both routes respond to
// the same failure identically.
function mapCodeToHttp(code, detail) {
  if (code === "rate_limited") {
    return { status: 429, body: { error: "rate_limited", message: "The free-tier rate limit was hit." } };
  }
  if (code === "model_overloaded") {
    return { status: 503, body: { error: "model_overloaded", message: "Gemini is under heavy load right now." } };
  }
  if (code === "upstream_unreachable") {
    return { status: 502, body: { error: "upstream_unreachable", message: "Couldn't reach the analysis service." } };
  }
  if (code === "no_result") {
    return { status: 502, body: { error: "no_result", message: "The analysis service didn't return a result." } };
  }
  if (code === "invalid_response") {
    return { status: 502, body: { error: "invalid_response", message: "The analysis service returned an unreadable result." } };
  }
  return { status: 502, body: { error: "upstream_error", message: detail || "The analysis service returned an error." } };
}

// Calls Gemini once (with retry-on-503 up to MAX_ATTEMPTS), and returns
// a normalized result. `tools` is optional (pass [{ google_search: {} }]
// to enable grounding); when present and the call succeeds, grounding
// chunks (if any) are extracted and returned alongside the parsed JSON.
// `imageParts` is optional — an array of { mimeType, data } (data is
// base64) to attach as inline image parts, for the image-extraction call.
async function callGeminiJSON({ apiKey, systemInstruction, userText, imageParts, responseSchema, maxOutputTokens, tools }) {
  var parts = [];
  if (userText) {
    parts.push({ text: userText });
  }
  if (Array.isArray(imageParts)) {
    imageParts.forEach(function (img) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
  }

  var requestBody = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      maxOutputTokens: maxOutputTokens || 1024
    }
  };
  if (tools) {
    requestBody.tools = tools;
  }

  var geminiRes;
  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
      });
    } catch (err) {
      return { ok: false, code: "upstream_unreachable", message: String(err) };
    }

    if (geminiRes.status === 503 && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }
    break;
  }

  if (!geminiRes.ok) {
    var detail = "";
    try {
      var errBody = await geminiRes.json();
      detail = errBody && errBody.error && errBody.error.message;
    } catch (_) {
      // not JSON, ignore
    }

    if (geminiRes.status === 429) {
      return { ok: false, code: "rate_limited", message: detail, httpStatus: geminiRes.status };
    }
    if (geminiRes.status === 503) {
      return { ok: false, code: "model_overloaded", message: detail, httpStatus: geminiRes.status };
    }
    return { ok: false, code: "upstream_error", message: detail, httpStatus: geminiRes.status };
  }

  var geminiData = await geminiRes.json();
  var candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
  var rawText =
    candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

  if (!rawText) {
    var blockReason = geminiData && geminiData.promptFeedback && geminiData.promptFeedback.blockReason;
    return { ok: false, code: "no_result", message: blockReason ? "blockReason: " + blockReason : "empty response" };
  }

  var result;
  try {
    result = JSON.parse(rawText);
  } catch (err) {
    return { ok: false, code: "invalid_response", message: "non-JSON text: " + rawText.slice(0, 200) };
  }

  var groundingChunks = [];
  var rawChunks = candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks;
  if (Array.isArray(rawChunks)) {
    groundingChunks = rawChunks
      .map(function (chunk) {
        return chunk && chunk.web && chunk.web.uri ? { uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri } : null;
      })
      .filter(Boolean);
  }

  return { ok: true, result: result, groundingChunks: groundingChunks };
}

module.exports = {
  LANGUAGE_NAMES,
  ASSESSMENT_ENUM,
  CONFIDENCE_ENUM,
  sourceDomain,
  tierForDomain,
  mapCodeToHttp,
  callGeminiJSON
};
