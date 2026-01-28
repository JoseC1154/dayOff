/* Modals + Day-Off Calculator + Settings + Saved + .ics export */

const $ = (id) => document.getElementById(id);

const els = {
  // Home buttons / gear
  btnSubmitToday: $("btnSubmitToday"),
  btnPickDayOff: $("btnPickDayOff"),
  openSettings: $("openSettings"),
  status: $("status"),
  ruleText: $("ruleText"),

  // Backdrop + modals
  backdrop: $("backdrop"),
  modalSubmitToday: $("modalSubmitToday"),
  modalPickDayOff: $("modalPickDayOff"),
  modalSettings: $("modalSettings"),

  // Modal: Submit Today
  today: $("today"),
  todayPlusAdvance: $("todayPlusAdvance"),
  exportDayOffFromTodayBtn: $("exportDayOffFromTodayBtn"),
  submitRuleText: $("submitRuleText"),

  // Modal: Pick Day Off
  dayOffDate: $("dayOffDate"),
  submitBy: $("submitBy"),
  earlyReminder: $("earlyReminder"),
  label: $("label"),
  saveBtn: $("saveBtn"),
  exportDayOffBtn: $("exportDayOffBtn"),
  exportSubmitByBtn: $("exportSubmitByBtn"),
  exportEarlyBtn: $("exportEarlyBtn"),
  pickRuleText: $("pickRuleText"),

  // Settings modal
  advanceDays: $("advanceDays"),
  earlyExtraDays: $("earlyExtraDays"),
  earlyOffsetText: $("earlyOffsetText"),
  saveSettingsBtn: $("saveSettingsBtn"),
  resetSettingsBtn: $("resetSettingsBtn"),

  // Saved list
  savedList: $("savedList"),
  clearAllBtn: $("clearAllBtn"),
};

const STORAGE_KEY = "dayoff_saved_v1";
const SETTINGS_KEY = "dayoff_settings_v1";

const DEFAULT_SETTINGS = { advanceDays: 30, earlyExtraDays: 2 };

/* ---------- utils ---------- */
function setStatus(msg) { els.status.textContent = msg; }
function pad2(n){ return String(n).padStart(2,"0"); }

