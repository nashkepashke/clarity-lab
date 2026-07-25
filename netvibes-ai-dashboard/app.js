(() => {
  "use strict";

  const KEY = "netvibes-ai-dashboard-v1";
  const $ = (id) => document.getElementById(id);
  let state = loadState();
  let draggedId = null;
  let confirmAction = null;
  let toastTimer = null;

  const E = {
    grid: $("dashboardGrid"), archive: $("archiveGrid"), archiveCount: $("archiveCount"),
    empty: $("emptyState"), dashboardView: $("dashboardView"), archiveView: $("archiveView"),
    sidebar: $("sidebar"), backdrop: $("modalBackdrop"), add: $("addWidgetModal"),
    reader: $("readerModal"), event: $("calendarEventModal"), confirm: $("confirmModal"),
    picker: $("widgetTypePicker"), form: $("widgetForm"), type: $("widgetType"),
    title: $("widgetTitle"), fields: $("dynamicFields"), source: $("readerSource"),
    readerTitle: $("readerTitle"), readerBody: $("readerBody"), readerFooter: $("readerFooter"),
    eventForm: $("eventForm"), eventWidgetId: $("eventWidgetId"), eventTitle: $("eventTitleInput"),
    eventDate: $("eventDate"), eventTime: $("eventTime"), eventDetails: $("eventDetails"),
    confirmTitle: $("confirmTitle"), confirmText: $("confirmText"), toast: $("toast")
  };

  repairTransientState();
  $("todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric"
  }).format(new Date());
  wire();
  saveState();
  render();

  function defaults() {
    return { widgets: [
      widget("welcome", "Welcome"),
      widget("rss", "xkcd", { url: "https://xkcd.com/rss.xml", maxItems: 7 }),
      widget("rss", "BBC World", { url: "https://feeds.bbci.co.uk/news/world/rss.xml", maxItems: 8 }),
      widget("ai", "Daily brief", { interests: "Important and surprising items with minimal repetition" }),
      widget("calendar", "Calendar"),
      widget("notes", "Notes", {}, { text: "" })
    ]};
  }

  function widget(type, title, config = {}, data = {}) {
    if (type === "rss") data = { items: [], loading: false, error: null, lastUpdated: null, ...data };
    if (type === "calendar") data = { events: [], ...data };
    if (type === "ai") data = { summary: null, loading: false, error: null, ...data };
    if (type === "notes") data = { text: "", ...data };
    return { id: uid(), type, title, config, data, collapsed: false, archived: false };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return parsed && Array.isArray(parsed.widgets) ? parsed : defaults();
    } catch (_) {
      return defaults();
    }
  }

  function repairTransientState() {
    state.widgets.forEach((w) => {
      w.data = w.data || {};
      w.data.loading = false;
      if (w.type === "notes" && w.data.text === "Things to remember…") w.data.text = "";
      if (w.type === "rss") {
        w.data.items = Array.isArray(w.data.items) ? w.data.items : [];
        w.data.error = null;
      }
      if (w.type === "calendar") w.data.events = Array.isArray(w.data.events) ? w.data.events : [];
    });
  }

  function saveState() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.widgets.forEach((w) => { if (w.data) w.data.loading = false; });
    localStorage.setItem(KEY, JSON.stringify(copy));
    E.archiveCount.textContent = String(state.widgets.filter((w) => w.archived).length);
  }

  function wire() {
    $("addWidgetButton").onclick = openAdd;
    document.querySelectorAll("[data-open-add]").forEach((b) => b.onclick = openAdd);
    $("summaryButton").onclick = generateFirstSummary;
    $("refreshAllButton").onclick = () => refreshAll(true);
    $("exportButton").onclick = exportBackup;
    $("importInput").onchange = importBackup;
    $("resetButton").onclick = () => ask(
      "Reset dashboard?",
      "All current boxes will be replaced by the starter dashboard.",
      () => { state = defaults(); saveState(); render(); toast("Dashboard reset."); }
    );
    $("sidebarToggle").onclick = () => E.sidebar.classList.toggle("open");
    $("backToTypes").onclick = showTypes;
    $("confirmAction").onclick = () => { if (confirmAction) confirmAction(); closeModals(); };
    E.backdrop.onclick = closeModals;
    document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModals);
    document.onkeydown = (e) => { if (e.key === "Escape") closeModals(); };
    document.querySelectorAll(".nav-item").forEach((b) => b.onclick = () => switchView(b.dataset.view));
    document.querySelectorAll(".type-card").forEach((b) => b.onclick = () => selectType(b.dataset.widgetType));
    E.form.onsubmit = addFromForm;
    E.eventForm.onsubmit = addEvent;
  }

  function render() {
    const active = state.widgets.filter((w) => !w.archived);
    E.grid.innerHTML = "";
    E.empty.classList.toggle("hidden", active.length > 0);
    active.forEach((w) => E.grid.appendChild(renderWidget(w)));
    renderArchive();
    saveState();
  }

  function renderWidget(w) {
    const el = document.createElement("article");
    el.className = `widget${w.collapsed ? " collapsed" : ""}`;
    el.dataset.widgetId = w.id;
    el.innerHTML = `<header class="widget-header" draggable="true">
      <span class="drag-handle" title="Drag box">⠿</span><span class="widget-icon">${icon(w.type)}</span>
      <div class="widget-heading"><h3>${esc(w.title)}</h3><p>${esc(subtitle(w))}</p></div>
      <div class="widget-actions">${w.type === "rss" ? '<button class="icon-button refresh-widget" title="Refresh feed" aria-label="Refresh feed">↻</button>' : ""}
      <button class="icon-button collapse-widget" title="${w.collapsed ? "Restore box" : "Minimize box"}" aria-label="${w.collapsed ? "Restore box" : "Minimize box"}">${w.collapsed ? "□" : "−"}</button>
      <button class="icon-button archive-widget" title="Close box (move to Archive)" aria-label="Close box">×</button></div></header><div class="widget-body"></div>`;

    const header = el.querySelector(".widget-header");
    header.ondragstart = (e) => {
      if (e.target.closest("button")) return e.preventDefault();
      draggedId = w.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", w.id);
    };
    header.ondragend = () => { draggedId = null; el.classList.remove("dragging"); clearDrag(); };
    el.ondragover = (e) => { if (!draggedId || draggedId === w.id) return; e.preventDefault(); el.classList.add("drag-over"); };
    el.ondragleave = () => el.classList.remove("drag-over");
    el.ondrop = (e) => { e.preventDefault(); clearDrag(); if (draggedId && draggedId !== w.id) reorder(draggedId, w.id); };

    el.querySelector(".collapse-widget").onclick = (e) => { e.stopPropagation(); w.collapsed = !w.collapsed; render(); };
    el.querySelector(".archive-widget").onclick = (e) => { e.stopPropagation(); w.archived = true; render(); toast("Box moved to Archive."); };
    const refresh = el.querySelector(".refresh-widget");
    if (refresh) refresh.onclick = (e) => { e.stopPropagation(); refreshFeed(w.id, true); };
    renderBody(w, el.querySelector(".widget-body"));
    return el;
  }

  function renderBody(w, body) {
    if (w.type === "welcome") {
      body.innerHTML = `<div class="welcome-box"><h4>A modular personal home page</h4><p>Add RSS feeds and other boxes. Drag boxes only from their top bar.</p><button class="button primary small">＋ Add a box</button></div>`;
      body.querySelector("button").onclick = openAdd;
    } else if (w.type === "rss") renderRss(w, body);
    else if (w.type === "calendar") renderCalendar(w, body);
    else if (w.type === "notes") {
      body.innerHTML = `<textarea class="notes-textarea" placeholder="Write anything…">${esc(w.data.text || "")}</textarea>`;
      body.querySelector("textarea").oninput = debounce((e) => { w.data.text = e.target.value; saveState(); }, 200);
    } else if (w.type === "ai") renderAi(w, body);
    else if (w.type === "xsearch") {
      const q = w.config.query || "";
      body.innerHTML = `<div class="xsearch-box"><div class="xsearch-query">${esc(q)}</div><a class="button primary" target="_blank" rel="noopener noreferrer" href="https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query">Open live search</a></div>`;
    }
  }

  function renderRss(w, body) {
    if (w.data.loading) {
      body.innerHTML = `<div class="widget-status">Refreshing feed…<div><button class="text-button cancel-refresh">Cancel</button></div></div>`;
      body.querySelector(".cancel-refresh").onclick = () => { w.data.loading = false; render(); };
      return;
    }
    if (w.data.error) {
      body.innerHTML = `<div class="widget-error">${esc(w.data.error)}<br><button class="text-button">Try again</button></div>`;
      body.querySelector("button").onclick = () => refreshFeed(w.id, true);
      return;
    }
    if (!w.data.items.length) {
      body.innerHTML = `<div class="widget-status">No items loaded yet.<div><button class="text-button">Refresh feed</button></div></div>`;
      body.querySelector("button").onclick = () => refreshFeed(w.id, true);
      return;
    }
    const max = Number(w.config.maxItems || 8);
    body.innerHTML = `<ul class="feed-list">${w.data.items.slice(0, max).map((item, i) => `<li class="feed-item"><button class="feed-button" data-i="${i}"><span><span class="feed-title">${esc(item.title || "Untitled")}</span><span class="feed-meta">${esc(item.author || "")}${item.publishedAt ? ` · ${esc(relative(item.publishedAt))}` : ""}</span></span>${item.imageUrl ? `<img class="feed-thumb" src="${attr(item.imageUrl)}" alt="" loading="lazy">` : ""}</button></li>`).join("")}</ul><div class="feed-footer"><span>${w.data.lastUpdated ? `Updated ${esc(relative(w.data.lastUpdated))}` : ""}</span><button class="text-button">Refresh</button></div>`;
    body.querySelectorAll(".feed-button").forEach((b) => b.onclick = () => openItem(w, w.data.items[Number(b.dataset.i)]));
    body.querySelector(".feed-footer button").onclick = () => refreshFeed(w.id, true);
  }

  function renderCalendar(w, body) {
    const events = [...w.data.events].sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`));
    body.innerHTML = `<div class="calendar-toolbar"><strong>Upcoming</strong><button class="button secondary small">＋ Add</button></div>${events.length ? `<ul class="event-list">${events.map((e) => { const d = new Date(`${e.date}T12:00:00`); return `<li class="event-item"><div class="event-date"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString(undefined,{month:"short"})}</span></div><div class="event-copy"><strong>${esc(e.title)}</strong><small>${esc([e.time,e.details].filter(Boolean).join(" · "))}</small></div><button class="event-delete" data-id="${attr(e.id)}">✕</button></li>`; }).join("")}</ul>` : '<div class="widget-status">No upcoming items.</div>'}`;
    body.querySelector(".calendar-toolbar button").onclick = () => openEvent(w.id);
    body.querySelectorAll(".event-delete").forEach((b) => b.onclick = () => { w.data.events = w.data.events.filter((e) => e.id !== b.dataset.id); render(); });
  }

  function renderAi(w, body) {
    body.innerHTML = `<div class="ai-widget"><p>Summarize the current RSS items according to your interests.</p>${w.data.error ? `<div class="widget-error">${esc(w.data.error)}</div>` : ""}<div class="ai-result">${w.data.summary ? summaryHtml(w.data.summary) : "No brief generated yet."}</div><button class="button primary small" ${w.data.loading ? "disabled" : ""}>${w.data.loading ? "Generating…" : "✨ Generate brief"}</button></div>`;
    body.querySelector("button").onclick = () => generateSummary(w.id);
  }

  function renderArchive() {
    const items = state.widgets.filter((w) => w.archived);
    E.archive.innerHTML = items.length ? items.map((w) => `<div class="archive-card"><div><h3>${esc(w.title)}</h3><p>${esc(typeName(w.type))}</p></div><div class="archive-actions"><button class="button ghost small" data-restore="${attr(w.id)}">Restore</button><button class="button danger small" data-delete="${attr(w.id)}">Delete</button></div></div>`).join("") : '<div class="widget-status">No archived boxes.</div>';
    E.archive.querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => { find(b.dataset.restore).archived = false; render(); });
    E.archive.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => ask("Delete permanently?", "This box and its saved contents will be removed.", () => { state.widgets = state.widgets.filter((w) => w.id !== b.dataset.delete); render(); }));
  }

  async function refreshFeed(id, notify = false) {
    const w = find(id);
    if (!w || w.type !== "rss" || w.data.loading) return;
    w.data.loading = true;
    w.data.error = null;
    render();
    try {
      const r = await fetchTimeout(`/api/rss?url=${encodeURIComponent(w.config.url)}`, {}, 15000);
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data.error || `Feed request failed (${r.status}).`);
      w.data.items = Array.isArray(data.items) ? data.items : [];
      w.data.feedTitle = data.title || "";
      w.data.lastUpdated = new Date().toISOString();
      if (notify) toast(`Refreshed ${w.title}.`);
    } catch (e) {
      w.data.error = e.name === "AbortError" ? "The feed took too long to load." : (e.message || "Could not load this feed.");
    } finally {
      w.data.loading = false;
      render();
    }
  }

  async function refreshAll(notify) {
    const feeds = state.widgets.filter((w) => !w.archived && w.type === "rss");
    for (const w of feeds) await refreshFeed(w.id, false);
    if (notify) toast("Finished refreshing feeds.");
  }

  async function generateSummary(id) {
    const w = find(id);
    if (!w || w.data.loading) return;
    const items = state.widgets.filter((x) => !x.archived && x.type === "rss")
      .flatMap((x) => x.data.items.slice(0, 12).map((i) => ({ source: x.title, title: i.title, excerpt: strip(i.excerpt || i.contentHtml || ""), url: i.url || i.canonicalUrl || null })))
      .slice(0, 40);
    if (!items.length) return toast("Refresh at least one RSS feed first.");
    w.data.loading = true; w.data.error = null; render();
    try {
      const r = await fetchTimeout("/api/gemini", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests: w.config.interests || "Important items", items })
      }, 30000);
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data.error || `AI request failed (${r.status}).`);
      w.data.summary = data.summary;
      w.data.generatedAt = new Date().toISOString();
    } catch (e) {
      w.data.error = e.name === "AbortError" ? "The AI request took too long." : (e.message || "Could not create the brief.");
    } finally {
      w.data.loading = false;
      render();
    }
  }

  function generateFirstSummary() {
    let w = state.widgets.find((x) => !x.archived && x.type === "ai");
    if (!w) { w = widget("ai", "Daily brief", { interests: "Important and surprising items" }); state.widgets.push(w); render(); }
    generateSummary(w.id);
  }

  function openItem(w, item) {
    E.source.textContent = w.title;
    E.readerTitle.textContent = item.title || "Untitled";
    const url = item.url || item.canonicalUrl || "";
    const yt = youtubeId(url);
    E.readerBody.innerHTML = yt ? `<iframe src="https://www.youtube-nocookie.com/embed/${attr(yt)}" allowfullscreen title="Video"></iframe>` : sanitize(item.contentHtml || item.excerpt || "No preview is available for this item.");
    if (item.imageUrl && !E.readerBody.querySelector("img")) E.readerBody.insertAdjacentHTML("afterbegin", `<p><img src="${attr(item.imageUrl)}" alt=""></p>`);
    E.readerFooter.innerHTML = url ? `<a class="button primary" href="${attr(url)}" target="_blank" rel="noopener noreferrer">Open original</a>` : "";
    openModal(E.reader);
  }

  function openAdd() { showTypes(); openModal(E.add); }
  function showTypes() { E.picker.classList.remove("hidden"); E.form.classList.add("hidden"); E.form.reset(); E.fields.innerHTML = ""; }
  function selectType(type) {
    E.type.value = type; E.picker.classList.add("hidden"); E.form.classList.remove("hidden");
    const presets = {
      rss: ["RSS feed", `<div class="form-row"><label>Feed address</label><input id="feedUrl" type="url" required placeholder="https://example.com/feed.xml"><span class="help">Paste an RSS or Atom address.</span></div><div class="form-row"><label>Items shown</label><select id="feedMax"><option>5</option><option selected>8</option><option>12</option></select></div>`],
      calendar: ["Calendar", ""], notes: ["Notes", ""],
      ai: ["Daily brief", `<div class="form-row"><label>Your interests</label><textarea id="aiInterests" rows="4">Important and surprising items, with minimal repetition</textarea></div>`],
      xsearch: ["X search", `<div class="form-row"><label>Search words</label><input id="xQuery" required placeholder="addiction psychiatry"><span class="help">This opens the live search on X.</span></div>`]
    };
    E.title.value = presets[type][0]; E.fields.innerHTML = presets[type][1]; E.title.focus(); E.title.select();
  }

  function addFromForm(e) {
    e.preventDefault();
    const type = E.type.value; let config = {};
    if (type === "rss") config = { url: $("feedUrl").value.trim(), maxItems: Number($("feedMax").value) };
    if (type === "ai") config = { interests: $("aiInterests").value.trim() };
    if (type === "xsearch") config = { query: $("xQuery").value.trim() };
    const w = widget(type, E.title.value.trim(), config);
    state.widgets.push(w); render(); closeModals(); toast("Box added.");
    if (type === "rss") refreshFeed(w.id, true);
  }

  function openEvent(id) { E.eventForm.reset(); E.eventWidgetId.value = id; E.eventDate.value = localDate(new Date()); openModal(E.event); E.eventTitle.focus(); }
  function addEvent(e) {
    e.preventDefault(); const w = find(E.eventWidgetId.value); if (!w) return;
    w.data.events.push({ id: uid(), title: E.eventTitle.value.trim(), date: E.eventDate.value, time: E.eventTime.value, details: E.eventDetails.value.trim() });
    render(); closeModals(); toast("Calendar item added.");
  }

  function reorder(fromId, toId) {
    const a = state.widgets.findIndex((w) => w.id === fromId), b = state.widgets.findIndex((w) => w.id === toId);
    if (a < 0 || b < 0) return;
    const [moved] = state.widgets.splice(a, 1);
    const target = state.widgets.findIndex((w) => w.id === toId);
    state.widgets.splice(target, 0, moved);
    draggedId = null; render();
  }
  function clearDrag() { document.querySelectorAll(".drag-over").forEach((x) => x.classList.remove("drag-over")); }
  function switchView(view) { document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x.dataset.view === view)); E.dashboardView.classList.toggle("hidden", view !== "dashboard"); E.archiveView.classList.toggle("hidden", view !== "archive"); E.sidebar.classList.remove("open"); }
  function ask(title, text, action) { confirmAction = action; E.confirmTitle.textContent = title; E.confirmText.textContent = text; openModal(E.confirm); }
  function openModal(m) { closeModals(); E.backdrop.classList.remove("hidden"); m.classList.remove("hidden"); document.body.style.overflow = "hidden"; }
  function closeModals() { [E.add,E.reader,E.event,E.confirm].forEach((x) => x.classList.add("hidden")); E.backdrop.classList.add("hidden"); document.body.style.overflow = ""; confirmAction = null; }

  function exportBackup() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"})); a.download = `ai-dashboard-${localDate(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); }
  async function importBackup(e) { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const x = JSON.parse(await f.text()); if (!Array.isArray(x.widgets)) throw new Error(); state = x; repairTransientState(); render(); toast("Backup imported."); } catch (_) { toast("That file is not a valid dashboard backup."); } }

  async function fetchTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
  async function safeJson(response) { try { return await response.json(); } catch (_) { return {}; } }
  function find(id) { return state.widgets.find((w) => w.id === id); }
  function icon(t) { return ({welcome:"N",rss:"◉",calendar:"▣",notes:"✎",ai:"✨",xsearch:"𝕏"})[t] || "□"; }
  function typeName(t) { return ({welcome:"Welcome",rss:"RSS feed",calendar:"Calendar",notes:"Notes",ai:"AI brief",xsearch:"X search"})[t] || t; }
  function subtitle(w) { if (w.type === "rss") return w.data.feedTitle || hostname(w.config.url) || "RSS feed"; return ({welcome:"Start here",calendar:"Local calendar",notes:"Saved automatically",ai:"Gemini summary",xsearch:"Live search shortcut"})[w.type] || ""; }
  function hostname(url) { try { return new URL(url).hostname.replace(/^www\./,""); } catch (_) { return ""; } }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
  function localDate(d) { return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function relative(v) { const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; const s = Math.round((d-Date.now())/1000), a=Math.abs(s), f=new Intl.RelativeTimeFormat(undefined,{numeric:"auto"}); if(a<60)return f.format(s,"second"); if(a<3600)return f.format(Math.round(s/60),"minute"); if(a<86400)return f.format(Math.round(s/3600),"hour"); if(a<604800)return f.format(Math.round(s/86400),"day"); return d.toLocaleDateString(); }
  function strip(v) { return new DOMParser().parseFromString(String(v||""),"text/html").body.textContent.replace(/\s+/g," ").trim(); }
  function esc(v) { return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
  function attr(v) { return esc(v).replaceAll("`","&#096;"); }
  function youtubeId(url) { try { const u=new URL(url); if(u.hostname.includes("youtu.be"))return u.pathname.slice(1).split("/")[0]; if(u.hostname.includes("youtube.com"))return u.searchParams.get("v"); } catch (_){} return null; }
  function sanitize(html) { const d=new DOMParser().parseFromString(String(html||""),"text/html"), tags=new Set("A P BR DIV SPAN STRONG B EM I UL OL LI BLOCKQUOTE PRE CODE H1 H2 H3 H4 IMG FIGURE FIGCAPTION HR TABLE THEAD TBODY TR TH TD".split(" ")); [...d.body.querySelectorAll("*")].forEach((n)=>{ if(!tags.has(n.tagName)){n.replaceWith(...n.childNodes);return;} [...n.attributes].forEach((a)=>{const ok=(n.tagName==="A"&&["href","title"].includes(a.name))||(n.tagName==="IMG"&&["src","alt","title","width","height"].includes(a.name)); if(!ok)n.removeAttribute(a.name);}); if(n.tagName==="A"){const h=n.getAttribute("href")||""; if(!/^https?:\/\//i.test(h))n.removeAttribute("href"); else {n.target="_blank";n.rel="noopener noreferrer";}} if(n.tagName==="IMG"&&!/^https?:\/\//i.test(n.getAttribute("src")||""))n.remove(); }); return d.body.innerHTML; }
  function summaryHtml(s) { if (typeof s === "string") return `<p>${esc(s).replaceAll("\n","<br>")}</p>`; return `${s.overview?`<p>${esc(s.overview)}</p>`:""}${Array.isArray(s.highlights)?`<h4>Highlights</h4><ul>${s.highlights.map((x)=>`<li><strong>${esc(x.title||"Item")}</strong>${x.whyItMatters?` — ${esc(x.whyItMatters)}`:""}</li>`).join("")}</ul>`:""}${Array.isArray(s.themes)&&s.themes.length?`<h4>Themes</h4><p>${s.themes.map(esc).join(" · ")}</p>`:""}`; }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  function toast(msg) { clearTimeout(toastTimer); E.toast.textContent=msg; E.toast.classList.remove("hidden"); toastTimer=setTimeout(()=>E.toast.classList.add("hidden"),3500); }
})();