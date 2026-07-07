# Claim Breakdown

A small personal practice project: paste in a claim, a promise, or a whole
paragraph and get it broken down into its individual claims, each typed,
assessed, and — where it's a checkable factual/causal claim — checked
against real web sources via Gemini's Google Search grounding. Renders as
a dashboard: an overall verdict strip with four "epistemic profile" dials,
a card per claim showing only the analysis modules relevant to its type,
and an evidence rail of real, tiered sources. Plain HTML/CSS/JS on the
frontend, two Vercel serverless functions on the backend. No framework,
no build step.

Bilingual: Hebrew (default) and English, with the whole UI mirroring
(RTL/LTR) and the analysis itself coming back in whichever language is
active.

**Demo only — not a real fact-checker.** The disclaimer on the page means it.

## How it works

1. You paste text into the textarea (or click an example chip) and press
   "Break it down" / "פרקו את הטענה". The button label walks through two
   honest phases — "breaking down the claim" then "checking sources" —
   because this is genuinely two network calls, not one long spinner.
2. **`POST /api/triage`** (Call 1, no grounding): decomposes the input
   into 1-5 atomic claims and types each one as `Empirical`, `Causal`,
   `Prediction-or-promise`, `Normative`, or `Mixed`. For any `Normative`
   claim, it also extracts embedded factual premises as *additional*
   atomic claims in the same list (typed `Empirical`/`Causal`), with the
   `Normative` entry pointing at them via `premiseIds`. E.g. "this unfair
   law raised unemployment" becomes a `Normative` claim ("...is unfair")
   plus a linked `Empirical` claim ("...raised unemployment").
3. **`POST /api/evidence`** (Call 2, one Gemini call per claim): produces
   the full analysis for every claim from step 2. `Empirical`/`Causal`
   claims get Gemini's Google Search grounding tool enabled *in the same
   call* as the `responseSchema` (this combination only works on Gemini
   3+ models, which `gemini-3.5-flash` is); `Prediction-or-promise`/
   `Normative`/`Mixed` claims are analyzed just as deeply but without
   grounding, since there's nothing to search-check in a value judgment
   or an unresolved future.
4. The frontend combines both responses into one dashboard: a verdict
   strip, a card per claim, and an evidence rail. See **Dashboard**
   below.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure only — chips, input, language toggle, history panel, and empty slots for the verdict strip / claim cards / evidence rail / error message. No hardcoded user-facing text; everything comes from `translations.js`. |