function toInputDateValue(date){
  const y=date.getFullYear();
  const m=pad2(date.getMonth()+1);
  const d=pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

// local date parse (avoids UTC shift)
function parseInputDate(value){
  if(!value) return null;
  const [y,m,d]=value.split("-").map(Number);
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}

function addDays(date, days){
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function fmtLong(date){
  return date.toLocaleDateString(undefined,{
    weekday:"short", year:"numeric", month:"short", day:"numeric"
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* ---------- settings ---------- */
function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    let advanceDays = Number.isFinite(parsed?.advanceDays) ? parsed.advanceDays : DEFAULT_SETTINGS.advanceDays;
    let earlyExtraDays = Number.isFinite(parsed?.earlyExtraDays) ? parsed.earlyExtraDays : DEFAULT_SETTINGS.earlyExtraDays;

    advanceDays = Math.max(0, Math.floor(advanceDays));
    earlyExtraDays = Math.max(0, Math.floor(earlyExtraDays));
    return { advanceDays, earlyExtraDays };
  }catch{
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function applySettingsToUI(){
  const s = loadSettings();
  els.advanceDays.value = String(s.advanceDays);
  els.earlyExtraDays.value = String(s.earlyExtraDays);

  const earlyOffset = s.advanceDays + s.earlyExtraDays;
  els.earlyOffsetText.textContent = `${earlyOffset} days before day-off`;

  const rule = `${s.advanceDays} days in advance + ${s.earlyExtraDays}-day early reminder`;
  els.ruleText.textContent = rule;
  els.submitRuleText.textContent = rule;
  els.pickRuleText.textContent = rule;
}

/* ---------- computations ---------- */
function computeFromToday(){
  const s = loadSettings();
  const base = parseInputDate(els.today.value);
  if(!base){ els.todayPlusAdvance.textContent="—"; return; }
  const dayOff = addDays(base, s.advanceDays);
  els.todayPlusAdvance.textContent = `${fmtLong(dayOff)} (${toInputDateValue(dayOff)})`;
}

function computeFromDayOff(){
  const s = loadSettings();
  const dayOff = parseInputDate(els.dayOffDate.value);
  if(!dayOff){
    els.submitBy.textContent="—";
    els.earlyReminder.textContent="—";
    return;
  }
  const submitBy = addDays(dayOff, -s.advanceDays);
  const early = addDays(dayOff, -(s.advanceDays + s.earlyExtraDays));
  els.submitBy.textContent = `${fmtLong(submitBy)} (${toInputDateValue(submitBy)})`;
  els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)})`;
}

/* ---------- modal system ---------- */
let openModalEl = null;

function showModal(modalEl){
  openModalEl = modalEl;
  els.backdrop.hidden = false;
  modalEl.hidden = false;

  // Focus first input if present
  const firstInput = modalEl.querySelector("input, button");
  if(firstInput) firstInput.focus();

  setStatus("Opened.");
}

function closeModal(){
  if(!openModalEl) return;
  openModalEl.hidden = true;
  openModalEl = null;
  els.backdrop.hidden = true;
  setStatus("Closed.");
}

function wireModalClose(){
  // Close on backdrop click
  els.backdrop.addEventListener("click", closeModal);

  // Close buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if(btn) closeModal();
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && openModalEl) closeModal();
  });
}

/* ---------- calendar export (.ics) ---------- */
function yyyymmdd(date){
  return `${date.getFullYear()}${pad2(date.getMonth()+1)}${pad2(date.getDate())}`;
}

function makeIcsAllDayEvent({ title, description, date }){
  const start = yyyymmdd(date);
  const end = yyyymmdd(addDays(date, 1));
  const dtstamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const uid = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "@dayoffpwa";

  const esc = (s) => String(s || "")
    .replaceAll("\\","\\\\")
    .replaceAll("\n","\\n")
    .replaceAll(",","\\,")
    .replaceAll(";","\\;");

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

function downloadIcs(filename, text){
  const blob = new Blob([text], { type:"text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportEventForDate({ kind, label, dayOffDateStr }){
  const s = loadSettings();
  const dayOff = parseInputDate(dayOffDateStr);
  if(!dayOff){ setStatus("Pick a valid day-off date."); return; }

  let eventDate = dayOff;
  let title = label?.trim() ? `${label.trim()} — Day off` : "Day off";

  if(kind === "submitBy"){
    eventDate = addDays(dayOff, -s.advanceDays);
    title = label?.trim() ? `${label.trim()} — Submit day-off request` : "Submit day-off request";
  }else if(kind === "early"){
    const offset = s.advanceDays + s.earlyExtraDays;
    eventDate = addDays(dayOff, -offset);
    title = label?.trim() ? `${label.trim()} — Early reminder to submit` : "Early reminder to submit";
  }

  const descLines = [
    `Day-off date: ${toInputDateValue(dayOff)}`,
    `Policy: submit ${s.advanceDays} days in advance`,
    `Extra early days: ${s.earlyExtraDays}`,
  ];
  if(kind === "submitBy") descLines.unshift(`Submit-by deadline: ${toInputDateValue(eventDate)}`);
  if(kind === "early") descLines.unshift(`Early reminder date: ${toInputDateValue(eventDate)}`);

  const ics = makeIcsAllDayEvent({ title, description: descLines.join("\n"), date: eventDate });

  const safeKind = kind === "dayOff" ? "dayoff" : kind;
  const safeLabel = (label?.trim() ? label.trim().slice(0,24).replace(/[^\w\-]+/g,"_") + "_" : "");
  const filename = `${safeLabel}${safeKind}_${toInputDateValue(eventDate)}.ics`;

  downloadIcs(filename, ics);
  setStatus("Calendar export downloaded.");
}

/* ---------- saved items ---------- */
function loadSaved(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch{
    return [];
  }
}

function saveSaved(items){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function addSavedItem(dayOffStr, label){
  const items = loadSaved();
  const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

  const exists = items.some(x => x.dayOff === dayOffStr && (x.label||"") === (label||""));
  if(exists){ setStatus("That saved item already exists."); return; }

  items.push({ id, dayOff: dayOffStr, label: label || "" });
  saveSaved(items);
  renderSaved();
  setStatus("Saved.");
}

function deleteSavedItem(id){
  const items = loadSaved().filter(x => x.id !== id);
  saveSaved(items);
  renderSaved();
  setStatus("Deleted.");
}

function useSavedItem(id){
  const item = loadSaved().find(x => x.id === id);
  if(!item) return;

  els.dayOffDate.value = item.dayOff;
  els.label.value = item.label || "";
  computeFromDayOff();

  showModal(els.modalPickDayOff);
  setStatus("Loaded saved date.");
}

function clearAllSaved(){
  localStorage.removeItem(STORAGE_KEY);
  renderSaved();
  setStatus("Cleared all saved dates.");
}

function renderSaved(){
  const s = loadSettings();
  const items = loadSaved().sort((a,b)=> a.dayOff > b.dayOff ? 1 : -1);

  els.savedList.innerHTML = "";

  if(items.length === 0){
    els.savedList.innerHTML = `<div class="item"><div class="itemMeta">No saved dates yet.</div></div>`;
    return;
  }

  for(const item of items){
    const dayOff = parseInputDate(item.dayOff);
    const submitBy = addDays(dayOff, -s.advanceDays);
    const early = addDays(dayOff, -(s.advanceDays + s.earlyExtraDays));
    const title = item.label?.trim() ? item.label.trim() : "Day off";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTitle">${escapeHtml(title)} — ${fmtLong(dayOff)} (${item.dayOff})</div>
      <div class="itemMeta">Submit by: ${fmtLong(submitBy)} (${toInputDateValue(submitBy)})</div>
      <div class="itemMeta">Early: ${fmtLong(early)} (${toInputDateValue(early)})</div>
      <div class="itemBtns">
        <button type="button" data-action="use" data-id="${item.id}">Open</button>
        <button type="button" data-action="ics-dayoff" data-id="${item.id}">Day-off .ics</button>
        <button type="button" data-action="ics-submit" data-id="${item.id}">Submit-by .ics</button>
        <button type="button" data-action="ics-early" data-id="${item.id}">Early .ics</button>
        <button type="button" class="danger" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    `;
    els.savedList.appendChild(div);
  }
}

/* ---------- service worker ---------- */
function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js")
    .then(()=> setStatus("Offline ready."))
    .catch(()=> setStatus("Service worker failed (still works online)."));
}

