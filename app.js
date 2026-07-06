/* Crypto Gambling Radar — Frontend (Vanilla JS + Supabase REST) */

const SUPABASE_URL = "https://abeheiewozqbkylmgrqr.supabase.co";
const SUPABASE_KEY = "sb_publishable_OysS4ElWHUiZNcC5aVdt8g__8LkRzh4";
const TABLE = "casinos";
const PAGE_SIZE = 50;

const API = `${SUPABASE_URL}/rest/v1/${TABLE}`;
const HEADERS = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };

const state = { page: 0, total: 0, search: "", sort: "bekanntheits_score.desc.nullslast", filters: {} };
let currentRecord = null;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Query-Aufbau ---------- */
function buildFilterParams() {
  const p = new URLSearchParams();
  for (const [col, val] of Object.entries(state.filters)) {
    if (val) p.append(col, `eq.${val}`);
  }
  const q = state.search.trim().replace(/[,()*]/g, " ").trim();
  if (q) p.append("or", `(title.ilike.*${q}*,website.ilike.*${q}*,notizen.ilike.*${q}*)`);
  return p;
}

/* ---------- Daten laden ---------- */
async function loadPage() {
  const p = buildFilterParams();
  p.append("select", "*");
  p.append("order", state.sort);
  p.append("limit", PAGE_SIZE);
  p.append("offset", state.page * PAGE_SIZE);

  $("#results-meta").textContent = "Lade Daten …";
  try {
    const res = await fetch(`${API}?${p}`, { headers: { ...HEADERS, Prefer: "count=exact" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = await res.json();
    const range = res.headers.get("content-range"); // z.B. "0-49/11886"
    state.total = range ? parseInt(range.split("/")[1], 10) || 0 : rows.length;
    renderRows(rows);
    renderMeta();
  } catch (e) {
    $("#results-meta").textContent = "Fehler beim Laden: " + e.message;
  }
}

async function countWhere(params) {
  const res = await fetch(`${API}?${params}&select=id&limit=1`, {
    method: "HEAD",
    headers: { ...HEADERS, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  return range ? parseInt(range.split("/")[1], 10) || 0 : 0;
}

async function loadStats() {
  try {
    const [total, nonkyc, sport, fertig] = await Promise.all([
      countWhere(new URLSearchParams()),
      countWhere(new URLSearchParams({ kyc: "eq.Non-KYC" })),
      countWhere(new URLSearchParams({ sportwetten: "eq.Ja" })),
      countWhere(new URLSearchParams({ recherche_status: "eq.Fertig" })),
    ]);
    $("#stat-total").textContent = total.toLocaleString("de-AT");
    $("#stat-nonkyc").textContent = nonkyc.toLocaleString("de-AT");
    $("#stat-sport").textContent = sport.toLocaleString("de-AT");
    $("#stat-fertig").textContent = fertig.toLocaleString("de-AT");
  } catch { /* Statistiken sind nicht kritisch */ }
}

/* ---------- Rendering ---------- */
function scoreBadge(v) {
  if (v == null) return '<span class="badge neutral">–</span>';
  const cls = v >= 80 ? "score-high" : v >= 50 ? "score-mid" : "score-low";
  return `<span class="badge ${cls}">${v}</span>`;
}
function kycBadge(v) {
  if (v === "Non-KYC") return '<span class="badge kyc-non">Non-KYC</span>';
  if (v === "KYC") return '<span class="badge kyc-yes">KYC</span>';
  return '<span class="badge neutral">Unbekannt</span>';
}
function yesNoBadge(v) {
  if (v === "Ja") return '<span class="badge yes">Ja</span>';
  if (v === "Nein") return '<span class="badge neutral">Nein</span>';
  return '<span class="badge neutral">?</span>';
}
function statusBadge(v) {
  if (v === "Fertig") return '<span class="badge status-fertig">Fertig</span>';
  if (v === "In Arbeit") return '<span class="badge status-arbeit">In Arbeit</span>';
  return '<span class="badge neutral">Offen</span>';
}

function renderRows(rows) {
  const tbody = $("#tbody");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:30px">Keine Treffer.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr data-id="${r.id}">
        <td class="title-cell" title="${esc(r.title)}">${esc(r.title)}</td>
        <td>${r.website ? `<span class="website">${esc(r.website)}</span>` : '<span style="color:var(--text-dim)">–</span>'}</td>
        <td>${scoreBadge(r.bekanntheits_score)}</td>
        <td>${kycBadge(r.kyc)}</td>
        <td>${yesNoBadge(r.sportwetten)}</td>
        <td>${yesNoBadge(r.affiliate)}</td>
        <td>${statusBadge(r.recherche_status)}</td>
        <td>${r.views != null ? r.views.toLocaleString("de-AT") : "–"}</td>
        <td><a class="thread-link" href="${esc(r.thread_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Öffnen ↗</a></td>
      </tr>`
    )
    .join("");
  tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => openDrawer(rows.find((r) => r.id === tr.dataset.id)));
  });
}

function renderMeta() {
  const from = state.page * PAGE_SIZE + 1;
  const to = Math.min((state.page + 1) * PAGE_SIZE, state.total);
  $("#results-meta").textContent = state.total
    ? `${state.total.toLocaleString("de-AT")} Einträge · zeige ${from.toLocaleString("de-AT")}–${to.toLocaleString("de-AT")}`
    : "Keine Einträge gefunden.";
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  $("#page-info").textContent = `Seite ${state.page + 1} von ${pages.toLocaleString("de-AT")}`;
  $("#prev").disabled = state.page === 0;
  $("#next").disabled = state.page + 1 >= pages;
}

/* ---------- Detail-Drawer ---------- */
const SELECT_JNU = ["Ja", "Nein", "Unbekannt"];
const SECTIONS = [
  { title: "Allgemein", fields: [
    { col: "website", label: "Website", type: "text" },
    { col: "spieler_zahlen", label: "Spieler-Zahlen", type: "text" },
  ]},
  { title: "Verfügbarkeit", fields: [
    { col: "verfuegbar_at", label: "Verfügbar in Österreich", type: "select", options: SELECT_JNU },
    { col: "verfuegbar_de", label: "Verfügbar in Deutschland", type: "select", options: SELECT_JNU },
  ]},
  { title: "Kette", fields: [
    { col: "kette", label: "Teil einer Kette?", type: "select", options: SELECT_JNU },
    { col: "kette_firma", label: "Firma / Muttergesellschaft", type: "text" },
  ]},
  { title: "KYC & Zahlungen", fields: [
    { col: "kyc", label: "KYC-Status", type: "select", options: ["KYC", "Non-KYC", "Unbekannt"] },
    { col: "kyc_details", label: "Was für KYC?", type: "textarea", full: true },
    { col: "zahlungsmoeglichkeiten", label: "Einzahlungen (Crypto)", type: "text", full: true },
    { col: "allgemeines_angebot", label: "Allgemeines Angebot", type: "textarea", full: true },
  ]},
  { title: "Sportwetten", fields: [
    { col: "sportwetten", label: "Sportwetten?", type: "select", options: SELECT_JNU },
    { col: "sportwetten_bericht", label: "Bericht zum Sportwetten-Angebot", type: "textarea", full: true },
  ]},
  { title: "Registrierung & Auszahlung", fields: [
    { col: "registrierung_aufwand", label: "Aufwand Registrierung", type: "text", full: true },
    { col: "auszahlung_methoden", label: "Auszahlungsmöglichkeiten (Crypto)", type: "text", full: true },
    { col: "auszahlung_dauer", label: "Dauer der Auszahlung", type: "text" },
    { col: "kunden_bewertungen", label: "Kunden-Bewertungen", type: "textarea", full: true },
  ]},
  { title: "Affiliate-Programm", fields: [
    { col: "affiliate", label: "Affiliate-Angebot?", type: "select", options: SELECT_JNU },
    { col: "cpa", label: "CPA-Angebot?", type: "select", options: SELECT_JNU },
    { col: "cpa_hoehe", label: "Höhe CPA", type: "text" },
    { col: "revshare_prozent", label: "Revshare %", type: "text" },
    { col: "affiliate_auszahlung_dauer", label: "Auszahlungsdauer Provision", type: "text" },
    { col: "affiliate_bewertungen", label: "Bewertungen Affiliate-Programm", type: "textarea", full: true },
    { col: "affiliate_kontakt", label: "Kontaktdaten (Affiliate-Partnerschaft)", type: "textarea", full: true },
  ]},
  { title: "Recherche & Notizen", fields: [
    { col: "recherche_status", label: "Recherche-Status", type: "select", options: ["Offen", "In Arbeit", "Fertig"] },
    { col: "notizen", label: "Notizen", type: "textarea", full: true },
  ]},
];

function fieldHtml(f, value) {
  const v = value ?? "";
  const cls = f.full ? "d-field full" : "d-field";
  if (f.type === "select") {
    const opts = f.options
      .map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`)
      .join("");
    return `<div class="${cls}">${esc(f.label)}<select data-col="${f.col}">${opts}</select></div>`;
  }
  if (f.type === "textarea") {
    return `<div class="${cls}">${esc(f.label)}<textarea data-col="${f.col}">${esc(v)}</textarea></div>`;
  }
  return `<div class="${cls}">${esc(f.label)}<input type="text" data-col="${f.col}" value="${esc(v)}" /></div>`;
}

function openDrawer(record) {
  if (!record) return;
  currentRecord = record;
  $("#d-title").textContent = record.title;
  const info = `
    <div class="d-section">
      <h3>Thread-Info (aus Bitcointalk)</h3>
      <div class="d-grid">
        <div class="d-field">Bekanntheits-Score<div class="d-static">${record.bekanntheits_score ?? "–"} / 100</div></div>
        <div class="d-field">Aufrufe / Antworten<div class="d-static">${(record.views ?? 0).toLocaleString("de-AT")} / ${(record.replies ?? 0).toLocaleString("de-AT")}</div></div>
        <div class="d-field">Ersteller<div class="d-static">${esc(record.starter) || "–"}</div></div>
        <div class="d-field">Letzter Beitrag<div class="d-static">${esc(record.last_post) || "–"}</div></div>
        <div class="d-field full">Thread<div class="d-static"><a href="${esc(record.thread_url)}" target="_blank" rel="noopener">${esc(record.thread_url)}</a></div></div>
      </div>
    </div>`;
  const sections = SECTIONS.map(
    (s) => `<div class="d-section"><h3>${esc(s.title)}</h3><div class="d-grid">${s.fields.map((f) => fieldHtml(f, record[f.col])).join("")}</div></div>`
  ).join("");
  $("#drawer-body").innerHTML = info + sections;
  $("#drawer").hidden = false;
  $("#backdrop").hidden = false;
}

function closeDrawer() {
  $("#drawer").hidden = true;
  $("#backdrop").hidden = true;
  currentRecord = null;
}

async function saveRecord() {
  if (!currentRecord) return;
  const patch = {};
  $("#drawer-body").querySelectorAll("[data-col]").forEach((el) => {
    patch[el.dataset.col] = el.value.trim() === "" ? null : el.value.trim();
  });
  patch.updated_at = new Date().toISOString();
  try {
    const res = await fetch(`${API}?id=eq.${currentRecord.id}`, {
      method: "PATCH",
      headers: { ...HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    toast("✓ Gespeichert – Änderung ist live!");
    closeDrawer();
    loadPage();
    loadStats();
  } catch (e) {
    toast("Fehler beim Speichern: " + e.message, true);
  }
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

/* ---------- Events ---------- */
let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    state.page = 0;
    loadPage();
  }, 350);
});

document.querySelectorAll("#filters select[data-col]").forEach((sel) => {
  sel.addEventListener("change", () => {
    state.filters[sel.dataset.col] = sel.value;
    state.page = 0;
    loadPage();
  });
});

$("#sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  state.page = 0;
  loadPage();
});

$("#reset").addEventListener("click", () => {
  state.filters = {};
  state.search = "";
  state.page = 0;
  $("#search").value = "";
  document.querySelectorAll("#filters select[data-col]").forEach((s) => (s.value = ""));
  $("#sort").value = "bekanntheits_score.desc.nullslast";
  state.sort = "bekanntheits_score.desc.nullslast";
  loadPage();
});

$("#prev").addEventListener("click", () => { if (state.page > 0) { state.page--; loadPage(); window.scrollTo(0, 0); } });
$("#next").addEventListener("click", () => { state.page++; loadPage(); window.scrollTo(0, 0); });
$("#drawer-close").addEventListener("click", closeDrawer);
$("#backdrop").addEventListener("click", closeDrawer);
$("#save").addEventListener("click", saveRecord);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

/* ---------- Start ---------- */
loadStats();
loadPage();
