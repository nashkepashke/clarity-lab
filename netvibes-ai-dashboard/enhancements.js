(() => {
  "use strict";

  const DASHBOARD_STORAGE = "netvibes-ai-dashboard-v1";
  const GEMINI_STORAGE = "netvibes-ai-gemini-key-v1";
  const COLUMN_COUNT = 3;
  const originalFetch = window.fetch.bind(window);
  let dragIntentId = null;
  let draggedId = null;
  let observer;
  let upgrading = false;

  // Allow a personal Gemini key to be connected from the dashboard itself.
  // It stays in this browser and is only attached to calls to our own endpoint.
  window.fetch = function enhancedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (/\/api\/gemini(?:\?|$)/.test(url)) {
      const key = localStorage.getItem(GEMINI_STORAGE);
      if (key) {
        const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
        headers.set("X-Gemini-API-Key", key);
        init = { ...init, headers };
      }
    }
    return originalFetch(input, init);
  };

  injectStyles();
  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    const grid = document.getElementById("dashboardGrid");
    if (!grid) return;

    grid.addEventListener("pointerdown", rememberDragHandle, true);
    grid.addEventListener("dragstart", startDrag, true);
    grid.addEventListener("dragover", moveDrag, true);
    grid.addEventListener("drop", finishDrop, true);
    grid.addEventListener("dragend", finishDrag, true);

    observer = new MutationObserver(() => queueMicrotask(upgradeDashboard));
    observer.observe(grid, { childList: true, subtree: true });
    upgradeDashboard();
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DASHBOARD_STORAGE));
      return parsed && Array.isArray(parsed.widgets) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeState(state) {
    if (state) localStorage.setItem(DASHBOARD_STORAGE, JSON.stringify(state));
  }

  function normalizeLayout(state) {
    if (!state) return;
    const active = state.widgets.filter((widget) => !widget.archived);
    const counts = Array(COLUMN_COUNT).fill(0);

    active.forEach((widget, index) => {
      if (!Number.isInteger(widget.column) || widget.column < 0 || widget.column >= COLUMN_COUNT) {
        const smallest = counts.indexOf(Math.min(...counts));
        widget.column = smallest;
      }
      if (!Number.isFinite(widget.order)) widget.order = counts[widget.column];
      counts[widget.column] += 1;
    });
  }

  function upgradeDashboard() {
    if (upgrading) return;
    const grid = document.getElementById("dashboardGrid");
    if (!grid) return;

    upgrading = true;
    try {
      const state = readState();
      normalizeLayout(state);
      writeState(state);

      const directWidgets = [...grid.children].filter((child) => child.classList?.contains("widget"));
      const existingColumns = [...grid.children].filter((child) => child.classList?.contains("dashboard-column"));

      if (directWidgets.length || existingColumns.length !== COLUMN_COUNT) {
        const allWidgets = directWidgets.length
          ? directWidgets
          : existingColumns.flatMap((column) => [...column.children].filter((child) => child.classList?.contains("widget")));
        grid.replaceChildren();

        const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => {
          const column = document.createElement("section");
          column.className = "dashboard-column";
          column.dataset.column = String(index);
          grid.appendChild(column);
          return column;
        });

        allWidgets
          .sort((a, b) => {
            const aw = state?.widgets.find((widget) => widget.id === a.dataset.widgetId);
            const bw = state?.widgets.find((widget) => widget.id === b.dataset.widgetId);
            return (aw?.column ?? 0) - (bw?.column ?? 0) || (aw?.order ?? 0) - (bw?.order ?? 0);
          })
          .forEach((article) => {
            const widget = state?.widgets.find((item) => item.id === article.dataset.widgetId);
            columns[widget?.column ?? 0].appendChild(article);
          });
      }

      polishControls(grid, state);
    } finally {
      upgrading = false;
    }
  }

  function polishControls(grid, state) {
    grid.querySelectorAll(".widget").forEach((article) => {
      const widget = state?.widgets.find((item) => item.id === article.dataset.widgetId);
      const handle = article.querySelector(".drag-handle");
      if (handle) {
        handle.title = "Drag this box";
        handle.setAttribute("aria-label", "Drag this box");
      }

      const collapse = article.querySelector(".collapse-widget");
      if (collapse) {
        const collapsed = Boolean(widget?.collapsed || article.classList.contains("collapsed"));
        collapse.textContent = collapsed ? "□" : "−";
        collapse.title = collapsed ? "Restore box" : "Minimize box";
        collapse.setAttribute("aria-label", collapse.title);
      }

      const close = article.querySelector(".archive-widget");
      if (close) {
        close.textContent = "×";
        close.title = "Close box (move to Archive)";
        close.setAttribute("aria-label", close.title);
      }

      if (widget?.type === "ai") addGeminiButton(article);
    });
  }

  function addGeminiButton(article) {
    const wrap = article.querySelector(".ai-widget");
    if (!wrap || wrap.querySelector(".connect-gemini-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button ghost small connect-gemini-button";
    button.textContent = localStorage.getItem(GEMINI_STORAGE) ? "Change Gemini key" : "Connect Gemini";
    button.addEventListener("click", () => openGeminiDialog(article));
    wrap.appendChild(button);

    const note = document.createElement("div");
    note.className = "gemini-connection-note";
    note.textContent = localStorage.getItem(GEMINI_STORAGE)
      ? "Gemini key saved only in this browser."
      : "Connect here without returning to Vercel.";
    wrap.appendChild(note);
  }

  function openGeminiDialog(article) {
    let overlay = document.getElementById("geminiConnectionOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "geminiConnectionOverlay";
      overlay.className = "gemini-connect-overlay";
      overlay.innerHTML = `
        <div class="gemini-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="geminiConnectTitle">
          <div class="gemini-connect-header">
            <div><small>AI CONNECTION</small><h2 id="geminiConnectTitle">Connect Gemini</h2></div>
            <button type="button" class="gemini-connect-close" aria-label="Close">×</button>
          </div>
          <p>Paste your Gemini API key once. It stays in this browser and is sent only through your own Vercel function. It is never added to GitHub.</p>
          <label for="geminiConnectInput">Gemini API key</label>
          <input id="geminiConnectInput" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…">
          <div class="gemini-connect-actions">
            <button type="button" class="button ghost remove-gemini-key">Remove key</button>
            <span></span>
            <button type="button" class="button ghost cancel-gemini-key">Cancel</button>
            <button type="button" class="button primary save-gemini-key">Save and connect</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector(".gemini-connect-close").addEventListener("click", closeGeminiDialog);
      overlay.querySelector(".cancel-gemini-key").addEventListener("click", closeGeminiDialog);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeGeminiDialog(); });
      overlay.querySelector(".remove-gemini-key").addEventListener("click", () => {
        localStorage.removeItem(GEMINI_STORAGE);
        closeGeminiDialog();
        upgradeDashboard();
      });
    }

    const input = overlay.querySelector("#geminiConnectInput");
    const remove = overlay.querySelector(".remove-gemini-key");
    input.value = localStorage.getItem(GEMINI_STORAGE) || "";
    remove.hidden = !input.value;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    const save = overlay.querySelector(".save-gemini-key");
    save.onclick = () => {
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      localStorage.setItem(GEMINI_STORAGE, value);
      closeGeminiDialog();
      const retry = [...article.querySelectorAll(".ai-widget button")].find((candidate) => !candidate.classList.contains("connect-gemini-button"));
      if (retry) retry.click();
      else upgradeDashboard();
    };
    setTimeout(() => input.focus(), 0);
  }

  function closeGeminiDialog() {
    const overlay = document.getElementById("geminiConnectionOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
    upgradeDashboard();
  }

  function rememberDragHandle(event) {
    const handle = event.target.closest(".drag-handle");
    dragIntentId = handle?.closest(".widget")?.dataset.widgetId || null;
  }

  function startDrag(event) {
    const article = event.target.closest(".widget");
    if (!article || article.dataset.widgetId !== dragIntentId) {
      event.preventDefault();
      return;
    }
    event.stopImmediatePropagation();
    draggedId = article.dataset.widgetId;
    article.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
    try { event.dataTransfer.setDragImage(article, 24, 24); } catch (_) {}
  }

  function moveDrag(event) {
    if (!draggedId) return;
    const column = event.target.closest(".dashboard-column");
    if (!column) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const article = document.querySelector(`.widget[data-widget-id="${cssEscape(draggedId)}"]`);
    if (!article) return;
    const after = elementAfterY(column, event.clientY);
    if (after) column.insertBefore(article, after);
    else column.appendChild(article);

    document.querySelectorAll(".dashboard-column").forEach((item) => item.classList.toggle("drop-active", item === column));
  }

  function finishDrop(event) {
    if (!draggedId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    persistDomLayout();
    clearDrag();
  }

  function finishDrag(event) {
    if (!draggedId) return;
    event.stopImmediatePropagation();
    persistDomLayout();
    clearDrag();
  }

  function persistDomLayout() {
    const state = readState();
    if (!state) return;
    document.querySelectorAll("#dashboardGrid .dashboard-column").forEach((column) => {
      const columnIndex = Number(column.dataset.column);
      [...column.querySelectorAll(":scope > .widget")].forEach((article, order) => {
        const widget = state.widgets.find((item) => item.id === article.dataset.widgetId);
        if (widget) {
          widget.column = columnIndex;
          widget.order = order;
        }
      });
    });
    writeState(state);
  }

  function clearDrag() {
    draggedId = null;
    dragIntentId = null;
    document.querySelectorAll(".widget.dragging").forEach((article) => article.classList.remove("dragging"));
    document.querySelectorAll(".dashboard-column.drop-active").forEach((column) => column.classList.remove("drop-active"));
  }

  function elementAfterY(column, y) {
    return [...column.querySelectorAll(":scope > .widget:not(.dragging)")].reduce((closest, article) => {
      const box = article.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, article } : closest;
    }, { offset: Number.NEGATIVE_INFINITY, article: null }).article;
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #dashboardGrid { grid-template-columns: repeat(3, minmax(250px, 1fr)); align-items: start; }
      .dashboard-column { min-width: 0; min-height: 140px; display: flex; flex-direction: column; gap: 16px; border-radius: 14px; transition: background .12s ease, box-shadow .12s ease; }
      .dashboard-column.drop-active { background: rgba(37,99,235,.055); box-shadow: inset 0 0 0 2px rgba(37,99,235,.22); }
      .dashboard-column:empty::after { content: "Drop a box here"; min-height: 110px; border: 2px dashed #cbd5e1; border-radius: 14px; color: #94a3b8; display: grid; place-items: center; font-size: 12px; }
      .widget.dragging { opacity: .42 !important; transform: scale(.985); box-shadow: 0 14px 34px rgba(22,32,51,.16); }
      .widget-actions .collapse-widget, .widget-actions .archive-widget { font-size: 18px; line-height: 1; }
      .widget-actions .archive-widget:hover { color: #b42318; background: #fff0ef; }
      .connect-gemini-button { margin-top: 9px; margin-left: 7px; }
      .gemini-connection-note { margin-top: 8px; color: #657086; font-size: 10px; }
      .reader-body img { display: block; max-width: 100%; height: auto; margin: 0 auto 14px; }
      .gemini-connect-overlay { position: fixed; inset: 0; z-index: 1000; display: none; place-items: center; padding: 16px; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); }
      .gemini-connect-overlay.open { display: grid; }
      .gemini-connect-dialog { width: min(520px, calc(100vw - 32px)); background: white; border-radius: 18px; padding: 20px; box-shadow: 0 22px 70px rgba(15,23,42,.25); }
      .gemini-connect-header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
      .gemini-connect-header small { color: #2563eb; font-weight: 800; letter-spacing: .1em; }
      .gemini-connect-header h2 { margin: 3px 0 0; }
      .gemini-connect-close { border: 0; background: transparent; font-size: 25px; color: #475569; }
      .gemini-connect-dialog > p { color: #657086; font-size: 13px; line-height: 1.55; }
      .gemini-connect-dialog label { display: block; margin: 14px 0 6px; font-size: 12px; font-weight: 800; }
      .gemini-connect-dialog input { width: 100%; border: 1px solid #ccd4df; border-radius: 10px; padding: 11px; font: inherit; }
      .gemini-connect-actions { display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; align-items: center; margin-top: 18px; }
      @media (max-width: 1100px) { #dashboardGrid { grid-template-columns: repeat(2, minmax(250px, 1fr)); } }
      @media (max-width: 760px) { #dashboardGrid { grid-template-columns: 1fr; } .dashboard-column { min-height: 0; } .dashboard-column:empty { display: none; } .gemini-connect-actions { grid-template-columns: 1fr 1fr; } .gemini-connect-actions span { display: none; } }
    `;
    document.head.appendChild(style);
  }
})();