/* ---------- wiring ---------- */
function init(){
  applySettingsToUI();

  // default today
  els.today.value = toInputDateValue(new Date());
  computeFromToday();
  computeFromDayOff();
  renderSaved();
  registerSW();

  // open modals
  els.btnSubmitToday.addEventListener("click", () => {
    computeFromToday();
    showModal(els.modalSubmitToday);
  });

  els.btnPickDayOff.addEventListener("click", () => {
    computeFromDayOff();
    showModal(els.modalPickDayOff);
  });

  els.openSettings.addEventListener("click", () => {
    applySettingsToUI();
    showModal(els.modalSettings);
  });

  // modal close behavior
  wireModalClose();

  // live compute
  els.today.addEventListener("change", () => { computeFromToday(); setStatus("Updated."); });
  els.dayOffDate.addEventListener("change", () => { computeFromDayOff(); setStatus("Updated."); });

  // settings actions
  els.saveSettingsBtn.addEventListener("click", () => {
    const advanceDays = Math.max(0, Math.floor(Number(els.advanceDays.value || 0)));
    const earlyExtraDays = Math.max(0, Math.floor(Number(els.earlyExtraDays.value || 0)));
    saveSettings({ advanceDays, earlyExtraDays });

    applySettingsToUI();
    computeFromToday();
    computeFromDayOff();
    renderSaved();
    setStatus("Settings saved.");
  });

  els.resetSettingsBtn.addEventListener("click", () => {
    saveSettings({ ...DEFAULT_SETTINGS });
    applySettingsToUI();
    computeFromToday();
    computeFromDayOff();
    renderSaved();
    setStatus("Settings reset.");
  });

  // exports
  els.exportDayOffFromTodayBtn.addEventListener("click", () => {
    const s = loadSettings();
    const base = parseInputDate(els.today.value);
    if(!base) return setStatus("Pick a valid 'today' date.");
    const dayOff = addDays(base, s.advanceDays);
    exportEventForDate({ kind:"dayOff", label:"Day off (from today)", dayOffDateStr: toInputDateValue(dayOff) });
  });

  els.exportDayOffBtn.addEventListener("click", () => {
    exportEventForDate({ kind:"dayOff", label: els.label.value, dayOffDateStr: els.dayOffDate.value });
  });
  els.exportSubmitByBtn.addEventListener("click", () => {
    exportEventForDate({ kind:"submitBy", label: els.label.value, dayOffDateStr: els.dayOffDate.value });
  });
  els.exportEarlyBtn.addEventListener("click", () => {
    exportEventForDate({ kind:"early", label: els.label.value, dayOffDateStr: els.dayOffDate.value });
  });

  // save day off
  els.saveBtn.addEventListener("click", () => {
    const dayOffStr = els.dayOffDate.value;
    if(!dayOffStr) return setStatus("Pick a day-off date first.");
    addSavedItem(dayOffStr, els.label.value);
  });

  // saved list actions
  els.savedList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if(action === "use") return useSavedItem(id);
    if(action === "delete") return deleteSavedItem(id);

    const item = loadSaved().find(x => x.id === id);
    if(!item) return;

    if(action === "ics-dayoff") return exportEventForDate({ kind:"dayOff", label:item.label, dayOffDateStr:item.dayOff });
    if(action === "ics-submit") return exportEventForDate({ kind:"submitBy", label:item.label, dayOffDateStr:item.dayOff });
    if(action === "ics-early") return exportEventForDate({ kind:"early", label:item.label, dayOffDateStr:item.dayOff });
  });

  els.clearAllBtn.addEventListener("click", clearAllSaved);
}

init();
