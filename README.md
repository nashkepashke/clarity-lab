# Claim Breakdown

A small personal practice project: paste in a claim or statement and get it
broken down — what kind of claim it is, whether it's supported, how confident
that assessment is, and a bit of the reasoning and framing around it. Built
with plain HTML/CSS/JS on the frontend and a single Vercel serverless
function that calls the Gemini API on the backend. No framework, no build
step.

**Demo only — not a real fact-checker.** The disclaimer on the page means it.

## How it works

1. You paste a claim into the textarea (or click one of the example chips)
   and press "Break it down".
2. The frontend calls `POST /api/analyze` with the claim text.
3. That serverless function calls Gemini's `generateContent` endpoint
   (`gemini-3.5-flash`), forcing a structured JSON response via
   `responseSchema` / `responseMimeType: "application/json"` rather than
   just asking for JSON in the prompt.
4. Gemini's response is parsed and returned to the frontend, which renders
   it as a card: the claim restated, a type badge, an assessment badge, a
   confidence level with a one-sentence reason, and the rest (evidence
   basis, steelman, strawman warning, values in tension, what would change
   the assessment) tucked into collapsed-by-default sections so it doesn't
   read as a wall of text.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure only — chips, input, buttons, empty slots for the result card and error message. |
| `styles.css` | All styling. Calm neutral palette, mobile-first single column, badge colors per type/assessment/confidence. |
| `app.js` | Page logic: wires up clicks, shows loading/error states, renders the result card. Doesn't know how the analysis is produced. |
| `analyzeClaim.js` | The only file that talks to the backend. Calls `/api/analyze` and returns a Promise that resolves to the result object or rejects with a user-safe `Error`. Nothing else in the frontend knows this is a network call. |
| `api/analyze.js` | Vercel serverless function. Validates the incoming claim, calls Gemini with a system prompt and a JSON schema, retries on `503` (model overloaded), and normalizes errors before responding. |
| `vercel.json` | Gives `api/analyze.js` a longer execution window (`maxDuration: 30`) so its retry-with-backoff logic has room to run. |
| `.env.example` | Template for the one required environment variable, `GEMINI_API_KEY`. Copy to `.env` for local `vercel dev` use — never commit the real key. |
| `package.json` | Just pins `node >= 18` (the serverless function relies on the built-in global `fetch`). |

## The result schema

Gemini is asked to return exactly these fields (enforced by `responseSchema`,
not just prompted for):

- `claim` — the claim restated in plain, neutral language
- `type` — `Factual` / `Causal` / `Prediction` / `Opinion or value judgment` / `Mixed`
- `assessment` — `Supported` / `Mostly supported` / `Mixed or context-dependent` / `Contradicted` / `Not enough information` / `Not empirically assessable`
- `confidence` — `Low` / `Medium` / `High`
- `confidenceReason` — one sentence on why that confidence level
- `evidenceBasis` — 2-3 bullets on what kind of evidence bears on the claim
- `steelman` — the strongest, fairest version of the claim's position
- `strawmanWarning` — the distorted version people are likely to argue against
- `tension` — which values/priorities the claim serves vs. presses against
- `whatWouldChangeAssessment` — what new evidence would change the assessment

The system prompt explicitly forbids numeric scores and fabricated sources
or statistics, and tells the model to say "not assessable" rather than
guess.

## Error handling

`api/analyze.js` never leaks raw upstream errors to the browser. It maps
Gemini's response to one of a small set of error codes/messages:

- **429** (rate limited) → a specific "you're on the free tier, wait a
  moment" message.
- **503** (model overloaded) → retried automatically up to 3 attempts with
  a short backoff (600ms, 1200ms) before falling back to a "heavy load,
  try again" message.
- Anything else upstream, a network failure reaching Gemini, a
  non-JSON/malformed model response, or a safety block → a generic
  "something went wrong" message. The real detail is only logged
  server-side (visible in Vercel's function logs), never sent to the
  client.

## Running it

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY` (for local dev
   with `vercel dev`), or set it in your Vercel project's environment
   variables (for deployment).
3. Deploy with Vercel (Git-connected project, or `vercel --prod`), or run
   `vercel dev` locally.

There's no separate build step — `index.html`/`styles.css`/`app.js`/
`analyzeClaim.js` are served as static files, and `api/analyze.js` is
auto-detected as a serverless function by its location under `api/`.
