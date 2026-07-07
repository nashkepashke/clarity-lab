// analyzeClaim.js
//
// This is the ONLY file page logic talks to for analysis. It calls our
// serverless function at /api/analyze (which in turn calls Gemini) and
// returns a Promise that resolves to the result object, or rejects with
// an Error whose .message is safe to show the user.
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

function analyzeClaim(text) {
  return fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim: text })
  }).then(function (res) {
    return res.json().catch(function () {
      return null;
    }).then(function (body) {
      if (res.ok) {
        return body;
      }

      if (res.status === 429) {
        throw new Error("You're sending requests too fast for the free tier. Wait a moment and try again.");
      }

      var message = (body && body.message) || "Something went wrong analyzing that claim.";
      throw new Error(message);
    });
  });
}
