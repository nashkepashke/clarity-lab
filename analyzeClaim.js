// analyzeClaim.js
//
// This is the ONLY file page logic talks to for analysis. It calls our
// serverless function at /api/analyze (which in turn calls Gemini) and
// returns a Promise that resolves to the result object, or rejects with
// an Error whose .code is safe to look up in translations.js — no English
// text lives in this file, so app.js decides how to show it.
//
// Expected result shape:
// {
//   claim: string,                  // the claim restated in plain language
//   type: string,                   // "Factual" | "Causal" | "Prediction" | "Opinion or value judgment" | "Mixed"
//   assessment: string,             // "Supported" | "Mostly supported" | "Mixed or context-dependent" |
//                                    // "Contradicted" | "Not enough information" | "Not empirically assessable"
//   confidence: string,             // "Low" | "Medium" | "High"
//   confidenceReason: string,       // one sentence on why that confidence level
//   evidenceBasis: string[],        // 2-3 bullets on what evidence bears on this and what it shows
//   steelman: string,               // 2-3 sentences: strongest fair version of the claim's position
//   strawmanWarning: string,        // 1-2 sentences: the distorted version people argue against
//   tension: string,                // which values/priorities this claim serves vs. presses on
//   whatWouldChangeAssessment: string // one sentence on what would change the assessment
// }
//
// The result's free-text fields come back in whichever `lang` ("he" | "en")
// is passed in; the field names and enum values above are always English.

function analyzeClaim(text, lang) {
  return fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim: text, lang: lang })
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (res.ok) {
            return body;
          }
          var err = new Error((body && body.message) || "Request failed");
          err.code = (body && body.error) || "generic";
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
