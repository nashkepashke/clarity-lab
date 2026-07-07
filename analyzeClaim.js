// analyzeClaim.js
//
// This is the ONLY file page logic talks to for analysis. It calls our
// serverless function at /api/analyze (which in turn calls Gemini) and
// returns a Promise that resolves to the result object, or rejects with
// an Error whose .message is safe to show the user.
//
// Expected result shape:
// {
//   claim: string,          // the claim restated in plain language
//   type: string,           // "Factual claim" | "Prediction" | "Opinion or value judgment"
//   status: string,         // "Supported" | "Mixed or uncertain" | "Contradicted" | "Not enough information"
//   explanation: string,    // a couple of sentences on why
//   considerations: string[], // 2-3 bullet points to consider
//   tension: string         // what values/priorities are in tension
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
