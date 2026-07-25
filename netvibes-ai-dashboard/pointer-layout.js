(() => {
  "use strict";

  const STORAGE_KEY = "netvibes-ai-dashboard-v1";
  const THRESHOLD = 6;
  let session = null;

  // Kill HTML5 drag-and-drop before the core app can enter a browser drag state.
  document.addEventListener("dragstart", (event) => {
    if (event.target?.closest?.(".widget-drag-zone, .widget-header")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", cancelSession, true);
  window.addEventListener("blur", cancelSession);

  injectStyles();

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("button, a, input, textarea, select, label")) return;

    const header = event.target.closest(".widget-header");
    const card = header?.closest(".widget");
    if (!header || !card || !card.dataset.widgetId) return;

    session = {
      id: card.dataset.widgetId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      card,
      started: false,
      ghost: null,
      placeholder: null,
      sourceColumn: card.closest(".dashboard-column")
    };
  }

  function onPointerMove(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    session.lastX = event.clientX;
    session.lastY = event.clientY;

    if (!session.started) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (distance < THRESHOLD) return;
      startSession(event);
    }

    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    movePlaceholder(event.clientX, event.clientY);
  }

  function startSession(event) {
    if (!session || session.started) return;
    const rect = session.card.getBoundingClientRect();

    const placeholder = document.createElement("div");
    placeholder.className = "pointer-drop-placeholder";
    placeholder.style.height = `${Math.max(48, rect.height)}px`;
    session.card.parentNode.insertBefore(placeholder, session.card);

    const ghost = session.card.cloneNode(true);
    ghost.classList.add("pointer-drag-ghost");
    ghost.classList.remove("dragging", "drag-over", "drop-before");
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);

    session.placeholder = placeholder;
    session.ghost = ghost;
    session.started = true;
    session.card.classList.add("pointer-drag-source");
    document.body.classList.add("pointer-layout-dragging");

    moveGhost(event.clientX, event.clientY);
    movePlaceholder(event.clientX, event.clientY);
  }

  function moveGhost(x, y) {
    if (!session?.ghost) return;
    session.ghost.style.transform = `translate3d(${Math.round(x + 14)}px, ${Math.round(y + 14)}px, 0)`;
  }

  function movePlaceholder(x, y) {
    if (!session?.placeholder) return;
    const column = columnAt(x, y);
    if (!column) return;

    document.querySelectorAll(".dashboard-column").forEach((item) => {
      item.classList.toggle("pointer-drop-active", item === column);
    });

    const cards = [...column.children].filter((node) =>
      node.classList?.contains("widget") &&
      node !== session.card &&
      !node.classList.contains("pointer-drag-source")
    );

    const before = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });

    if (before) column.insertBefore(session.placeholder, before);
    else column.appendChild(session.placeholder);
  }

  function columnAt(x, y) {
    const hit = document.elementFromPoint(x, y)?.closest?.(".dashboard-column");
    if (hit) return hit;

    const columns = [...document.querySelectorAll(".dashboard-column")];
    if (!columns.length) return null;
    return columns.reduce((best, column) => {
      const rect = column.getBoundingClientRect();
      const cx = Math.max(rect.left, Math.min(x, rect.right));
      const cy = Math.max(rect.top, Math.min(y, rect.bottom));
      const distance = Math.hypot(x - cx, y - cy);
      return !best || distance < best.distance ? { column, distance } : best;
    }, null)?.column || null;
  }

  function onPointerUp(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    if (!session.started) {
      session = null;
      return;
    }

    const placeholder = session.placeholder;
    const targetColumn = placeholder?.closest(".dashboard-column");
    if (!placeholder || !targetColumn) {
      cancelSession();
      return;
    }

    let next = placeholder.nextElementSibling;
    while (next && (!next.classList.contains("widget") || next === session.card)) next = next.nextElementSibling;

    const beforeId = next?.dataset.widgetId || null;
    const columnIndex = Number(targetColumn.dataset.column);
    const moved = persistMove(session.id, columnIndex, beforeId);
    cleanupVisuals();
    session = null;

    if (moved) {
      // Core app keeps its own in-memory state. Reload once so it adopts the saved layout.
      window.location.reload();
    }
  }

  function persistMove(id, targetColumn, beforeId) {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!state || !Array.isArray(state.widgets)) return false;
      const moved = state.widgets.find((widget) => widget.id === id);
      if (!moved || !Number.isInteger(targetColumn)) return false;

      const columnCount = Math.max(3, ...state.widgets.map((widget) => Number(widget.column) + 1 || 0));
      const columns = Array.from({ length: columnCount }, (_, column) => state.widgets
        .filter((widget) => !widget.archived && widget.id !== id && Number(widget.column) === column)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));

      while (columns.length <= targetColumn) columns.push([]);
      const target = columns[targetColumn];
      let index = beforeId ? target.findIndex((widget) => widget.id === beforeId) : -1;
      if (index < 0) index = target.length;
      target.splice(index, 0, moved);

      columns.forEach((items, column) => items.forEach((widget, order) => {
        widget.column = column;
        widget.order = order;
      }));

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cancelSession() {
    if (!session) return;
    cleanupVisuals();
    session = null;
  }

  function cleanupVisuals() {
    session?.ghost?.remove();
    session?.placeholder?.remove();
    session?.card?.classList.remove("pointer-drag-source");
    document.body.classList.remove("pointer-layout-dragging");
    document.querySelectorAll(".dashboard-column.pointer-drop-active").forEach((column) => column.classList.remove("pointer-drop-active"));
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .widget-header { cursor: grab !important; }
      .widget-header:active { cursor: grabbing !important; }
      .widget-header .widget-actions, .widget-header .widget-actions * { cursor: pointer !important; }
      .widget-drag-zone { cursor: inherit !important; }
      .pointer-layout-dragging { user-select: none !important; cursor: grabbing !important; }
      .pointer-layout-dragging * { cursor: grabbing !important; }
      .pointer-layout-dragging .widget-actions, .pointer-layout-dragging .widget-actions * { pointer-events: none !important; }
      .pointer-drag-source { visibility: hidden !important; }
      .pointer-drag-ghost {
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        z-index: 9999 !important;
        pointer-events: none !important;
        opacity: .88 !important;
        transform-origin: top left;
        box-shadow: 0 18px 50px rgba(15, 23, 42, .22) !important;
      }
      .pointer-drop-placeholder {
        border: 2px dashed var(--primary, #2563eb);
        border-radius: 14px;
        background: rgba(37, 99, 235, .07);
        min-height: 48px;
      }
      .dashboard-column.pointer-drop-active {
        background: rgba(37, 99, 235, .035);
        box-shadow: inset 0 0 0 2px rgba(37, 99, 235, .14);
      }
    `;
    document.head.appendChild(style);
  }
})();
