// app.js
//
// Page logic only: language state, wiring up clicks, the two-phase
// loading label, rendering the dashboard (verdict strip + dials + claim
// cards + evidence rail), and localStorage history. Doesn't know how
// analyzeClaim works internally — see analyzeClaim.js for that. All
// display text comes from translations.js.

var LANG_STORAGE_KEY = "claimBreakdownLang";
var HISTORY_STORAGE_KEY = "claimBreakdownHistory";
var MAX_HISTORY = 20;
var TIER_PRIORITY = ["Primary official", "Academic", "Established journalism", "Fact-check org", "Other"];

var langToggle = document.getElementById("lang-toggle");
var langButtons = langToggle.querySelectorAll(".lang-btn");
var titleEl = document.getElementById("page-title");
var subtitleEl = document.getElementById("page-subtitle");
var inputLabelEl = document.getElementById("input-label");
var claimInput = document.getElementById("claim-input");
var analyzeBtn = document.getElementById("analyze-btn");
var dashboardArea = document.getElementById("dashboard-area");
var errorArea = document.getElementById("error-area");
var chipsContainer = document.getElementById("chips");
var disclaimerEl = document.getElementById("disclaimer");
var verdictLabelEl = document.getElementById("verdict-label");
var verdictBadgeEl = document.getElementById("verdict-badge");
var dialsContainer = document.getElementById("dials");
var claimsColumn = document.getElementById("claims-column");
var evidenceRail = document.getElementById("evidence-rail");
var historyToggleEl = document.getElementById("history-toggle");
var historyListEl = document.getElementById("history-list");
var historyClearBtn = document.getElementById("history-clear-btn");

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
  analyzeBtn.textContent = analyzeBtn.disabled ? T.input.phaseTriage : T.input.analyzeIdle;
  disclaimerEl.textContent = T.disclaimer;
  verdictLabelEl.textContent = T.verdict.overallLabel;
  historyToggleEl.textContent = T.history.toggle;
  historyClearBtn.textContent = T.history.clear;

  renderChips();
  updateToggleButtons();
  renderHistoryList();

  // Any previously rendered dashboard/error was generated in the old
  // language and its labels would no longer match — clear it rather
  // than show a mismatched mix. History entries retranslate their
  // badge labels on the fly (see renderHistoryList/renderClaimCard,
  // which look badge text up from the *current* T using the raw
  // English value each entry stores) but keep their original free text.
  dashboardArea.hidden = true;
  claimsColumn.innerHTML = "";
  evidenceRail.innerHTML = "";
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

chipsContainer.addEventListener("click", function (event) {
  var chip = event.target.closest(".chip");
  if (!chip) return;
  claimInput.value = chip.dataset.claim;
  claimInput.focus();
});

