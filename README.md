# Claim Breakdown

A small personal practice project: paste in a claim, a promise, or a whole
paragraph and get it broken down into its individual claims, each typed,
assessed, and — where it's a checkable factual/causal claim — checked
against real web sources via Gemini's Google Search grounding. Renders as
a dashboard: a plain-language bottom-line verdict with a traffic-light
share/don't-share recommendation, an overall verdict strip with four
"epistemic profile" dials, a card per claim showing only the analysis
modules relevant to its type, and an evidence rail of real, tiered
sources. Plain HTML/CSS/JS on the frontend, four Vercel serverless
functions on the backend. No framework, no build step.

Bilingual: Hebrew (default) and English, with the whole UI mirroring
(RTL/LTR) and the analysis itself coming back in whichever language is
active.

**Demo only — not a real fact-checker.** The disclaimer on the page means it.

## How it works

1. You paste text into the textarea (or click an example chip) — or paste
   a screenshot with Ctrl+V, drag-and-drop one, or use the upload button
   (which also opens the camera roll on mobile). An attached image first
   goes through a separate **`POST /api/extract`** call that transcribes
   whatever claim/statement is in it into the same textarea, editable,
   with a "is this the claim?" prompt — you review/edit it and press the
   button again to actually analyze it. See **Image input** below.
2. Press "Break it down" / "פרקו את הטענה". The button label walks through
   three honest phases — "breaking down the claim", "checking sources",
   then "summarizing the verdict" — because this is genuinely three
   sequential network calls, not one long spinner.
3. **`POST /api/triage`** (Call 1, no grounding): decomposes the input
   into 1-5 atomic claims and types each one as `Empirical`, `Causal`,
   `Prediction-or-promise`, `Normative`, or `Mixed`. For any `Normative`
   claim, it also extracts embedded factual premises as *additional*
   atomic claims in the same list (typed `Empirical`/`Causal`), with the
   `Normative` entry pointing at them via `premiseIds`. E.g. "this unfair
   law raised unemployment" becomes a `Normative` claim ("...is unfair")
   plus a linked `Empirical` claim ("...raised unemployment").
4. **`POST /api/evidence`** (Call 2, one Gemini call per claim): produces
   the full analysis for every claim from step 2. `Empirical`/`Causal`
   claims get Gemini's Google Search grounding tool enabled *in the same
   call* as the `responseSchema` (this combination only works on Gemini
   3+ models, which `gemini-3.5-flash` is); `Prediction-or-promise`/
   `Normative`/`Mixed` claims are analyzed just as deeply but without
   grounding, since there's nothing to search-check in a value judgment
   or an unresolved future.
5. **`POST /api/verdict`** (Call 3, ungrounded, only reached if at least
   one claim from step 4 analyzed successfully): synthesizes the whole
   submission's per-claim results into one plain-language bottom line — a
   `verdictType` from a fixed 9-value enum plus an optional short custom
   clause. A failure here is caught and swallowed, not propagated — the
   detailed per-claim analysis is already complete and useful on its own,
   so this degrades to no bottom line rather than failing the whole
   request. See **Bottom line** below.
6. The frontend combines all three responses into one dashboard: the
   bottom line, a verdict strip, a card per claim, and an evidence rail.
   See **Dashboard** below.

## Image input

Three ways to attach an image: Ctrl+V paste into the textarea, drag-and-drop
onto the input card, or the upload button's file picker (a plain
`accept="image/png,image/jpeg,image/webp"` input with no `capture`
attribute — that's what lets mobile browsers show the full picker,
camera roll included, rather than forcing the camera).

- **Client-side validation and downscaling happen before anything is
  sent.** Only PNG/JPEG/WEBP are accepted; anything over ~4MB is rejected
  outright with a translated message. Images are re-encoded through a
  canvas (capped at 1600px on the longest side, JPEG quality 0.85)
  whenever they're either over that dimension *or* over ~800KB — the
  dual condition matters because a small-dimension but poorly-compressed
  file could still produce a large base64 payload otherwise. This isn't
  just about staying under the 4MB original-file cap: base64-encoding
  adds ~33% overhead, so a barely-under-4MB original could otherwise
  become a JSON body large enough to risk Vercel's request size limit.
