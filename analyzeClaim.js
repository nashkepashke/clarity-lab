// analyzeClaim.js
//
// This is the ONLY file page logic talks to for analysis. Internally it's
// two network calls — /api/triage (decompose + type) then /api/evidence
// (per-claim grounded/ungrounded analysis) — but app.js only sees one
// finished structure: { claims, epistemicProfile, overallAssessment }.
// Errors reject with an Error carrying a .code safe to look up in
// translations.js; no English text lives in this file.
//
// onProgress(phase), if given, is called with "triage-done" then
// "evidence-done" so app.js can update the loading label without this
// file needing to know any translated strings.
//
// Per-claim result shape (see api/evidence.js for the authoritative
// version): { id, claimText, type, error, errorCode?, assessment?,
// confidence?, confidenceReason?, whatWouldChangeAssessment?, grounded?,
// sources?, premiseIds?, ...type-specific fields }. A claim with
// error:true carries only id/claimText/type/error/errorCode — every
// other field is absent, and renderers must treat absence as "don't
// render this part" rather than assume presence.

function postJSON(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (parsedBody) {
          if (res.ok) return parsedBody;
          var err = new Error((parsedBody && parsedBody.message) || "Request failed");
          err.code = (parsedBody && parsedBody.error) || "generic";
          throw err;
        });
    })
    .catch(function (err) {
      if (err && err.code) throw err; // already classified above
      var networkErr = new Error("Network error");
      networkErr.code = "network_error";
      throw networkErr;
    });
}

// Image-to-claim extraction — a separate call from the triage/evidence
// pipeline below, and deliberately not wired into it. app.js calls this
// first (if an image is attached), gets back plain extracted text, lets
// the user review/edit it in the existing textarea, and only then calls
// analyzeClaim() with that (possibly edited) text — completely unchanged
// from how manually-typed text already worked. Same .code error contract
// as postJSON below; a distinct `no_claim_found` code is used server-side
// when the model looked and found nothing, so it flows through the same
// translation mechanism as any other error rather than needing special
// handling here.
function extractClaimFromImage(base64Image, mimeType, lang) {
  return postJSON("/api/extract", { image: base64Image, mimeType: mimeType, lang: lang }).then(function (body) {
    return body.extractedText;
  });
}

function analyzeClaim(text, lang, onProgress) {
  return postJSON("/api/triage", { text: text, lang: lang }).then(function (triageBody) {
    if (onProgress) onProgress("triage-done");

    return postJSON("/api/evidence", { claims: triageBody.claims, lang: lang }).then(function (evidenceBody) {
      if (onProgress) onProgress("evidence-done");

      var claims = evidenceBody.results;
      return {
        claims: claims,
        epistemicProfile: buildEpistemicProfile(claims),
        overallAssessment: computeOverallAssessment(claims)
      };
    });
  });
}

function computeOverallAssessment(claims) {
  var valid = claims.filter(function (c) { return !c.error; });
  if (valid.length === 0) return null;
  var unique = new Set(valid.map(function (c) { return c.assessment; }));
  return unique.size === 1 ? valid[0].assessment : "Mixed or context-dependent";
}

// Deterministic, code-computed aggregation over the per-claim results —
// deliberately not a third Gemini call. Each dial is { level, ...params }
// where params are the raw counts translations.js's justification
// templates interpolate into a sentence; no numeric score is displayed.
function buildEpistemicProfile(claims) {
  var total = claims.length;
  var empiricalCount = claims.filter(function (c) { return c.type === "Empirical" || c.type === "Causal"; }).length;

  var checkabilityLevel =
    empiricalCount === total ? "settled-by-evidence" : empiricalCount === 0 ? "values-or-prediction" : "partially";

  var groundedEligible = claims.filter(function (c) { return c.grounded === true || c.grounded === false; });
  var withSources = groundedEligible.filter(function (c) { return !c.error && c.grounded === true && c.sources && c.sources.length > 0; });
  var evidenceStrengthLevel;
  if (groundedEligible.length === 0) {
    evidenceStrengthLevel = "not-applicable";
  } else if (withSources.length === 0) {
    evidenceStrengthLevel = "none-found";
  } else if (withSources.length === groundedEligible.length) {
    evidenceStrengthLevel = "strong";
  } else {
    evidenceStrengthLevel = "mixed-or-thin";
  }

  var precisionLevel = empiricalCount === 0 ? "unfalsifiable" : total === 1 ? "specific-and-falsifiable" : "somewhat-vague";

  var validClaims = claims.filter(function (c) { return !c.error; });
  var lowCount = validClaims.filter(function (c) { return c.confidence === "Low"; }).length;
  var highCount = validClaims.filter(function (c) { return c.confidence === "High"; }).length;
  var analysisConfidenceLevel =
    validClaims.length === 0 ? "low" : lowCount > 0 ? "low" : highCount === validClaims.length ? "high" : "medium";

  return {
    checkability: { level: checkabilityLevel, empiricalCount: empiricalCount, totalCount: total },
    evidenceStrength: { level: evidenceStrengthLevel, withSourcesCount: withSources.length, groundedEligibleCount: groundedEligible.length },
    precision: { level: precisionLevel, empiricalCount: empiricalCount, totalCount: total },
    analysisConfidence: { level: analysisConfidenceLevel, lowCount: lowCount, highCount: highCount, totalCount: validClaims.length }
  };
}
