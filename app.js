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

var ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var MAX_IMAGE_DIMENSION = 1600;
var RECOMPRESS_THRESHOLD_BYTES = 800 * 1024;

var langToggle = document.getElementById("lang-toggle");
var langButtons = langToggle.querySelectorAll(".lang-btn");
var titleEl = document.getElementById("page-title");
var subtitleEl = document.getElementById("page-subtitle");
var inputLabelEl = document.getElementById("input-label");
var claimInput = document.getElementById("claim-input");
var analyzeBtn = document.getElementById("analyze-btn");
var dashboardArea = document.getElementById("dashboard-area");
var dashboardGrid = document.querySelector(".dashboard-grid");
var errorArea = document.getElementById("error-area");
var chipsContainer = document.getElementById("chips");
var disclaimerEl = document.getElementById("disclaimer");
var verdictLabelEl = document.getElementById("verdict-label");
var verdictBadgeEl = document.getElementById("verdict-badge");
var dialsContainer = document.getElementById("dials");
var claimsColumn = document.getElementById("claims-column");
var evidenceRail = document.getElementById("evidence-rail");
var historyPanel = document.getElementById("history-panel");
var historyToggleEl = document.getElementById("history-toggle");
var historyPrivacyNoteEl = document.getElementById("history-privacy-note");
var historyListEl = document.getElementById("history-list");
var historyClearBtn = document.getElementById("history-clear-btn");
var inputCard = document.getElementById("input-card");
var imageAttachBtn = document.getElementById("image-attach-btn");
var imageFileInput = document.getElementById("image-file-input");
var imageHintEl = document.getElementById("image-hint");
var imagePreview = document.getElementById("image-preview");
var imagePreviewImg = document.getElementById("image-preview-img");
var imageRemoveBtn = document.getElementById("image-remove-btn");
var extractPromptEl = document.getElementById("extract-prompt");

var currentLang = null;
var T = null;

// The attached image lives only in memory for the extraction call — it's
// never sent to /api/triage or /api/evidence, and never saved to history
// (pushHistoryEntry only ever sees claimInput.value, which by the time
// analysis runs is the extracted-and-possibly-edited text, not the image).
var attachedImage = null; // { base64, mimeType, previewUrl } | null
var imageExtracted = false;

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
  disclaimerEl.textContent = T.disclaimer;
  imageAttachBtn.textContent = T.image.attachButton;
  imageHintEl.textContent = T.image.hint;
  imagePreviewImg.alt = T.image.previewAlt;
  imageRemoveBtn.title = T.image.removeButton;
  imageRemoveBtn.setAttribute("aria-label", T.image.removeButton);
  if (!analyzeBtn.disabled) updateAnalyzeButtonLabel();
  verdictLabelEl.textContent = T.verdict.overallLabel;
  historyToggleEl.textContent = T.history.toggle;
  historyPrivacyNoteEl.textContent = T.history.privacyNote;
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
  if (imageExtracted) extractPromptEl.hidden = true;

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
  // Picking an example is a clear "analyze this text" signal — an image
  // still waiting to be read would otherwise silently win on the next
  // click and overwrite what they just chose.
  if (attachedImage && !imageExtracted) clearAttachedImage();
});

analyzeBtn.addEventListener("click", function () {
  if (attachedImage && !imageExtracted) {
    runExtraction();
  } else {
    runAnalysis();
  }
});

function runExtraction() {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = T.input.extractPhase;
  errorArea.hidden = true;
  extractPromptEl.hidden = true;

  extractClaimFromImage(attachedImage.base64, attachedImage.mimeType, currentLang)
    .then(function (extractedText) {
      claimInput.value = extractedText;
      claimInput.rows = 4;
      imageExtracted = true;
      extractPromptEl.textContent = T.image.extractPrompt;
      extractPromptEl.hidden = false;
      claimInput.focus();
    })
    .catch(function (err) {
      showError(translateExtractionError(err));
    })
    .then(function () {
      analyzeBtn.disabled = false;
      updateAnalyzeButtonLabel();
    });
}

function runAnalysis() {
  var text = claimInput.value;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = T.input.phaseTriage;
  dashboardArea.hidden = true;
  errorArea.hidden = true;
  extractPromptEl.hidden = true;
  // Reclaim vertical space for the incoming result — matters most on
  // desktop, where the goal is to see the verdict/dials without scrolling.
  historyPanel.removeAttribute("open");

  analyzeClaim(text, currentLang, function (phase) {
    if (phase === "triage-done") analyzeBtn.textContent = T.input.phaseEvidence;
  })
    .then(function (data) {
      renderDashboard(data, currentLang);
      // History only ever sees claimInput.value here — for an
      // image-sourced claim that's the extracted (and possibly
      // user-edited) text, never the image itself.
      pushHistoryEntry(text, currentLang, data);
      renderHistoryList();
    })
    .catch(function (err) {
      showError(translateError(err));
    })
    .then(function () {
      analyzeBtn.disabled = false;
      updateAnalyzeButtonLabel();
    });
}

