/* Day-Off Request Calculator PWA
   - Settings:
      advanceDays (default 30)
      earlyExtraDays (default 2)
     Early reminder offset = advanceDays + earlyExtraDays
   - Calendar export (.ics):
      Day-off, Submit-by, Early reminder
   - Saves items in localStorage
*/

const $ = (id) => document.getElementById(id);

const els = {
  // Settings
  advanceDays: $("advanceDays"),
  earlyExtraDays: $("earlyExtraDays"),
  earlyOffsetText: $("earlyOffsetText"),
  saveSettingsBtn: $("saveSettingsBtn"),
  resetSettingsBtn: $("resetSettingsBtn"),
  ruleText: $("ruleText"),

  // Today -> Day off
  today: $("today"),
  todayPlusAdvance: $("todayPlusAdvance"),
  exportDayOffFromTodayBtn: $("exportDayOffFromTodayBtn"),

  // Day off -> Deadlines
  dayOffDate: $("dayOffDate"),
  submitBy: $("submitBy"),
  earlyReminder: $("earlyReminder"),
  label: $("label"),
  saveBtn: $("saveBtn"),
  exportDayOffBtn: $("exportDayOffBtn"),
  exportSubmitByBtn: $("exportSubmitByBtn"),
  exportEarlyBtn: $("exportEarlyBtn"),

  // Saved list
  savedList: $("savedList"),
  clearAllBtn: $("clearAllBtn"),

  status: $("status"),
};

const STORAGE_KEY = "dayoff_saved_v1";
const SETTINGS_KEY = "dayoff_settings_v1";

const DEFAULT_SETTINGS = {
  advanceDays: 30,
  earlyExtraDays: 2
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toInputDateValue(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

// Parses "YYYY-MM-DD" safely as local date (not UTC).
function parseInputDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function fmtLong(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   Settings
----------------------------*/
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const s = {
      advanceDays: Number.isFinite(parsed?.advanceDays) ? parsed.advanceDays : DEFAULT_SETTINGS.advanceDays,
      earlyExtraDays: Number.isFinite(parsed?.earlyExtraDays) ? parsed.earlyExtraDays : DEFAULT_SETTINGS.earlyExtraDays,
    };
    // sanitize
    s.advanceDays = Math.max(0, Math.floor(s.advanceDays));
    s.earlyExtraDays = Math.max(0, Math.floor(s.earlyExtraDays));
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getSettingsFromUI() {
  const advanceDays = Math.max(0, Math.floor(Number(els.advanceDays.value || 0)));
  const earlyExtraDays = Math.max(0, Math.floor(Number(els.earlyExtraDays.value || 0)));
  return { advanceDays, earlyExtraDays };
}

function applySettingsToUI(settings) {
  els.advanceDays.value = String(settings.advanceDays);
  els.earlyExtraDays.value = String(settings.earlyExtraDays);

  const earlyOffset = settings.advanceDays + settings.earlyExtraDays;
  els.earlyOffsetText.textContent = `${earlyOffset} days before day-off`;
  els.ruleText.textContent = `${settings.advanceDays} days in advance + ${settings.earlyExtraDays}-day early reminder`;
}

/* ---------------------------
   Core computations
----------------------------*/
function computeFromToday() {
  const settings = loadSettings();
  const base = parseInputDate(els.today.value);
  if (!base) {
    els.todayPlusAdvance.textContent = "—";
    return;
  }
  const dayOff = addDays(base, settings.advanceDays);
  els.todayPlusAdvance.textContent = `${fmtLong(dayOff)} (${toInputDateValue(dayOff)})`;
}

function computeFromDayOff() {
  const settings = loadSettings();
  const dayOff = parseInputDate(els.dayOffDate.value);
  if (!dayOff) {
    els.submitBy.textContent = "—";
    els.earlyReminder.textContent = "—";
    return;
  }

  const submitBy = addDays(dayOff, -settings.advanceDays);
  const early = addDays(dayOff, -(settings.advanceDays + settings.earlyExtraDays));

  els.submitBy.textContent = `${fmtLong(submitBy)} (${toInputDateValue(submitBy)})`;
  els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)})`;
}

/* ---------------------------
   Calendar export (.ics)
   All-day events:
   DTSTART;VALUE=DATE:YYYYMMDD
   DTEND;VALUE=DATE:YYYYMMDD(next day)
----------------------------*/
function yyyymmdd(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}${m}${d}`;
}

