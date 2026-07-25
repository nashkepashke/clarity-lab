(() => {
  "use strict";

  const DASHBOARD_KEY = "netvibes-ai-dashboard-v1";
  const nativeFetch = window.fetch.bind(window);

  // Repair transient state left behind by a refresh/redeploy. Loading is never
  // something we want to remember between page loads.
  repairStoredState(true);

  // Give RSS and Gemini requests a browser-side timeout as a second safety net.
  window.fetch = function dashboardFetch(input, init = {}) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const timeoutMs = /\/api\/rss(?:\?|$)/.test(url)
      ? 15000
      : /\/api\/gemini(?:\?|$)/.test(url)
        ? 45000
        : 0;

    if (!timeoutMs || init.signal) return nativeFetch(input, init);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .catch((error) => {
        if (error && error.name === "AbortError") {
          throw new Error(/\/api\/rss(?:\?|$)/.test(url)
            ? "Feed refresh timed out. Try again."
            : "The AI request timed out. Try again.");
        }
        throw error;
      })
      .finally(() => clearTimeout(timer));
  };

  document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("dashboardGrid");
    if (!grid) return;

    const polish = () => {
      // Keep transient loading flags out of localStorage even while a request
      // is currently running in memory.
      repairStoredState(false);

      grid.querySelectorAll(".widget").forEach((article) => {
        // The body is never draggable. Text can be selected and edited normally.
        article.draggable = false;

        const header = article.querySelector(".widget-header");
        if (header) {
          header.draggable = true;
          header.title = "Drag this box";
          header.style.cursor = "grab";
        }

        article.querySelectorAll("button, a, input, textarea, select").forEach((control) => {
          control.draggable = false;
        });

        const collapse = article.querySelector(".collapse-widget");
        if (collapse) {
          const minimized = article.classList.contains("collapsed");
          collapse.textContent = minimized ? "□" : "−";
          collapse.title = minimized ? "Restore box" : "Minimize box";
          collapse.setAttribute("aria-label", collapse.title);
        }

        const archive = article.querySelector(".archive-widget");
        if (archive) {
          archive.textContent = "×";
          archive.title = "Close box (move to Archive)";
          archive.setAttribute("aria-label", archive.title);
        }

        // Older dashboards stored the starter hint as real note text. Treat it
        // as a placeholder instead, so typing starts in an empty note.
        const notes = article.querySelector(".notes-textarea");
        if (notes) {
          notes.placeholder = "Things to remember…";
          if (notes.value === "Things to remember…") notes.value = "";
        }
      });
    };

    polish();
    const observer = new MutationObserver(polish);
    observer.observe(grid, { childList: true, subtree: true });
  });

  function repairStoredState(clearLegacyNotes) {
    try {
      const raw = localStorage.getItem(DASHBOARD_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state || !Array.isArray(state.widgets)) return;

      let changed = false;
      state.widgets.forEach((widget) => {
        if (!widget || !widget.data) return;
        if ((widget.type === "rss" || widget.type === "ai") && widget.data.loading) {
          widget.data.loading = false;
          changed = true;
        }
        if (clearLegacyNotes && widget.type === "notes" && widget.data.text === "Things to remember…") {
          widget.data.text = "";
          changed = true;
        }
      });

      if (changed) localStorage.setItem(DASHBOARD_KEY, JSON.stringify(state));
    } catch (_) {
      // A damaged backup should not prevent the dashboard itself from loading.
    }
  }
})();
