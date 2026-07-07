// app.js
//
// Page logic only: wiring up clicks, showing a loading state, and rendering
// whatever analyzeClaim() gives back. This file doesn't know or care how
// analyzeClaim works internally — see analyzeClaim.js for that.

var claimInput = document.getElementById("claim-input");
var analyzeBtn = document.getElementById("analyze-btn");
var resultArea = document.getElementById("result-area");
var errorArea = document.getElementById("error-area");
var chipsContainer = document.getElementById("chips");

// Clicking an example chip fills the textarea with its claim text.
chipsContainer.addEventListener("click", function (event) {
  var chip = event.target.closest(".chip");
  if (!chip) return;
  claimInput.value = chip.dataset.claim;
  claimInput.focus();
});

// Clicking "Break it down" runs the (currently fake) analysis and renders it.
analyzeBtn.addEventListener("click", function () {
  var text = claimInput.value;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  resultArea.hidden = true;
  errorArea.hidden = true;

  analyzeClaim(text)
    .then(function (result) {
      renderResult(result);
    })
    .catch(function (err) {
      showError(err.message || "Something went wrong analyzing that claim.");
    })
    .then(function () {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Break it down";
    });
});

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
  claimEl.textContent = "“" + result.claim + "”";
  card.appendChild(claimEl);

  var badges = document.createElement("div");
  badges.className = "badges";
  badges.appendChild(makeBadge(result.type, "type-badge", badgeClassForType(result.type)));
  badges.appendChild(makeBadge(result.assessment, "assessment-badge", badgeClassForAssessment(result.assessment)));
  card.appendChild(badges);

  var confidenceRow = document.createElement("div");
  confidenceRow.className = "confidence-row";
  var confidenceLabel = document.createElement("span");
  confidenceLabel.className = "confidence-label";
  confidenceLabel.textContent = "Confidence:";
  confidenceRow.appendChild(confidenceLabel);
  confidenceRow.appendChild(
    makeBadge(result.confidence, "confidence-badge", "badge-outline " + badgeClassForConfidence(result.confidence))
  );
  card.appendChild(confidenceRow);

  var confidenceReason = document.createElement("p");
  confidenceReason.className = "confidence-reason";
  confidenceReason.textContent = result.confidenceReason;
  card.appendChild(confidenceReason);

  card.appendChild(
    makeDetailsSection("Evidence basis", function () {
      var list = document.createElement("ul");
      list.className = "considerations";
      result.evidenceBasis.forEach(function (point) {
        var li = document.createElement("li");
        li.textContent = point;
        list.appendChild(li);
      });
      return list;
    })
  );

  card.appendChild(
    makeDetailsSection("Steelman: strongest fair version", function () {
      var p = document.createElement("p");
      p.textContent = result.steelman;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection("Strawman to watch for", function () {
      var p = document.createElement("p");
      p.textContent = result.strawmanWarning;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection("Values in tension", function () {
      var p = document.createElement("p");
      p.textContent = result.tension;
      return p;
    })
  );

  card.appendChild(
    makeDetailsSection("What could change this", function () {
      var p = document.createElement("p");
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