function makeIcsAllDayEvent({ title, description, date }) {
  const start = yyyymmdd(date);
  const end = yyyymmdd(addDays(date, 1));
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const uid = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "@dayoffpwa";

  const esc = (s) =>
    String(s || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DayOffPWA//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportEventForDate({ kind, label, dayOffDate }) {
  const settings = loadSettings();
  const dayOff = parseInputDate(dayOffDate);
  if (!dayOff) {
    setStatus("Pick a day-off date first.");
    return;
  }

  let eventDate = dayOff;
  let title = "Day off";
  let description = `Day-off date: ${toInputDateValue(dayOff)}\n`;

  if (label?.trim()) {
    title = `${label.trim()} — Day off`;
  }

  if (kind === "submitBy") {
    eventDate = addDays(dayOff, -settings.advanceDays);
    title = label?.trim()
      ? `${label.trim()} — Submit day-off request`
      : "Submit day-off request";
    description += `Submit-by deadline (day off - ${settings.advanceDays}): ${toInputDateValue(eventDate)}\n`;
  } else if (kind === "early") {
    const offset = settings.advanceDays + settings.earlyExtraDays;
    eventDate = addDays(dayOff, -offset);
    title = label?.trim()
      ? `${label.trim()} — Early reminder to submit`
      : "Early reminder to submit";
    description += `Early reminder (day off - ${offset}): ${toInputDateValue(eventDate)}\n`;
  }

  // Add policy context to all
  description += `Policy: ${settings.advanceDays} days in advance\n`;
  description += `Extra early days: ${settings.earlyExtraDays}\n`;

  const ics = makeIcsAllDayEvent({ title, description, date: eventDate });
  const safeKind = kind === "dayOff" ? "dayoff" : kind;
  const fnameLabel = (label?.trim() ? label.trim().slice(0, 24).replace(/[^\w\-]+/g, "_") + "_" : "");
  const filename = `${fnameLabel}${safeKind}_${toInputDateValue(eventDate)}.ics`;

  downloadTextFile(filename, ics);
  setStatus("Calendar file exported.");
}

/* ---------------------------
   Saved items
----------------------------*/
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function addSavedItem(dayOffStr, label) {
  const items = loadSaved();
  const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

  const exists = items.some((x) => x.dayOff === dayOffStr && (x.label || "") === (label || ""));
  if (exists) {
    setStatus("That saved item already exists.");
    return;
  }

  items.push({ id, dayOff: dayOffStr, label: label || "" });
  saveSaved(items);
  renderSaved();
  setStatus("Saved.");
}

function deleteSavedItem(id) {
  const items = loadSaved().filter((x) => x.id !== id);
  saveSaved(items);
  renderSaved();
  setStatus("Deleted.");
}

function useSavedItem(id) {
  const items = loadSaved();
  const item = items.find((x) => x.id === id);
  if (!item) return;

  els.dayOffDate.value = item.dayOff;
  els.label.value = item.label || "";
  computeFromDayOff();
  setStatus("Loaded saved date.");
}

function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
  renderSaved();
  setStatus("Cleared all saved dates.");
}