analyzeBtn.addEventListener("click", function () {
  var text = claimInput.value;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = T.input.phaseTriage;
  dashboardArea.hidden = true;
  errorArea.hidden = true;

  analyzeClaim(text, currentLang, function (phase) {
    if (phase === "triage-done") analyzeBtn.textContent = T.input.phaseEvidence;
  })
    .then(function (data) {
      renderDashboard(data);
      pushHistoryEntry(text, currentLang, data);
      renderHistoryList();
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

// ---------- Dashboard rendering ----------

function renderDashboard(data) {
  renderVerdictStrip(data);
  renderClaimsColumn(data.claims);
  renderEvidenceRail(data.claims);
  dashboardArea.hidden = false;
}

function renderVerdictStrip(data) {
  verdictBadgeEl.innerHTML = "";
  if (data.overallAssessment) {
    verdictBadgeEl.appendChild(
      makeBadge(badgeLabel(T.badges.assessment, data.overallAssessment), "assessment-badge", badgeClassForAssessment(data.overallAssessment))
    );
  } else {
    var span = document.createElement("span");
    span.className = "verdict-none";
    span.textContent = T.verdict.noResult;
    verdictBadgeEl.appendChild(span);
  }

  dialsContainer.innerHTML = "";
  ["checkability", "evidenceStrength", "precision", "analysisConfidence"].forEach(function (key) {
    if (data.epistemicProfile && data.epistemicProfile[key]) {
      dialsContainer.appendChild(renderDial(key, data.epistemicProfile[key]));
    }
  });
}

function renderDial(key, dialData) {
  var dialT = T.epistemicProfile[key];
  var details = document.createElement("details");
  details.className = "dial";

  var summary = document.createElement("summary");

  var nameEl = document.createElement("span");
  nameEl.className = "dial-name";
  nameEl.textContent = dialT.name;
  summary.appendChild(nameEl);

  var segments = document.createElement("span");
  segments.className = "dial-segments";
  Object.keys(dialT.levels).forEach(function (levelKey) {
    var seg = document.createElement("span");
    seg.className = "dial-segment" + (levelKey === dialData.level ? " active" : "");
    seg.textContent = dialT.levels[levelKey];
    segments.appendChild(seg);
  });
  summary.appendChild(segments);
  details.appendChild(summary);

  var justification = document.createElement("p");
  justification.className = "dial-justification";
  var justifyFn = dialT.justify[dialData.level];
  justification.textContent = justifyFn ? justifyFn(dialData) : "";
  details.appendChild(justification);

  return details;
}

function renderClaimsColumn(claims) {
  claimsColumn.innerHTML = "";
  claims.forEach(function (claim) {
    claimsColumn.appendChild(renderClaimCard(claim, claims));
  });
}

function renderClaimCard(claim, allClaims) {
  var card = document.createElement("article");
  card.className = "claim-card result-card";
  card.id = "claim-" + claim.id;

  var claimEl = document.createElement("p");
  claimEl.className = "result-claim";
  claimEl.dir = "auto";
  claimEl.textContent = "“" + claim.claimText + "”";
  card.appendChild(claimEl);

  if (claim.error) {
    var errMsg = document.createElement("p");
    errMsg.className = "claim-error";
    errMsg.textContent = T.claim.errorMessage;
    card.appendChild(errMsg);
    return card;
  }

  var badges = document.createElement("div");
  badges.className = "badges";
  if (claim.type) {
    badges.appendChild(makeBadge(badgeLabel(T.badges.type, claim.type), "type-badge", badgeClassForType(claim.type)));
  }
  if (claim.assessment) {
    badges.appendChild(
      makeBadge(badgeLabel(T.badges.assessment, claim.assessment), "assessment-badge", badgeClassForAssessment(claim.assessment))
    );
  }
  card.appendChild(badges);

  if (claim.confidence) {
    var confidenceRow = document.createElement("div");
    confidenceRow.className = "confidence-row";
    var confidenceLabelEl = document.createElement("span");
    confidenceLabelEl.className = "confidence-label";
    confidenceLabelEl.textContent = T.confidence.label;
    confidenceRow.appendChild(confidenceLabelEl);
    confidenceRow.appendChild(
      makeBadge(badgeLabel(T.badges.confidence, claim.confidence), "confidence-badge", "badge-outline " + badgeClassForConfidence(claim.confidence))
    );
    card.appendChild(confidenceRow);
  }

  if (claim.confidenceReason) {
    var reasonEl = document.createElement("p");
    reasonEl.className = "confidence-reason";
    reasonEl.dir = "auto";
    reasonEl.textContent = claim.confidenceReason;
    card.appendChild(reasonEl);
  }

  if (claim.grounded === false) {
    var notChecked = document.createElement("p");
    notChecked.className = "not-source-checked";
    notChecked.textContent = "⚠ " + T.claim.notSourceChecked;
    card.appendChild(notChecked);
  }

  // Gated purely by field presence, not claim.type — this is what makes
  // partial/old-format stored (history) data render safely: whatever
  // fields exist show up, whatever's missing is silently skipped.
  var textSectionFields = [
    "whatWouldChangeAssessment", "evidenceSummary", "denominatorCheck", "precisionCheck",
    "distinguishingEvidence", "referenceClassAndBaseRate", "feasibility", "tension", "steelman", "strawmanWarning"
  ];
  textSectionFields.forEach(function (field) {
    if (claim[field]) {
      card.appendChild(
        makeDetailsSection(T.sections[field], function () {
          var p = document.createElement("p");
          p.dir = "auto";
          p.textContent = claim[field];
          return p;
        })
      );
    }
  });

  if (Array.isArray(claim.alternativeExplanations) && claim.alternativeExplanations.length > 0) {
    card.appendChild(
      makeDetailsSection(T.sections.alternativeExplanations, function () {
        return buildTextList(claim.alternativeExplanations);
      })
    );
  }

  if (claim.correlationCautionNote) {
    card.appendChild(
      makeDetailsSection(T.sections.correlationCaution, function () {
        var p = document.createElement("p");
        p.dir = "auto";
        p.textContent = claim.correlationCautionNote;
        return p;
      })
    );
  }

  if (Array.isArray(claim.premiseIds) && claim.premiseIds.length > 0) {
    card.appendChild(buildRelatedPremises(claim.premiseIds, allClaims));
  }

  if (claim.sources) {
    card.appendChild(
      makeDetailsSection(T.claim.sources(claim.sources.length), function () {
        return buildSourceList(claim.sources);
      })
    );
  }

  return card;
}

function buildTextList(items) {
  var ul = document.createElement("ul");
  ul.className = "considerations";
  items.forEach(function (item) {
    var li = document.createElement("li");
    li.dir = "auto";
    li.textContent = item;
    ul.appendChild(li);
  });
  return ul;
}

function buildRelatedPremises(premiseIds, allClaims) {
  var wrap = document.createElement("div");
  wrap.className = "related-premises";

  var label = document.createElement("p");
  label.className = "related-premises-label";
  label.textContent = T.claim.relatedPremises;
  wrap.appendChild(label);

  var list = document.createElement("div");
  list.className = "related-premises-list";
  premiseIds.forEach(function (id) {
    var target = allClaims.filter(function (c) { return c.id === id; })[0];
    if (!target) return;
    var link = document.createElement("a");
    link.href = "#claim-" + id;
    link.className = "related-premise-chip";
    link.dir = "auto";
    link.textContent = target.claimText;
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var el = document.getElementById("claim-" + id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("claim-highlight");
      setTimeout(function () {
        el.classList.remove("claim-highlight");
      }, 1500);
    });
    list.appendChild(link);
  });
  wrap.appendChild(list);
  return wrap;
}

function buildSourceList(sources) {
  if (!sources || sources.length === 0) {
    var p = document.createElement("p");
    p.textContent = T.claim.noSources;
    return p;
  }
  var wrap = document.createElement("div");
  wrap.className = "source-list";
  sortSourcesByTier(sources).forEach(function (source) {
    wrap.appendChild(buildSourceCard(source));
  });
  return wrap;
}

function sortSourcesByTier(sources) {
  return sources.slice().sort(function (a, b) {
    return TIER_PRIORITY.indexOf(a.tier) - TIER_PRIORITY.indexOf(b.tier);
  });
}

function buildSourceCard(source) {
  var card = document.createElement("a");
  card.className = "source-card";
  card.href = source.uri;
  card.target = "_blank";
  card.rel = "noopener";

  // Gemini's grounding `uri` is an opaque Google redirect link (it still
  // works as a click-through, just useless for display/favicon purposes)
  // — `domain` is the real source hostname the backend resolved from the
  // grounding chunk's title. Older stored history entries may not have
  // it; fall back to parsing uri in that case rather than break.
  var domain = source.domain || hostnameOf(source.uri);

  if (domain) {
    var favicon = document.createElement("img");
    favicon.className = "source-favicon";
    favicon.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=32";
    favicon.alt = "";
    card.appendChild(favicon);
  }

  var body = document.createElement("div");
  body.className = "source-card-body";

  // Grounding titles often come back as just the bare domain rather than
  // a real headline — skip the redundant title line when that's the case.
  if (source.title && source.title !== domain) {
    var title = document.createElement("p");
    title.className = "source-title";
    title.dir = "auto";
    title.textContent = source.title;
    body.appendChild(title);
  }

  var meta = document.createElement("p");
  meta.className = "source-meta";
  var outlet = document.createElement("span");
  outlet.textContent = domain || source.uri;
  meta.appendChild(outlet);
  var tier = document.createElement("span");
  tier.className = "badge source-tier-badge " + tierBadgeClass(source.tier);
  tier.textContent = badgeLabel(T.badges.sourceTier, source.tier);
  meta.appendChild(tier);
  body.appendChild(meta);

  card.appendChild(body);
  return card;
}

function hostnameOf(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch (err) {
    return uri;
  }
}

function renderEvidenceRail(claims) {
  evidenceRail.innerHTML = "";
  var withSources = claims.filter(function (c) {
    return !c.error && c.sources && c.sources.length > 0;
  });
  withSources.forEach(function (claim) {
    var group = document.createElement("div");
    group.className = "rail-group";
    var heading = document.createElement("p");
    heading.className = "rail-group-heading";
    heading.dir = "auto";
    heading.textContent = claim.claimText;
    group.appendChild(heading);
    group.appendChild(buildSourceList(claim.sources));
    evidenceRail.appendChild(group);
  });
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
  if (type === "Empirical") return "badge-empirical";
  if (type === "Causal") return "badge-causal";
  if (type === "Prediction-or-promise") return "badge-prediction";
  if (type === "Normative") return "badge-normative";
  return "badge-type-mixed";
}

function badgeClassForAssessment(assessment) {
  if (assessment === "Supported") return "badge-supported";
  if (assessment === "Mostly supported") return "badge-mostly-supported";
  if (assessment === "Contradicted") return "badge-contradicted";
  if (assessment === "Not enough information") return "badge-unknown";
  if (assessment === "Not empirically assessable") return "badge-not-assessable";
  if (assessment === "Too recent to assess") return "badge-too-recent";
  if (assessment === "Outcome not yet knowable") return "badge-not-knowable";
  return "badge-mixed";
}

function badgeClassForConfidence(confidence) {
  if (confidence === "Low") return "badge-confidence-low";
  if (confidence === "High") return "badge-confidence-high";
  return "badge-confidence-medium";
}

function tierBadgeClass(tier) {
  if (tier === "Primary official") return "badge-tier-primary";
  if (tier === "Academic") return "badge-tier-academic";
  if (tier === "Established journalism") return "badge-tier-journalism";
  if (tier === "Fact-check org") return "badge-tier-factcheck";
  return "badge-tier-other";
}

// ---------- History ----------

function loadHistory() {
  try {
    var raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    var parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // storage full or unavailable — history just won't persist, not fatal
  }
}

function pushHistoryEntry(originalText, lang, data) {
  var list = loadHistory();
  list.unshift({ savedAt: Date.now(), lang: lang, originalText: originalText, data: data });
  if (list.length > MAX_HISTORY) list = list.slice(0, MAX_HISTORY);
  saveHistory(list);
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function renderHistoryList() {
  var list = loadHistory();
  historyListEl.innerHTML = "";

  if (list.length === 0) {
    var empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = T.history.empty;
    historyListEl.appendChild(empty);
    return;
  }

  list.forEach(function (entry) {
    var li = document.createElement("li");
    li.className = "history-item";

    var textEl = document.createElement("span");
    textEl.className = "history-item-text";
    textEl.dir = "auto";
    textEl.textContent = truncate(entry.originalText || "", 80);
    li.appendChild(textEl);

    var dateEl = document.createElement("span");
    dateEl.className = "history-item-date";
    try {
      dateEl.textContent = new Date(entry.savedAt).toLocaleString(T.dateLocale);
    } catch (err) {
      dateEl.textContent = "";
    }
    li.appendChild(dateEl);

    if (entry.data && entry.data.overallAssessment) {
      li.appendChild(
        makeBadge(badgeLabel(T.badges.assessment, entry.data.overallAssessment), "assessment-badge", badgeClassForAssessment(entry.data.overallAssessment))
      );
    }

    var restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "history-restore-btn";
    restoreBtn.textContent = T.history.restore;
    restoreBtn.addEventListener("click", function () {
      if (!entry.data || !Array.isArray(entry.data.claims)) return;
      errorArea.hidden = true;
      renderDashboard(entry.data);
      dashboardArea.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    li.appendChild(restoreBtn);

    historyListEl.appendChild(li);
  });
}

historyClearBtn.addEventListener("click", function () {
  saveHistory([]);
  renderHistoryList();
});

var storedLang = localStorage.getItem(LANG_STORAGE_KEY);
applyLanguage(storedLang === "en" ? "en" : "he");
