/* Day-Off 30-Day Calculator PWA
   - Today + 30 => day-off date if submitting today
   - Day-off - 30 => submit-by deadline
   - Day-off - 32 => early reminder (2 days earlier than the 30-day deadline)
   - Saves items in localStorage
*/

const $ = (id) => document.getElementById(id);

const els = {
  today: $("today"),
  todayPlus30: $("todayPlus30"),
  dayOffDate: $("dayOffDate"),
  submitBy: $("submitBy"),
  earlyReminder: $("earlyReminder"),
  label: $("label"),
  saveBtn: $("saveBtn"),
  savedList: $("savedList"),
  clearAllBtn: $("clearAllBtn"),
  status: $("status"),
};

const STORAGE_KEY = "dayoff_saved_v1";

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

function computeFromToday() {
  const base = parseInputDate(els.today.value);
  if (!base) {
    els.todayPlus30.textContent = "—";
    return;
  }
  const dayOff = addDays(base, 30);
  els.todayPlus30.textContent = `${fmtLong(dayOff)} (${toInputDateValue(dayOff)})`;
}

function computeFromDayOff() {
  const dayOff = parseInputDate(els.dayOffDate.value);
  if (!dayOff) {
    els.submitBy.textContent = "—";
    els.earlyReminder.textContent = "—";
    return;
  }

  const submitBy = addDays(dayOff, -30);
  const early = addDays(dayOff, -32);

  els.submitBy.textContent = `${fmtLong(submitBy)} (${toInputDateValue(submitBy)})`;
  els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)})`;
}

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

function renderSaved() {
  const items = loadSaved().sort((a, b) => (a.dayOff > b.dayOff ? 1 : -1));
  els.savedList.innerHTML = "";

  if (items.length === 0) {
    els.savedList.innerHTML = `<div class="item"><div class="itemMeta">No saved dates yet.</div></div>`;
    return;
  }

  for (const item of items) {
    const dayOff = parseInputDate(item.dayOff);
    const submitBy = addDays(dayOff, -30);
    const early = addDays(dayOff, -32);

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
          <button type="button" class="danger" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </div>
    `;
    els.savedList.appendChild(row);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addSavedItem(dayOffStr, label) {
  const items = loadSaved();
  const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

  // Prevent duplicate dayOff+label combos (simple)
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

function initDates() {
  const now = new Date();
  els.today.value = toInputDateValue(now);
  computeFromToday();
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js")
    .then(() => setStatus("Offline ready (service worker active)."))
    .catch(() => setStatus("Service worker failed (still works online)."));
}

function wireEvents() {
  els.today.addEventListener("change", computeFromToday);

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

  els.clearAllBtn.addEventListener("click", clearAll);

  els.savedList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === "delete") deleteSavedItem(id);
    if (action === "use") useSavedItem(id);
  });
}

// Boot
initDates();
computeFromDayOff();
wireEvents();
renderSaved();
registerSW();
