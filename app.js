// app.js
//
// Page logic only: wiring up clicks, showing a loading state, and rendering
// whatever analyzeClaim() gives back. This file doesn't know or care how
// analyzeClaim works internally — see analyzeClaim.js for that.

var claimInput = document.getElementById("claim-input");
var analyzeBtn = document.getElementById("analyze-btn");
var resultArea = document.getElementById("result-area");
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

  analyzeClaim(text).then(function (result) {
    renderResult(result);
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Break it down";
  });
});

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
  badges.appendChild(makeBadge(result.status, "status-badge", badgeClassForStatus(result.status)));
  card.appendChild(badges);

  var explanation = document.createElement("p");
  explanation.className = "result-explanation";
  explanation.textContent = result.explanation;
  card.appendChild(explanation);

  var considerationsHeading = document.createElement("p");
  considerationsHeading.className = "section-heading";
  considerationsHeading.textContent = "Things to consider";
  card.appendChild(considerationsHeading);

  var list = document.createElement("ul");
  list.className = "considerations";
  result.considerations.forEach(function (point) {
    var li = document.createElement("li");
    li.textContent = point;
    list.appendChild(li);
  });
  card.appendChild(list);

  var tension = document.createElement("p");
  tension.className = "result-tension";
  tension.innerHTML = "<strong>In tension:</strong> ";
  tension.appendChild(document.createTextNode(result.tension));
  card.appendChild(tension);

  resultArea.appendChild(card);
  resultArea.hidden = false;
}

function makeBadge(label, baseClass, modifierClass) {
  var span = document.createElement("span");
  span.className = "badge " + baseClass + " " + modifierClass;
  span.textContent = label;
  return span;
}

function badgeClassForType(type) {
  if (type === "Factual claim") return "badge-factual";
  if (type === "Prediction") return "badge-prediction";
  return "badge-opinion";
}

function badgeClassForStatus(status) {
  if (status === "Supported") return "badge-supported";
  if (status === "Contradicted") return "badge-contradicted";
  if (status === "Not enough information") return "badge-unknown";
  return "badge-mixed";
}
