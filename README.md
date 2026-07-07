# Claim Breakdown

A small personal practice project: paste in a claim or statement and get it
broken down — what kind of claim it is, whether it's supported, how confident
that assessment is, and a bit of the reasoning and framing around it. Built
with plain HTML/CSS/JS on the frontend and a single Vercel serverless
function that calls the Gemini API on the backend. No framework, no build
step.

Bilingual: Hebrew (default) and English, with the whole UI mirroring
(RTL/LTR) and the analysis itself coming back in whichever language is
active.

**Demo only — not a real fact-checker.** The disclaimer on the page means it.

## How it works

1. You paste a claim into the textarea (or click one of the example chips)
   and press "Break it down" / "פרקו את הטענה".
2. The frontend calls `POST /api/analyze` with the claim text and the
   current language (`"he"` or `"en"`).
3. That serverless function calls Gemini's `generateContent` endpoint
   (`gemini-3.5-flash`), forcing a structured JSON response via
   `responseSchema` / `responseMimeType: "application/json"` rather than
   just asking for JSON in the prompt. The system prompt tells the model
   which language to write the free-text fields in; the categorical fields
   (type/assessment/confidence) always come back as one of a fixed set of
   English option words, regardless of language — see below.
4. Gemini's response is parsed and returned to the frontend, which renders
   it as a card: the claim restated, a type badge, an assessment badge, a
   confidence level with a one-sentence reason, and the rest (evidence
   basis, steelman, strawman warning, values in tension, what would change
   the assessment) tucked into collapsed-by-default sections so it doesn't
   read as a wall of text.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure only — chips, input, buttons, language toggle, empty slots for the result card and error message. No hardcoded user-facing text; everything is populated from `translations.js` at load time. |
| `translations.js` | The single source of truth for every user-facing string (`TRANSLATIONS.he` / `TRANSLATIONS.en`): labels, buttons, chips, section titles, badge display labels, error messages, the disclaimer. |
| `styles.css` | All styling. Calm neutral palette, mobile-first single column, badge colors per type/assessment/confidence. Uses logical properties (`text-align: start`, `padding-inline-start`, flex layouts) instead of `left`/`right` so RTL mirroring is automatic, not a separate stylesheet. |
| `app.js` | Page logic: language state (reads/writes `localStorage`), wires up clicks, shows loading/error states, renders the result card and the language toggle. Doesn't know how the analysis is produced. |
| `analyzeClaim.js` | The only file that talks to the backend. Calls `/api/analyze` with the claim and current language, and returns a Promise that resolves to the result object or rejects with an `Error` carrying a `.code` (not English text) — `app.js` looks that code up in `translations.js` to decide what to show. |
| `api/analyze.js` | Vercel serverless function. Validates the incoming claim and language, calls Gemini with a language-aware system prompt and a JSON schema, retries on `503` (model overloaded), and normalizes errors (as codes, not final display text) before responding. |
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

## Language support

Hebrew is the default; a small always-visible toggle in the header
("עברית / English") switches to English. How it fits together:

- **`translations.js`** holds every string, keyed by language, plus a map
  from each schema enum value (e.g. `"Mostly supported"`) to its display
  label in each language. Badge *classification* (which color a badge
  gets) always switches on the raw English schema value from the API;
  only the *label shown* is translated.
- **`app.js`** reads the saved choice from `localStorage`
  (`claimBreakdownLang`), defaulting to Hebrew on a first visit, and sets
  `document.documentElement.lang` / `dir` accordingly (`he`/`rtl` or
  `en`/`ltr`) whenever the language changes. Switching languages clears
  any currently-shown result or error, since its labels were generated in
  the other language and would no longer match.
- **`styles.css`** uses logical CSS properties (`text-align: start`,
  `padding-inline-start`, flexbox with `justify-content`) instead of
  `left`/`right`/`margin-left`, so the layout mirrors automatically under
  `dir="rtl"` with no separate RTL stylesheet.
- **Mixed-direction text** (an English claim quoted inside Hebrew UI, or
  vice versa) is handled with `dir="auto"` (plus a CSS `unicode-bidi:
  isolate` rule) on the claim textarea and on every model-generated text
  element in the result card, so each block picks its own base direction
  instead of inheriting the page's.
- **The analysis language** is a request parameter, not a client-side
  translation: `analyzeClaim(text, lang)` sends `lang` to `/api/analyze`,
  which folds it into the Gemini system prompt ("write the free-text
  fields in Hebrew/English; the categorical fields stay in their fixed
  English option words"). So a Hebrew analysis is generated in Hebrew by
  Gemini, not machine-translated afterward.

## Error handling

`api/analyze.js` never leaks raw upstream errors to the browser, and never
decides the exact wording shown to the user — it returns a short `error`
*code* (`rate_limited`, `model_overloaded`, `bad_request`,
`upstream_unreachable`, `upstream_error`, `no_result`, `invalid_response`,
`server_misconfigured`) plus an English `message` that's really just for
server-side logs. `analyzeClaim.js` turns HTTP failures into an `Error`
carrying that code, and `app.js` looks the code up in
`translations.js`'s `errors` map to show it in the current language,
falling back to a generic translated message for any unrecognized code
(and to a `network_error` code if the request never reached the server at
all).

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

There's no separate build step — `index.html`/`styles.css`/`translations.js`/
`app.js`/`analyzeClaim.js` are served as static files, and `api/analyze.js`
is auto-detected as a serverless function by its location under `api/`.