function renderSaved() {
  const settings = loadSettings();
  const items = loadSaved().sort((a, b) => (a.dayOff > b.dayOff ? 1 : -1));
  els.savedList.innerHTML = "";

  if (items.length === 0) {
    els.savedList.innerHTML = `<div class="item"><div class="itemMeta">No saved dates yet.</div></div>`;
    return;
  }

  for (const item of items) {
    const dayOff = parseInputDate(item.dayOff);
    const submitBy = addDays(dayOff, -settings.advanceDays);
    const early = addDays(dayOff, -(settings.advanceDays + settings.earlyExtraDays));

    const title = item.label?.trim() ? item.label.trim() : "Day off";

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(title)} — ${fmtLong(dayOff)} (${item.dayOff})</div>
          <div class="itemMeta">Submit by: ${fmtLong(submitBy)} (${toInputDateValue(submitBy)})</div>
          <div class="itemMeta">Early reminder: ${fmtLong(early)} (${toInputDateValue(early)})</div>
        </div>
        <div class="itemBtns">
          <button type="button" data-action="use" data-id="${item.id}">Use</button>
          <button type="button" data-action="ics-dayoff" data-id="${item.id}">Day-off .ics</button>
          <button type="button" data-action="ics-submit" data-id="${item.id}">Submit-by .ics</button>
          <button type="button" data-action="ics-early" data-id="${item.id}">Early .ics</button>
          <button type="button" class="danger" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </div>
    `;
    els.savedList.appendChild(row);
  }
}

/* ---------------------------
   Service worker
----------------------------*/
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js")
    .then(() => setStatus("Offline ready (service worker active)."))
    .catch(() => setStatus("Service worker failed (still works online)."));
}

/* ---------------------------
   Init + wiring
----------------------------*/
function initDates() {
  const now = new Date();
  els.today.value = toInputDateValue(now);
  computeFromToday();
}

function initSettingsUI() {
  const s = loadSettings();
  applySettingsToUI(s);
}

function wireEvents() {
  // Settings
  els.saveSettingsBtn.addEventListener("click", () => {
    const s = getSettingsFromUI();
    saveSettings(s);
    applySettingsToUI(s);
    computeFromToday();
    computeFromDayOff();
    renderSaved();
    setStatus("Settings saved.");
  });

  els.resetSettingsBtn.addEventListener("click", () => {
    saveSettings({ ...DEFAULT_SETTINGS });
    initSettingsUI();
    computeFromToday();
    computeFromDayOff();
    renderSaved();
    setStatus("Settings reset to defaults.");
  });

  // Today -> day off
  els.today.addEventListener("change", () => {
    computeFromToday();
    setStatus("Updated.");
  });

  els.exportDayOffFromTodayBtn.addEventListener("click", () => {
    const settings = loadSettings();
    const base = parseInputDate(els.today.value);
    if (!base) return setStatus("Pick a valid 'Today' date.");
    const dayOff = addDays(base, settings.advanceDays);
    exportEventForDate({ kind: "dayOff", label: "Day off (from today)", dayOffDate: toInputDateValue(dayOff) });
  });

  // Day off -> deadlines
  els.dayOffDate.addEventListener("change", () => {
    computeFromDayOff();
    setStatus("Updated.");
  });

  els.saveBtn.addEventListener("click", () => {
    const dayOffStr = els.dayOffDate.value;
    if (!dayOffStr) {
      setStatus("Pick a day-off date first.");
      return;
    }
    addSavedItem(dayOffStr, els.label.value);
  });

  els.exportDayOffBtn.addEventListener("click", () => {
    exportEventForDate({ kind: "dayOff", label: els.label.value, dayOffDate: els.dayOffDate.value });
  });

  els.exportSubmitByBtn.addEventListener("click", () => {
    exportEventForDate({ kind: "submitBy", label: els.label.value, dayOffDate: els.dayOffDate.value });
  });

  els.exportEarlyBtn.addEventListener("click", () => {
    exportEventForDate({ kind: "early", label: els.label.value, dayOffDate: els.dayOffDate.value });
  });

  // Saved list actions
  els.savedList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "delete") return deleteSavedItem(id);
    if (action === "use") return useSavedItem(id);

    const item = loadSaved().find((x) => x.id === id);
    if (!item) return;

    if (action === "ics-dayoff") return exportEventForDate({ kind: "dayOff", label: item.label, dayOffDate: item.dayOff });
    if (action === "ics-submit") return exportEventForDate({ kind: "submitBy", label: item.label, dayOffDate: item.dayOff });
    if (action === "ics-early") return exportEventForDate({ kind: "early", label: item.label, dayOffDate: item.dayOff });
  });

  els.clearAllBtn.addEventListener("click", clearAll);
}

// Boot
initSettingsUI();
initDates();
computeFromDayOff();
wireEvents();
renderSaved();
registerSW();