function updateAnalyzeButtonLabel() {
  analyzeBtn.textContent = attachedImage && !imageExtracted ? T.input.analyzeWithImageIdle : T.input.analyzeIdle;
}

function translateError(err) {
  var code = err && err.code;
  return (code && T.errors[code]) || T.errors.generic;
}

// Same code->message lookup as translateError, but falls back to a
// message specific to "something went wrong reading the image" instead
// of the analysis-flavored generic message — the specific codes
// (rate_limited, model_overloaded, no_claim_found, etc.) still win
// either way, this only changes the catch-all.
function translateExtractionError(err) {
  var code = err && err.code;
  return (code && T.errors[code]) || T.errors.extraction_failed;
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.hidden = false;
}

// ---------- Dashboard rendering ----------

// `lang` decides which translation table badges/section-labels/dial names
// are drawn from for this render. For a live analysis that's always
// currentLang; for a restored history entry it's whatever language that
// entry was originally analyzed in, so a Hebrew-saved analysis still
// reads as Hebrew even if the UI toggle currently shows English — its
// free-text content is only ever available in the language it was
// generated in anyway, so re-labeling the chrome around it to a
// different language would be an inconsistent mix, not a translation.
// All the render helpers below reference the module-level `T` directly
// (that's the existing, unchanged pattern), so this just points `T` at
// the right table for the duration of the synchronous render and puts
// it back — no need to thread a lang param through every helper.
function renderDashboard(data, lang) {
  var renderT = TRANSLATIONS[lang] || TRANSLATIONS[currentLang] || TRANSLATIONS.he;
  var previousT = T;
  T = renderT;
  try {
    renderVerdictStrip(data);
    renderClaimsColumn(data.claims);
    renderEvidenceRail(data.claims);
  } finally {
    T = previousT;
  }
  dashboardArea.hidden = false;

  // Once there's a result to look at, the input doesn't need to stay
  // full-height — freeing that space is most of what makes the verdict
  // strip and dials visible without scrolling on desktop. resize:vertical
  // still lets you drag it back open if you want more room to edit. The
  // image hint line goes the same way — the upload button alone is still
  // enough affordance, and that one line of text was, in testing, exactly
  // the difference between the verdict strip fitting above the fold or not.
  claimInput.rows = 2;
  imageHintEl.hidden = true;
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

  // An empty bordered box with nothing in it is clutter, not a module —
  // hide it and let claim cards use the full width instead.
  var hasRail = withSources.length > 0;
  evidenceRail.hidden = !hasRail;
  if (dashboardGrid) dashboardGrid.classList.toggle("no-rail", !hasRail);
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

// ---------- Image input ----------
//
// Three ways in: the upload button (also covers mobile camera roll —
// a plain file input with an image accept list already shows the native
// photo library/camera picker on mobile, no special handling needed),
// drag-and-drop onto the input card, and Ctrl+V paste into the textarea.
// All three funnel into handleImageFile(), which validates, downscales
// if needed, and stores the result — nothing is sent to the server until
// the button is clicked (see runExtraction() above).

function clearAttachedImage() {
  attachedImage = null;
  imageExtracted = false;
  imagePreview.hidden = true;
  imagePreviewImg.src = "";
  imageFileInput.value = "";
  updateAnalyzeButtonLabel();
}

function handleImageFile(file) {
  if (!file) return;

  if (ACCEPTED_IMAGE_TYPES.indexOf(file.type) === -1) {
    showError(T.errors.unsupported_file_type);
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showError(T.errors.file_too_large);
    return;
  }

  errorArea.hidden = true;

  readAndMaybeDownscale(file)
    .then(function (result) {
      attachedImage = result;
      imageExtracted = false;
      extractPromptEl.hidden = true;
      imagePreviewImg.src = result.previewUrl;
      imagePreview.hidden = false;
      updateAnalyzeButtonLabel();
    })
    .catch(function () {
      showError(T.errors.unreadable_image);
    });
}

// Resolves { base64, mimeType, previewUrl }. Images already small enough
// (both under the byte threshold and within MAX_IMAGE_DIMENSION) pass
// through untouched; anything bigger is redrawn on a canvas, capped at
// MAX_IMAGE_DIMENSION on its longest side, and re-encoded as JPEG — that
// bounds the request payload regardless of how the original was encoded
// (a small-dimension but poorly-compressed PNG still gets recompressed).
function readAndMaybeDownscale(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () {
      reject(new Error("read failed"));
    };
    reader.onload = function () {
      var dataUrl = reader.result;

      if (file.size <= RECOMPRESS_THRESHOLD_BYTES) {
        var probe = new Image();
        probe.onerror = function () {
          reject(new Error("decode failed"));
        };
        probe.onload = function () {
          if (Math.max(probe.naturalWidth, probe.naturalHeight) <= MAX_IMAGE_DIMENSION) {
            resolve({ base64: dataUrl.split(",")[1], mimeType: file.type, previewUrl: dataUrl });
          } else {
            downscale(probe, resolve);
          }
        };
        probe.src = dataUrl;
        return;
      }

      var img = new Image();
      img.onerror = function () {
        reject(new Error("decode failed"));
      };
      img.onload = function () {
        downscale(img, resolve);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function downscale(img, resolve) {
  var scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  var canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  var outUrl = canvas.toDataURL("image/jpeg", 0.85);
  resolve({ base64: outUrl.split(",")[1], mimeType: "image/jpeg", previewUrl: outUrl });
}

imageAttachBtn.addEventListener("click", function () {
  imageFileInput.click();
});

imageFileInput.addEventListener("change", function () {
  handleImageFile(imageFileInput.files && imageFileInput.files[0]);
});

imageRemoveBtn.addEventListener("click", function () {
  clearAttachedImage();
});

claimInput.addEventListener("paste", function (event) {
  var items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf("image/") === 0) {
      event.preventDefault();
      handleImageFile(items[i].getAsFile());
      return;
    }
  }
});

["dragenter", "dragover"].forEach(function (eventName) {
  inputCard.addEventListener(eventName, function (event) {
    if (!event.dataTransfer || event.dataTransfer.types.indexOf("Files") === -1) return;
    event.preventDefault();
    inputCard.classList.add("drag-over");
  });
});

["dragleave", "dragend"].forEach(function (eventName) {
  inputCard.addEventListener(eventName, function () {
    inputCard.classList.remove("drag-over");
  });
});

inputCard.addEventListener("drop", function (event) {
  if (!event.dataTransfer || !event.dataTransfer.files || event.dataTransfer.files.length === 0) return;
  event.preventDefault();
  inputCard.classList.remove("drag-over");
  handleImageFile(event.dataTransfer.files[0]);
});

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

// Relative-time phrasing is panel chrome (like the "Show again" button),
// so unlike the restored analysis itself, it always uses the *current*
// UI language (T), not the entry's saved language.
function formatRelativeTime(savedAt) {
  var diffSec = Math.floor((Date.now() - savedAt) / 1000);
  var diffMin = Math.floor(diffSec / 60);
  var diffHour = Math.floor(diffMin / 60);
  var diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return T.history.relative.justNow;
  if (diffMin < 60) return T.history.relative.minutes(diffMin);
  if (diffHour < 24) return T.history.relative.hours(diffHour);
  if (diffDay < 30) return T.history.relative.days(diffDay);

  var dateStr;
  try {
    dateStr = new Date(savedAt).toLocaleDateString(T.dateLocale);
  } catch (err) {
    dateStr = "";
  }
  return T.history.relative.older(dateStr);
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
      dateEl.textContent = formatRelativeTime(entry.savedAt);
    } catch (err) {
      dateEl.textContent = "";
    }
    li.appendChild(dateEl);

    if (entry.data && entry.data.overallAssessment) {
      // The badge shows the entry's own saved-language label — it's part
      // of the restored content, not panel chrome, so it follows the
      // same "render as saved" rule as the full restored view below.
      var entryT = TRANSLATIONS[entry.lang] || T;
      li.appendChild(
        makeBadge(
          badgeLabel(entryT.badges.assessment, entry.data.overallAssessment),
          "assessment-badge",
          badgeClassForAssessment(entry.data.overallAssessment)
        )
      );
    }

    var restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "history-restore-btn";
    restoreBtn.textContent = T.history.restore;
    restoreBtn.addEventListener("click", function () {
      if (!entry.data || !Array.isArray(entry.data.claims)) return;
      errorArea.hidden = true;
      renderDashboard(entry.data, entry.lang);
      dashboardArea.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    li.appendChild(restoreBtn);

    historyListEl.appendChild(li);
  });
}

historyClearBtn.addEventListener("click", function () {
  if (!window.confirm(T.history.confirmClear)) return;
  saveHistory([]);
  renderHistoryList();
});

var storedLang = localStorage.getItem(LANG_STORAGE_KEY);
applyLanguage(storedLang === "en" ? "en" : "he");
