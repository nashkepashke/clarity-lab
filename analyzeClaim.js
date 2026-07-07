// analyzeClaim.js
//
// This is the ONLY file you should need to touch when you swap the fake
// logic for a real API call. It exposes one global function, analyzeClaim,
// which takes the claim text and returns a Promise that resolves to a
// result object. Nothing else in the app knows or cares how the result
// is produced.
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
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve({
        claim: text && text.trim() ? text.trim() : "(no claim entered)",
        type: "Prediction",
        status: "Mixed or uncertain",
        explanation:
          "This restates a forecast rather than an established fact, so it can't be simply " +
          "true or false yet. Some supporting signals exist, but they rely on assumptions that " +
          "could easily break in either direction.",
        considerations: [
          "Check what timeframe the claim assumes, and whether that timeframe is realistic.",
          "Look for who benefits from the claim being believed — that can hint at bias.",
          "See whether similar past predictions actually panned out."
        ],
        tension:
          "Optimism about progress is in tension with caution about overpromising."
      });
    }, 900);
  });
}
