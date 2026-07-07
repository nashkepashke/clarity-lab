// app.js
//
// Page logic only: language state, wiring up clicks, showing loading/error
// states, and rendering whatever analyzeClaim() gives back. This file
// doesn't know or care how analyzeClaim works internally — see
// analyzeClaim.js for that. All display text comes from translations.js.

var LANG_STORAGE_KEY = "claimBreakdownLang";

var langToggle = document.getElementById("lang-toggle");
var langButtons = langToggle.querySelectorAll(".lang-btn");
var titleEl = document.getElementById("page-title");
var subtitleEl = document.getElementById("page-subtitle");
var inputLabelEl = document.getElementById("input-label");
var claimInput = document.getElementById("claim-input");
var analyzeBtn = document.getElementById("analyze-btn");
var resultArea = document.getElementById("result-area");
var errorArea = document.getElementById("error-area");
var chipsContainer = document.getElementById("chips");
var disclaimerEl = document.getElementById("disclaimer");

var currentLang = null;
var T = null;

langButtons.forEach(function (btn) {
  btn.textContent = LANGUAGE_LABELS[btn.dataset.lang];
});

function applyLanguage(lang) {
  currentLang = lang;
  T = TRANSLATIONS[lang];

  document.documentElement.lang = T.htmlLang;
  document.documentElement.dir = T.dir;
  document.title = T.header.title;

  titleEl.textContent = T.header.title;
  subtitleEl.textContent = T.header.subtitle;
  inputLabelEl.textContent = T.input.label;
  claimInput.placeholder = T.input.placeholder;
  analyzeBtn.textContent = analyzeBtn.disabled ? T.input.analyzeLoading : T.input.analyzeIdle;
  disclaimerEl.textContent = T.disclaimer;

  renderChips();
  updateToggleButtons();

  // Any previously rendered result/error was generated in the old
  // language and its labels would no longer match — clear it rather
  // than show a mismatched mix.
  resultArea.hidden = true;
  resultArea.innerHTML = "";
  errorArea.hidden = true;

  localStorage.setItem(LANG_STORAGE_KEY, lang);
}

function renderChips() {
  chipsContainer.innerHTML = "";
  T.chips.forEach(function (chip) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.claim = chip.claim;
    btn.textContent = chip.claim;
    chipsContainer.appendChild(btn);
  });
}