- **Two visible steps, using the same button.** Attaching an image
  changes the analyze button's idle label to "Read the image" — clicking
  it calls `POST /api/extract` (not triage/evidence) and, on success,
  populates the *existing* textarea with the transcribed text plus a
  small "Is this the claim? Edit if needed" prompt, then reverts the
  button to its normal "Break it down" label. The next click runs the
  real, completely unchanged triage → evidence pipeline on whatever's now
  in the box. No new UI surface was needed for the "editable box" or the
  "user confirms before analysis runs" requirements — both fall out of
  reusing the textarea and the existing button as a small state machine.
- **`api/extract.js`** sends the image to Gemini as an inline part
  (`callGeminiJSON`'s new optional `imageParts`) alongside a
  `responseSchema` of `{ found: boolean, extractedText: string }` and an
  instruction to transcribe verbatim, in whatever language the image's
  text is actually in — not translate it, even though the instruction
  itself is phrased in the UI language. If `found` is false (or
  `extractedText` comes back empty), the endpoint returns 422 with error
  code `no_claim_found` rather than ever forwarding a fabricated string.
  Verified live with three real cases: a generated Hebrew WhatsApp-style
  screenshot (correctly transcribed the claim verbatim in Hebrew,
  stripped the sender name and timestamp), a generated English
  tweet-style screenshot (correctly transcribed the body, stripped the
  handle/avatar), and a plain gradient image with no text (correctly
  returned `no_claim_found`, invented nothing).
- **History only ever stores the extracted text, never the image** —
  and this required no special-case code. `pushHistoryEntry` already
  only reads `claimInput.value` at the moment analysis runs, which by
  then is always the transcribed (and possibly hand-edited) text; the
  attached image's base64 data lives in an in-memory variable that's
  never passed anywhere near `localStorage`. Verified live: a full
  image→extract→analyze run produced a history entry with no `base64`
  substring anywhere in the stored JSON.
- **New translated failure states**: `file_too_large`,
  `unsupported_file_type`, `unreadable_image` (client-side only — the
  browser couldn't decode the file), `no_claim_found`, and
  `extraction_failed` (a context-appropriate fallback used only when no
  more specific code matches — the existing `rate_limited`/
  `model_overloaded`/etc. codes are reused as-is for extraction failures
  they actually describe, same translated messages as the main pipeline).
  A `no_claim_found` result deliberately leaves the image attached (not
  cleared) so the user can retry or try a different picture without
  re-uploading from scratch.
- **Two real bugs found by actually rendering the UI, not just
  asserting on DOM attributes:** first, `.image-preview`'s CSS had the
  same cascade pitfall already hit twice before for `#dashboard-area`
  and `.evidence-rail` — a `display: flex` rule with no `:not([hidden])`
  guard has equal specificity to (and comes after) the `[hidden]`
  attribute's own UA-stylesheet rule, so setting `.hidden = true` in JS
  didn't actually hide it. A screenshot caught this even though the test
  suite's `getAttribute(el, "hidden")` checks all passed — attribute
  presence isn't the same as visual state, and the tests were fixed to
  use `page.isVisible()` instead. Second, the new upload button/hint row
  added just enough height to push the verdict strip a few px past the
  desktop no-scroll goal at 900px viewport height — fixed by hiding the
  hint line (button stays) once a result exists, the same "reclaim space"
  treatment already applied to the textarea, plus small proportionate
  trims to `.page-header`/`.verdict-strip` padding rather than one
  drastic cut.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure only — chips, input, language toggle, history panel, and empty slots for the bottom line / verdict strip / claim cards / evidence rail / error message. No hardcoded user-facing text; everything comes from `translations.js`. `<head>` also loads the two Google Fonts used by `styles.css` (see **Visual design**). |
| `translations.js` | The single source of truth for every user-facing string, keyed by language: labels, section titles, badge display labels (mapped from the API's fixed English enum/type values), epistemic-profile dial names/levels/justification templates, verdict-type base sentences/rationales/action labels, framing-signal labels, source tier labels, error messages (by code), history/disclaimer text. |
| `styles.css` | An editorial/think-tank visual system: a Frank Ruhl Libre serif for headline moments paired with Assistant (Hebrew/Latin humanist sans) everywhere else, a named type/spacing scale, a warm-paper/ink/single-accent palette with WCAG-checked desaturated traffic-light colors, badge colors per type/assessment/confidence/source-tier. See **Visual design**. Logical properties throughout (`text-align: start`, `padding-inline-start`, flex/grid) so RTL mirrors automatically. From ~900px up, the dashboard becomes a fixed-height shell (header/input/verdict stay put) with the claims column and evidence rail scrolling independently; below that it's a normal stacked, scrolling mobile page. |
| `app.js` | Page logic: language state, the three-phase loading label, rendering the bottom line/verdict strip/dials/claim cards/evidence rail, `VERDICT_ACTION_MAP` (the auditable verdictType→traffic-light table), and the localStorage history panel. Doesn't know how the analysis is produced. |
| `analyzeClaim.js` | The only file that talks to the backend. Calls `/api/triage`, then `/api/evidence`, then (if at least one claim succeeded) `/api/verdict`, reports progress via an `onProgress` callback, and combines all three responses into `{ claims, epistemicProfile, overallAssessment, verdict }` — `app.js` never sees that this is three calls. Also computes the epistemic profile (see below). A `/api/verdict` failure is caught and degrades to `verdict: null` rather than failing the request. Rejects with an `Error` carrying a `.code`, never English text. |
| `api/triage.js` | Call 1 — decomposition + typing + premise extraction. |
| `api/evidence.js` | Call 2 — per-claim grounded/ungrounded analysis, with a same-claim fallback (grounded → ungrounded) if the grounding-tool call itself fails, and a "zero sources found → force `Not enough information`" safety net. |
| `api/extract.js` | Image-to-claim transcription — a separate, ungrounded call, not part of the triage/evidence pipeline. See **Image input**. |
| `api/verdict.js` | Call 3 — synthesizes the finished per-claim results into one `verdictType` + optional `customClause`. See **Bottom line**. |
| `api/_lib/gemini.js` | Shared by all four routes (underscore-prefixed so Vercel doesn't treat it as a route itself): the retry-on-503 Gemini caller, source-tiering domain heuristic, shared enums/constants, and `callGeminiJSON`'s optional `imageParts` (inline image data) support. |
| `vercel.json` | Per-function `maxDuration` — 20s for triage, 45s for evidence (grounded calls plus the ungrounded-fallback retry need real headroom), 20s for extract, 20s for verdict. |
| `.env.example` | Template for the one required environment variable, `GEMINI_API_KEY`. Copy to `.env` for local testing — never commit the real key. |
| `package.json` | Just pins `node >= 18` (the functions rely on the built-in global `fetch`). |

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
  (falsifiable or vague), `mostRelevantSourceCheck` (names the single
  most-relevant source type/body for *this* claim — e.g. "the CBS Labour
  Force Survey" — and says plainly whether search actually surfaced it,
  closing the gap between a source sounding authoritative and it actually
  being checked), `missingContext` (the single most important missing
  piece of context/data that would most change how the claim reads),
  `sources[]`, `grounded`.
- **Causal**: `evidenceSummary`, `alternativeExplanations[]`,
  `correlationCautionNeeded` + `correlationCautionNote`,
  `distinguishingEvidence`, `mostRelevantSourceCheck`, `missingContext`,
  `sources[]`, `grounded`.
- **Prediction-or-promise**: `referenceClassAndBaseRate`, `feasibility`.
  `assessment` is *hardcoded* to `"Outcome not yet knowable"` by the code
  after the call, never asked of the model — "never true/false" is
  guaranteed, not hoped for. Never grounded.
- **Normative**: `tension`, `steelman`, `strawmanWarning`, `premiseIds[]`
  (pointing at any extracted factual-premise claims elsewhere in the same
  result set). Never grounded.
- **Mixed**: base fields only — for claims that genuinely fuse more than
  one of the above and can't be cleanly split.

Every type (including Mixed) can also carry `framingSignals[]` — neutral,
observable-only flags for how the claim is *framed*, not its content:
`missing_baseline`, `cherry_picked_timeframe`, `false_binary`,
`emotional_intensification`, `anecdote_as_data`, `unsourced_authority`,
each with a one-line note. The model is instructed that an empty array is
the normal, expected answer for a plainly-stated claim — these are meant
to flag real issues, not pad every result with manufactured caution.

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
- Output tokens are budgeted generously (4096 for evidence calls, raised
  from 3072 when `framingSignals`/`mostRelevantSourceCheck`/
  `missingContext` were added) — during testing the Causal/Empirical
  schemas' several full-sentence fields genuinely truncated mid-JSON at a
  lower budget, which fails `JSON.parse` outright. The same trap bit
  `api/verdict.js` too: its actual JSON output is tiny (one enum value
  plus a short clause), but a "thinking" model's internal reasoning still
  eats into `maxOutputTokens` before it ever writes that output, so a
  512-token budget failed most real multi-claim inputs outright in live
  testing — raised to 2048. Worth remembering for any future field or
  endpoint: the visible JSON size is not a reliable guide to the token
  budget it actually needs.

## Epistemic profile

Four dials, computed **in code** from the triage + evidence results —
deliberately not an extra Gemini call on top of triage + evidence, unlike
the bottom line below (which genuinely does need one — see why there):

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

## Bottom line: verdict sentence + traffic-light action

Unlike the epistemic profile above, this **is** a third Gemini call
(`api/verdict.js`) rather than code-only aggregation — deliberately so.
Picking `well_supported` vs. `partly_true_missing_context` vs.
`likely_unfounded` vs. `unfalsifiable_polarizing` needs to weigh
assessment, confidence, framing signals, and claim-type mix holistically,
the same kind of judgment call the epistemic-profile dials are simple
counts/categoricals for. It's a separate endpoint rather than embedded
inside `api/evidence.js`, matching this app's existing philosophy of
honest, distinct phases and keeping `api/evidence.js` — already the most
complex, most-tested file — untouched by this logic. No numeric score
here either: the model picks a `verdictType` from a fixed enum, never a
number, and the traffic-light *action* is never the model's call at all.

**The verdict type** (`verdictType`, plus an optional short `customClause`
for specificity) is one of 9 fixed values, each mapped to a translated
base sentence in `translations.js` — the model only ever picks the type,
never writes the sentence, which is what keeps the wording consistent and
fully translatable:

| verdictType | Example base sentence |
|---|---|
| `well_supported` | "This is a well-supported factual claim." |
| `contradicted` | "This claim is contradicted by the available evidence." |
| `partly_true_missing_context` | "This is partly true but leaves out important context." |
| `unfalsifiable_polarizing` | "This can't be proven or disproven — and it's framed in a polarizing way." |
| `likely_unfounded` | "There are several signs this claim is not factually grounded." |
| `value_judgment` | "This is a value judgment, not a factual claim — reasonable people disagree." |
| `prediction` | "This is a prediction; its outcome isn't knowable yet." |
| `insufficient_info` | "There isn't enough reliable information to assess this." |
| `mixed_claims` | "The claims here paint a mixed picture — some hold up, some don't." |

`customClause` is a short trailing clause the model may add for
specificity (e.g. "confirmed by three independent government sources"),
appended directly after the base sentence — empty when the base sentence
already says enough. The system instruction explicitly distinguishes the
two easiest types to conflate: `contradicted` is for a direct,
clean-source contradiction; `likely_unfounded` is for multiple independent
warning signs (framing signals, no sources found, thin reasoning) adding
up to real doubt without one clean contradicting source.

**The action (traffic-light) is a single explicit, auditable lookup table
in `app.js`** (`VERDICT_ACTION_MAP`) — not model judgment, per design:

| verdictType | Color | Label |
|---|---|---|
| `well_supported` | 🟢 green | Safe to share |
| `contradicted` | 🔴 red | Don't spread this |
| `likely_unfounded` | 🔴 red | Don't spread this |
| `partly_true_missing_context` | 🟡 amber | Share with caution |
| `unfalsifiable_polarizing` | 🟡 amber | Share with caution |
| `insufficient_info` | 🟡 amber | Share with caution |
| `mixed_claims` | 🟡 amber | Share with caution |
| `value_judgment` | 🟡 amber | Opinion — judge for yourself |
| `prediction` | 🟡 amber | Opinion — judge for yourself |

`value_judgment` and `prediction` deliberately get their own label rather
than "share with caution" — the point for an opinion or an unresolved
prediction isn't share-worthiness, it's "form your own view." Color is
never the only signal: a plain Unicode glyph (✓ / ⚠ / ✕, matching this
app's existing icon-free convention) is always paired with the translated
label text.

**Feeding the synthesis call**: `api/verdict.js` builds a compact text
summary per claim (type, assessment, confidence, whether it was source-
checked, `framingSignals`, and — critically — `missingContext`) rather
than passing the full verbose per-claim objects, to keep the prompt small.
Leaving `missingContext` out of that summary was an actual bug caught in
live testing: a claim assessed `Supported` with a real, substantive
`missingContext` note (a wage-growth claim where part of the rise was a
war-driven statistical artifact) was still coming back `well_supported`,
because the verdict model never saw the missing-context note at all. Once
it was added to the summary, plus an explicit instruction that
`well_supported` requires *no* significant missing context, the same
claim correctly came back `partly_true_missing_context`.

**Verified live** against the model's own real judgment (not mocked) on
six scenarios in Hebrew — a solid factual claim, a false one, a
partly-true one, a polarizing-but-unfalsifiable one, a promise, and a
pure value claim — plus three English spot-checks, all landing on the
expected `verdictType` and the correspondingly correct traffic-light
color/label after the fixes above. One nuance worth noting: a Normative
claim is often paired with a factual premise `api/triage.js` extracted
from inside it (e.g. "this unfair law raised unemployment" → a Normative
claim plus a linked Empirical one) — the synthesis instruction explicitly
tells the model to let the Normative claim's own nature lead
(`value_judgment`) rather than defaulting to `mixed_claims` just because
two claims are present, since the premise is usually a supporting detail,
not an equally-weighted second topic.

**A `verdict: null`** (the synthesis call failed, or — for old history
entries — the field doesn't exist at all) simply hides the bottom-line
block; the rest of the dashboard renders exactly as it would otherwise.
Same field-presence-gating principle as everywhere else in this app.

## Visual design

A deliberate pass toward "quality editorial / think-tank," not a default
framework look — entirely a `styles.css` change (plus two font `<link>`
tags in `index.html`'s `<head>`); no analysis logic, verdict/action
mapping, or data model touched.

- **Type pairing**: a serif for the handful of headline moments, a sans
  for everything else — the classic editorial pairing, not two competing
  UI fonts. **Frank Ruhl Libre** (a refined literary serif with real
  Hebrew pedigree) for the page `<h1>` and — most importantly — the
  bottom-line verdict sentence, the one place on the page meant to read as
  a headline rather than a UI label. **Assistant** (a humanist sans
  purpose-built for Hebrew/Latin pairing) for every button, badge, label,
  and body of text. Both were chosen specifically for genuinely strong
  native Hebrew glyph coverage — not a Latin face hoping Hebrew falls back
  gracefully, which would have been a real correctness risk given Hebrew
  is this app's default language. Loaded via Google Fonts `<link>` tags
  with `display=swap` and `preconnect` hints rather than committing font
  binaries into the repo, keeping the "no build step, plain files" ethos
  intact at the cost of one third-party request — the right tradeoff at
  this project's scale. Verified live: `document.fonts.status` reports
  `"loaded"` and the computed `font-family` on both the heading and body
  resolve to the intended faces, not a silent system-font fallback.
- **Type scale and spacing scale**: both replaced with named CSS custom
  properties (`--fs-xs` through `--fs-2xl`, `--space-1` through
  `--space-8`) instead of scattered one-off `rem` values, for visible,
  intentional rhythm. Base body line-height moved from 1.5 → 1.6 — Hebrew
  reads more comfortably with more open leading than Latin typographic
  convention assumes — with long-form claim-card section body text up to
  1.7.
- **Palette**: the existing warm-paper background and dark-ink text were
  already doing their job and were kept; the accent deepened slightly
  toward "ink" rather than "corporate-SaaS blue," and the traffic-light
  functional colors (already desaturated, non-candy) were refined toward
  a forest/ochre/oxblood register. Every text-on-tint pairing that
  actually appears in the UI (badges, the bottom-line block in all three
  colors, category badges) was checked against WCAG AA programmatically
  (≥4.5:1 body text, ≥3:1 large/UI text) rather than eyeballed — all pass,
  most well above the minimum. Color was already never the only signal
  (icon glyph + translated label always accompany it); this pass didn't
  change that, only tightened the color values themselves.
- **The bottom line**, being the hero, got the most direct attention: a
  small colored eyebrow row (icon + micro-caps action label) sits above
  the verdict sentence set large in the serif with tight leading, with the
  rationale smaller and muted below — reading as a considered rating card,
  not an alert box. This is also the block most likely to blow the
  hard-won desktop no-scroll budget (it already has, twice, from far
  smaller changes) — re-verified at 1280/1440px in both languages after
  the redesign; it held without needing any padding trims this time.
- **Dials** kept their flat horizontal-segment concept (still no
  gauges/needles/emoji) but with a tighter, more architectural corner
  radius and cleaner micro-caps label typography. **Claim cards** got a
  serif italic treatment for the quoted claim text (a natural pull-quote
  convention), a two-layer shadow for real but still subtle elevation
  instead of the previous flat one, and more considered section-header
  typography. **Source cards** got a cleaner bordered favicon container
  and tier badges rendered as small refined micro-caps chips, aiming at
  "looks credible," per the goal.
- **Loading state**: a quiet, purely CSS sweep animation tied to the
  existing `:disabled` state on the analyze button — no JS/logic change,
  since the three phase labels already existed. **Motion** generally: a
  `@media (prefers-reduced-motion: reduce)` block (previously absent)
  neutralizes it and shortens the handful of other transitions. One real
  bug caught here: the bare universal selector (`*`) does **not** match
  `::before`/`::after` generated content — without listing them
  explicitly (`*, *::before, *::after`), the reduced-motion override would
  have silently left the loading sweep's `animation-duration` at full
  speed even though `prefers-reduced-motion: reduce` correctly matched.
  Caught by directly checking the pseudo-element's computed style in a
  Playwright context with `reducedMotion: "reduce"` set, not by assuming
  the universal selector worked as it reads.

## Dashboard

- **Bottom line**: the verdict sentence + traffic-light action (see
  above), rendered first — before the verdict strip, before the claim
  cards. A tinted background and a colored `border-inline-start` (so it
  mirrors correctly in RTL) match the traffic-light color. Gated on
  `verdict` being present; hidden entirely otherwise. On mobile this is
  simply the first card in the stack.
- **Verdict strip**: overall assessment (all claims agree → that value,
  else `Mixed or context-dependent`) plus the four dials as plain labeled
  3-segment indicators — explicitly no gauges/needles. Each dial is a
  `<details>` (tap to reveal its justification), reusing the same
  collapsible pattern as the claim card sections.
- **Desktop** (~900px+): a true no-scroll shell. `.page` is
  `height: 100vh` and a column flexbox; the header, input card, and
  disclaimer keep their natural size, and `#dashboard-area` (bottom line
  + verdict strip + the claim-cards/evidence-rail grid) is the one region
  that grows to fill what's left — with the bottom line and `.verdict-strip`
  staying natural-size inside it and `.dashboard-grid`'s row stretching to
  fill the remainder. `.claims-column` and `.evidence-rail` both get
  `overflow-y: auto`, so a long analysis scrolls *inside those two
  regions*, not the page — the verdict and all four dials stay visible
  the whole time. Verified: at 1280/1440px with a long 5-claim analysis
  *and* the bottom line visible, the bottom line, verdict strip, and all
  four dials render fully on-screen with zero scrolling, in both
  languages. Adding the bottom line block cost real height and briefly
  broke this goal by ~24px — re-closed with the same kind of small,
  proportionate trims as before (this time: the bottom line's own
  padding/margin, plus a further trim to `.verdict-strip`'s top margin)
  rather than one drastic cut, then re-verified.
  - Two things make this robust where an earlier attempt at the same
    idea wasn't. First, the flex-sizing rules are on `#dashboard-area`
    itself — the earlier version applied them to `.dashboard-grid`, but
    `.dashboard-grid`'s actual parent (`#dashboard-area`) was never
    itself made a flex container, so the rules were silently inert, and
    the region collapsed to a few px with its content still there but
    unreachable. Second, `.page` uses `overflow-y: auto`, not `hidden` —
    `.claims-column` has a `min-height: 240px` floor, so if some edge
    case (a very short window, a dial wrapping to two lines) ever leaves
    less room than that floor needs, the *page* gracefully gains a small
    scroll instead of clipping content into unreachability again.
    Verified directly: forcing the history panel open after a result
    exists (an edge case the auto-collapse below prevents in normal use)
    leaves `.claims-column` at its 240px floor and makes the page
    scrollable by the small excess, rather than losing content.
  - The input textarea drops to 2 rows once a result exists
    (`resize: vertical` still lets you drag it back open), and the
    history panel auto-collapses the moment a new analysis starts —
    together these are most of what makes the verdict/dials fit above
    the fold in the first place.
  - The evidence rail hides entirely (and claim cards take the full
    width) when no claim has grounded sources — an empty bordered box
    with nothing in it is clutter, not a module.
- **Mobile**: verdict layer (dials as a 2×2 grid), then claim cards
  stacked, each with its own "Sources (n)" expander instead of a shared
  rail. Below the 900px breakpoint the layout is just this single-column
  stack with normal page scrolling — no separate tablet layout; a 768px
  viewport falls into the same bucket rather than trying to force the
  desktop 2-column grid into a width too narrow to do it justice. Small
  interactive controls (`.lang-btn`, the history "Show again"/"Clear
  history" buttons, the history panel's own toggle) all have a
  `min-height: 34px` tap target.
- **History**: every successful analysis is saved to `localStorage`
  (`claimBreakdownHistory`, capped at 20 — oldest dropped first) as
  `{ savedAt, lang, originalText, data }`, where `data` is the *entire*
  combined result (`claims`, `epistemicProfile`, `overallAssessment`,
  `verdict`, every grounded source). `verdict` landed in storage with no
  extra code needed — `pushHistoryEntry` already stores whatever
  `analyzeClaim()` returns, and old entries from before this field existed
  just render with the bottom line hidden (see **Bottom line** above). A
  panel near the input lists entries newest
  first — truncated claim text, a relative timestamp ("2 hours ago",
  falling back to an absolute date past 30 days), and the overall
  assessment badge — and clicking one re-renders it instantly from
  `localStorage`, no new `/api/triage` or `/api/evidence` call. All
  `localStorage` reads/writes are wrapped in `try/catch`, so a full quota
  or a private-browsing mode that blocks storage just means history
  silently doesn't persist, never a crash. "Clear history" asks for
  confirmation first. A small always-visible note in the panel says
  history is local to this device/browser only.
  - **Renders in the language it was saved in, not the current UI
    language.** `renderDashboard(data, lang)` temporarily points the
    module-level `T` at `TRANSLATIONS[entry.lang]` for the duration of
    that render (then restores it) — a Hebrew-saved analysis still shows
    Hebrew badges and section labels even if you've since switched the
    toggle to English, since its free-text content only ever exists in
    the language Gemini generated it in; relabeling the chrome around it
    would produce an inconsistent mix, not a translation. The same
    per-entry language lookup applies to the assessment badge shown in
    the list preview. Panel chrome itself (the "Show again" button,
    relative-time phrasing, the privacy note) always follows the
    *current* UI language, since that's navigation, not restored content.
  - **Old/partial entries render safely** because every section is
    gated on field presence (`if (claim.evidenceSummary) { ... }`), not
    on `claim.type` or a schema-version check — whatever fields an entry
    has renders, whatever's missing is silently skipped. Verified with a
    hand-seeded legacy-shaped entry (missing `epistemicProfile`, missing
    `lang`) that still restores and renders correctly.

## Error handling

`api/triage.js`, `api/evidence.js`, and `api/verdict.js` all return a short
`error` *code* (`rate_limited`, `model_overloaded`, `bad_request`,
`upstream_unreachable`, `upstream_error`, `no_result`, `invalid_response`,
`server_misconfigured`) plus an English `message` that's only for
server-side logs. `analyzeClaim.js`
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
static files, and each `api/*.js` file is auto-detected as its own
serverless function by its location under `api/` (`api/_lib/` is
excluded by Vercel's underscore-prefix convention).