| `translations.js` | The single source of truth for every user-facing string, keyed by language: labels, section titles, badge display labels (mapped from the API's fixed English enum/type values), epistemic-profile dial names/levels/justification templates, source tier labels, error messages (by code), history/disclaimer text. |
| `styles.css` | Calm neutral palette, badge colors per type/assessment/confidence/source-tier. Logical properties throughout (`text-align: start`, `padding-inline-start`, flex/grid) so RTL mirrors automatically. From ~900px up, the dashboard becomes a fixed-height shell (header/input/verdict stay put) with the claims column and evidence rail scrolling independently; below that it's a normal stacked, scrolling mobile page. |
| `app.js` | Page logic: language state, the two-phase loading label, rendering the verdict strip/dials/claim cards/evidence rail, and the localStorage history panel. Doesn't know how the analysis is produced. |
| `analyzeClaim.js` | The only file that talks to the backend. Calls `/api/triage` then `/api/evidence`, reports progress via an `onProgress` callback, and combines both responses into `{ claims, epistemicProfile, overallAssessment }` — `app.js` never sees that this is two calls. Also computes the epistemic profile (see below). Rejects with an `Error` carrying a `.code`, never English text. |
| `api/triage.js` | Call 1 — decomposition + typing + premise extraction. |
| `api/evidence.js` | Call 2 — per-claim grounded/ungrounded analysis, with a same-claim fallback (grounded → ungrounded) if the grounding-tool call itself fails, and a "zero sources found → force `Not enough information`" safety net. |
| `api/_lib/gemini.js` | Shared by both routes (underscore-prefixed so Vercel doesn't treat it as a route itself): the retry-on-503 Gemini caller, source-tiering domain heuristic, and shared enums/constants. |
| `vercel.json` | Per-function `maxDuration` — 20s for triage, 45s for evidence (grounded calls plus the ungrounded-fallback retry need real headroom). |
| `.env.example` | Template for the one required environment variable, `GEMINI_API_KEY`. Copy to `.env` for local testing — never commit the real key. |
| `package.json` | Just pins `node >= 18` (both functions rely on the built-in global `fetch`). |

## Claim types and the module map

Every claim gets the base fields (`claimText`, `type`, `assessment`,
`confidence` + `confidenceReason`, `whatWouldChangeAssessment`). Beyond
that, **which fields exist is what determines what renders** — the
frontend gates every section on field presence, not on `claim.type`. This
is deliberate: it's the same mechanism that makes old/partial history
entries render safely (see History below), and it's enforced upstream by
`api/evidence.js` using a different, narrower `responseSchema` per type
(Gemini's structured output doesn't reliably support `oneOf`-style
conditional schemas, so each type gets its own fixed shape):

- **Empirical**: `evidenceSummary`, `denominatorCheck` (compared to
  what — absolute vs. per-capita, timeframe), `precisionCheck`
  (falsifiable or vague), `sources[]`, `grounded`.
- **Causal**: `evidenceSummary`, `alternativeExplanations[]`,
  `correlationCautionNeeded` + `correlationCautionNote`,
  `distinguishingEvidence`, `sources[]`, `grounded`.
- **Prediction-or-promise**: `referenceClassAndBaseRate`, `feasibility`.
  `assessment` is *hardcoded* to `"Outcome not yet knowable"` by the code
  after the call, never asked of the model — "never true/false" is
  guaranteed, not hoped for. Never grounded.
- **Normative**: `tension`, `steelman`, `strawmanWarning`, `premiseIds[]`
  (pointing at any extracted factual-premise claims elsewhere in the same
  result set). Never grounded.
- **Mixed**: base fields only — for claims that genuinely fuse more than
  one of the above and can't be cleanly split.

The `assessment` enum itself has 7 values: `Supported`, `Mostly
supported`, `Mixed or context-dependent`, `Contradicted`, `Not enough
information`, `Not empirically assessable`, `Too recent to assess` — plus
the Prediction-only hardcoded `Outcome not yet knowable`.

## Grounding: how it actually behaves

- The grounded call includes both `tools: [{ google_search: {} }]` and
  `generationConfig.responseSchema` in one request — confirmed working in
  live testing (this combination is Gemini-3+-only; older models reject
  it outright).
- **Gemini's grounding `uri` is an opaque Google redirect link**
  (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`), not the
  real source URL — it still works as a click-through, but its hostname
  is useless for tiering or display. In practice the grounding chunk's
  `title` reliably comes back as the bare real domain (`"cbs.gov.il"`,
  not a headline) — `sourceDomain()` in `api/_lib/gemini.js` prefers that,
  falling back to parsing `uri` only if `title` isn't domain-shaped.
- **Source tiering is a domain heuristic, not a model self-report** —
  Primary official (`gov.il`/`.gov`/CBS/Bank of Israel/Knesset/State
  Comptroller/courts), Academic (`.ac.il`/`.edu`/etc.), Established
  journalism (a hand-kept list of Israeli and major international
  outlets), Fact-check org, else Other. Verified live: `bls.gov` and
  `nih.gov` correctly tier as Primary official via the generic `.gov`
  suffix; `ynet.co.il`/`cbs.gov.il`/`calcalist.co.il` correctly showed up
  for Hebrew claims, confirming the "prefer Hebrew/Israeli sources"
  prompt instruction actually works.
- **Grounding may be unavailable on some tiers** — it returned 429s with
  "check your plan and billing" independent of the normal free-tier
  `generateContent` quota until billing was enabled. `api/evidence.js`
  handles this per-claim: if the grounded call fails, it retries the
  *same claim* once without `tools`, marks the result `grounded: false`,
  and the frontend shows a "not source-checked, general-knowledge only"
  note — never silent fabricated confidence.
- **If grounding succeeds but finds zero sources**, the code forces
  `assessment: "Not enough information"` regardless of what the model
  said, and appends a note — a code-level guarantee, not model
  self-regulation.
- **Recency rule** ("too recent to assess" unless 2+ independent sources
  postdating the claim corroborate) is instruction-only — there's no
  reliable published-date field on grounding chunks to check
  programmatically. Verified live with a same-day claim: the model
  correctly used grounding to find current, dated primary sources and
  confidently *contradicted* the claim rather than reflexively hiding
  behind "too recent" — the rule is meant to catch thin/overconfident
  corroboration, not suppress a genuinely well-evidenced answer.
- Output tokens are budgeted generously (3072 for evidence calls) —
  during testing the Causal/Empirical schemas' several full-sentence
  fields genuinely truncated mid-JSON at a lower budget, which fails
  `JSON.parse` outright. Worth remembering if new fields are added later.

## Epistemic profile

Four dials, computed **in code** from the triage + evidence results —
deliberately not a third Gemini call, so the architecture stays "two
model calls" with no added latency/cost:

- **checkability** — `settled-by-evidence` / `partially` /
  `values-or-prediction`, from the Empirical+Causal share of claims.
- **evidenceStrength** — `strong` / `mixed-or-thin` / `none-found` /
  `not-applicable`, from how many grounded-eligible claims actually came
  back with real sources.
- **precision** — `specific-and-falsifiable` / `somewhat-vague` /
  `unfalsifiable`, from claim count and type mix.
- **analysisConfidence** — `high` / `medium` / `low`, weakest-link over
  every claim's own `confidence` (one Low claim pulls the whole dial
  down).

No numeric score anywhere — each dial is a 3-way categorical level plus a
translated, templated one-line justification.

## Dashboard

- **Verdict strip**: overall assessment (all claims agree → that value,
  else `Mixed or context-dependent`) plus the four dials as plain labeled
  3-segment indicators — explicitly no gauges/needles. Each dial is a
  `<details>` (tap to reveal its justification), reusing the same
  collapsible pattern as the claim card sections.
- **Desktop** (~900px+): a 2-column grid — claim cards (main) and an
  evidence rail (sources grouped by claim, sorted by tier). The page
  scrolls normally (same mechanism as mobile — proven robust); the
  evidence rail is `position: sticky` with a viewport-relative
  `max-height`, so it stays in view and scrolls independently as you
  read down through claims. This replaced an earlier fixed-height
  flex-shell attempt at a stricter "nothing but two inner regions
  scrolls" layout, which silently collapsed the claims column to a few
  px (with all its content still there, just unreachable) whenever the
  verdict strip's natural height left it no room — sticky positioning
  can't be squeezed to zero the same way, since it isn't negotiating
  space with siblings.
- **Mobile**: verdict layer (dials as a 2×2 grid), then claim cards
  stacked, each with its own "Sources (n)" expander instead of a shared
  rail.
- **History** (new): every analysis is saved to `localStorage`
  (`claimBreakdownHistory`, capped at 20), and a panel near the input
  lists past submissions for one-click re-render with no new API call.
  Because rendering is gated by field presence rather than a schema
  version check, older or partial stored entries just render whatever
  fields they have and silently skip the rest — verified with a
  hand-seeded legacy-shaped entry.

## Error handling

Both `api/triage.js` and `api/evidence.js` return a short `error` *code*
(`rate_limited`, `model_overloaded`, `bad_request`, `upstream_unreachable`,
`upstream_error`, `no_result`, `invalid_response`, `server_misconfigured`)
plus an English `message` that's only for server-side logs. `analyzeClaim.js`
turns HTTP failures into an `Error` carrying that code (or `network_error`
if the request never reached the server at all); `app.js` looks the code
up in `translations.js` to show it in the current language. Per-claim
failures inside `api/evidence.js` (one claim's Gemini call erroring) don't
fail the whole request — `Promise.allSettled` isolates them, and that one
claim's card shows a distinct "analysis failed" state instead of a
fabricated result.

- **429** → free-tier rate limit message.
- **503** → retried automatically up to 3 attempts with backoff (600ms,
  1200ms) before falling back to a "heavy load, try again" message.
- Anything else → a generic "something went wrong" message; the real
  detail is only in Vercel's function logs.

## Running it

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
   Grounding specifically may require billing enabled on that project —
   plain analysis works on the free tier regardless.
2. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY` for local
   testing, or set it in your Vercel project's environment variables for
   deployment.
3. Deploy with Vercel (Git-connected project, or `vercel --prod`).

There's no separate build step — the frontend files are served as
static files, and `api/triage.js`/`api/evidence.js` are auto-detected as
serverless functions by their location under `api/` (`api/_lib/` is
excluded by Vercel's underscore-prefix convention).