function updateToggleButtons() {
  langButtons.forEach(function (btn) {
    var isActive = btn.dataset.lang === currentLang;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

langToggle.addEventListener("click", function (event) {
  var btn = event.target.closest(".lang-btn");
  if (!btn || btn.dataset.lang === currentLang) return;
  applyLanguage(btn.dataset.lang);
});

// Clicking an example chip fills the textarea with its claim text.
chipsContainer.addEventListener("click", function (event) {
  var chip = event.target.closest(".chip");
  if (!chip) return;
  claimInput.value = chip.dataset.claim;
  claimInput.focus();
});

// Clicking the analyze button runs the analysis and renders it.
analyzeBtn.addEventListener("click", function () {
  var text = claimInput.value;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = T.input.analyzeLoading;
  resultArea.hidden = true;
  errorArea.hidden = true;

  analyzeClaim(text, currentLang)
    .then(function (result) {
      renderResult(result);
    })
    .catch(function (err) {
      showError(translateError(err));
    })
    .then(function () {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = T.input.analyzeIdle;
    });
});

function translateError(err) {
  var code = err && err.code;
  return (code && T.errors[code]) || T.errors.generic;
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.hidden = false;
}

function renderResult(result) {
  resultArea.innerHTML = "";

  var card = document.createElement("article");
  card.className = "result-card";

  var claimEl = document.createElement("p");
  claimEl.className = "result-claim";
  claimEl.dir = "auto";
  claimEl.textContent = "“" + result.claim + "”";
  card.appendChild(claimEl);

  var badges = document.createElement("div");
  badges.className = "badges";
  badges.appendChild(
    makeBadge(badgeLabel(T.badges.type, result.type), "type-badge", badgeClassForType(result.type))
  );
  badges.appendChild(
    makeBadge(
      badgeLabel(T.badges.assessment, result.assessment),
      "assessment-badge",
      badgeClassForAssessment(result.assessment)
    )
  );
  card.appendChild(badges);

  var confidenceRow = document.createElement("div");
  confidenceRow.className = "confidence-row";
  var confidenceLabel = document.createElement("span");
  confidenceLabel.className = "confidence-label";
  confidenceLabel.textContent = T.confidence.label;
  confidenceRow.appendChild(confidenceLabel);
  confidenceRow.appendChild(
    makeBadge(
      badgeLabel(T.badges.confidence, result.confidence),
      "confidence-badge",
      "badge-outline " + badgeClassForConfidence(result.confidence)
    )
  );
  card.appendChild(confidenceRow);

  var confidenceReason = document.createElement("p");
  confidenceReason.className = "confidence-reason";
  confidenceReason.dir = "auto";
  confidenceReason.textContent = result.confidenceReason;
  card.appendChild(confidenceReason);

  card.appendChild(
    makeDetailsSection(T.sections.evidenceBasis, function () {
      var list = document.createElement("ul");
      list.className = "considerations";
      result.evidenceBasis.forEach(function (point) {
        var li = document.createElement("li");
        li.dir = "auto";
        li.textContent = point;
        list.appendChild(li);
      });
      return list;
    })
  );

  card.appendChild(
    makeDetailsSection(T.sections.steelman, function () {
      var p = document.createElement("p");
      p.dir = "auto";
      p.textContent = result.steelman;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection(T.sections.strawman, function () {
      var p = document.createElement("p");
      p.dir = "auto";
      p.textContent = result.strawmanWarning;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection(T.sections.tension, function () {
      var p = document.createElement("p");
      p.dir = "auto";
      p.textContent = result.tension;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection(T.sections.whatWouldChange, function () {
      var p = document.createElement("p");
      p.dir = "auto";
      p.textContent = result.whatWouldChangeAssessment;
      return p;
    })
  );

  resultArea.appendChild(card);
  resultArea.hidden = false;
}

function makeDetailsSection(label, buildBody) {
  var details = document.createElement("details");
  details.className = "result-section";

  var summary = document.createElement("summary");
  summary.textContent = label;
  details.appendChild(summary);

  var body = document.createElement("div");
  body.className = "result-section-body";
  body.appendChild(buildBody());
  details.appendChild(body);

  return details;
}

function makeBadge(label, baseClass, modifierClass) {
  var span = document.createElement("span");
  span.className = "badge " + baseClass + " " + modifierClass;
  span.textContent = label;
  return span;
}

function badgeLabel(map, value) {
  return (map && map[value]) || value;
}

function badgeClassForType(type) {
  if (type === "Factual") return "badge-factual";
  if (type === "Causal") return "badge-causal";
  if (type === "Prediction") return "badge-prediction";
  if (type === "Opinion or value judgment") return "badge-opinion";
  return "badge-unknown";
}

function badgeClassForAssessment(assessment) {
  if (assessment === "Supported") return "badge-supported";
  if (assessment === "Mostly supported") return "badge-mostly-supported";
  if (assessment === "Contradicted") return "badge-contradicted";
  if (assessment === "Not enough information") return "badge-unknown";
  if (assessment === "Not empirically assessable") return "badge-not-assessable";
  return "badge-mixed";
}

function badgeClassForConfidence(confidence) {
  if (confidence === "Low") return "badge-confidence-low";
  if (confidence === "High") return "badge-confidence-high";
  return "badge-confidence-medium";
}

var storedLang = localStorage.getItem(LANG_STORAGE_KEY);
applyLanguage(storedLang === "en" ? "en" : "he");
