/* Modals + Day-Off Calculator + Settings + Saved + .ics export */

const $ = (id) => document.getElementById(id);

let els = {};

const STORAGE_KEY = "dayoff_saved_v1";
const SETTINGS_KEY = "dayoff_settings_v1";

const DEFAULT_SETTINGS = { 
  advanceDays: 30, 
  earlyExtraDays: 2,
  submitByTime: "09:00",
  earlyTime: "09:00"
};

/* ---------- utils ---------- */
function setStatus(msg) { els.status.textContent = msg; }
function pad2(n){ return String(n).padStart(2,"0"); }

function showToast(message, duration = 3000){
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

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
    let submitByTime = parsed?.submitByTime || DEFAULT_SETTINGS.submitByTime;
    let earlyTime = parsed?.earlyTime || DEFAULT_SETTINGS.earlyTime;

    advanceDays = Math.max(0, Math.floor(advanceDays));
    earlyExtraDays = Math.max(0, Math.floor(earlyExtraDays));
    return { advanceDays, earlyExtraDays, submitByTime, earlyTime };
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
  els.submitByTime.value = s.submitByTime;
  els.earlyTime.value = s.earlyTime;

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

  if(!base){
    els.todayPlusAdvanceHero.textContent = "—";
    els.todayPlusAdvanceSub.textContent = `Based on today + ${s.advanceDays} days`;
    return;
  }

  const dayOff = addDays(base, s.advanceDays);
  const daysUntil = Math.ceil((dayOff - base) / (1000 * 60 * 60 * 24));
  els.todayPlusAdvanceHero.textContent = fmtLong(dayOff);
  els.todayPlusAdvanceSub.textContent = `${toInputDateValue(dayOff)} (${daysUntil} days from today)`;
  
  // Check if this date has been saved and submitted
  const dayOffStr = toInputDateValue(dayOff);
  const saved = loadSaved();
  const item = saved.find(x => x.dayOff === dayOffStr);
  if(item && item.submitted){
    els.exportDayOffFromTodayBtn.hidden = false;
  } else {
    els.exportDayOffFromTodayBtn.hidden = true;
  }
}


function computeFromDayOff(){
  const s = loadSettings();
  const dayOff = parseInputDate(els.dayOffDate.value);

  // Update helper text always
  els.submitBySub.textContent = `Day off − ${s.advanceDays} days`;

  if(!dayOff){
    els.submitByHero.textContent = "—";
    els.earlyReminder.textContent = "—";
    return;
  }

  // Validation: Check if date meets minimum notice requirement
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check if date is in the past
  if(dayOff < today){
    showToast("⚠️ This date has already passed", 4000);
    els.submitByHero.textContent = "⚠️ Date passed";
    els.submitBySub.textContent = "Please select a future date";
    els.earlyReminder.textContent = "—";
    return;
  }
  
  const minDaysAhead = 14; // Minimum 14 days advance notice
  const minDate = addDays(today, minDaysAhead);
  
  if(dayOff < minDate){
    showToast(`⚠️ Missed day-off request window (minimum ${minDaysAhead} days notice)`, 4000);
    els.submitByHero.textContent = "⚠️ Missed window";
    els.submitBySub.textContent = `Select a date on or after ${toInputDateValue(minDate)}`;
    els.earlyReminder.textContent = "—";
    return;
  }

  const submitBy = addDays(dayOff, -s.advanceDays);
  const earlyOffset = s.advanceDays + s.earlyExtraDays;
  const early = addDays(dayOff, -earlyOffset);

  // Check if early reminder date has passed (but still within submit-by window)
  const earlyDatePassed = early < today;

  // HERO: Submit-by
  const daysUntilSubmit = Math.ceil((submitBy - today) / (1000 * 60 * 60 * 24));
  const daysUntilDayOff = Math.ceil((dayOff - today) / (1000 * 60 * 60 * 24));
  const daysUntilEarly = Math.ceil((early - today) / (1000 * 60 * 60 * 24));
  els.submitByHero.textContent = fmtLong(submitBy);
  els.submitBySub.textContent = `${toInputDateValue(submitBy)} (${daysUntilSubmit} days) • Day off in ${daysUntilDayOff} days`;

  // Update reminders button text with days info
  if(daysUntilEarly > 0){
    els.exportRemindersBtn.textContent = `Submission reminders (${daysUntilEarly} & ${daysUntilSubmit} days) .ics`;
  } else if(daysUntilSubmit > 0){
    els.exportRemindersBtn.textContent = `Submission reminders (${daysUntilSubmit} days) .ics`;
  } else {
    els.exportRemindersBtn.textContent = `Submission reminders .ics`;
  }

  // Secondary: Early reminder
  if(earlyDatePassed){
    // Show how many days early they still have (days until the deadline)
    const daysEarlyRemaining = daysUntilSubmit;
    if(daysEarlyRemaining > 1){
      els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)}) • ${daysEarlyRemaining} days early`;
    } else if(daysEarlyRemaining === 1){
      els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)}) • 1 day early`;
    } else {
      els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)}) • Deadline today`;
    }
  } else {
    els.earlyReminder.textContent = `${fmtLong(early)} (${toInputDateValue(early)})`;
  }
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

function makeIcsMultiEvent(events){
  const dtstamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  
  const esc = (s) => String(s || "")
    .replaceAll("\\","\\\\")
    .replaceAll("\n","\\n")
    .replaceAll(",","\\,")
    .replaceAll(";","\\;");

  let icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DayOffPWA//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for(const event of events){
    const uid = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "@dayoffpwa";
    
    let dtstart, dtend;
    if(event.time){
      // Timed event
      const [hours, minutes] = event.time.split(':').map(Number);
      const startDateTime = new Date(event.date);
      startDateTime.setHours(hours, minutes, 0, 0);
      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(hours + 1, minutes, 0, 0);
      
      dtstart = `DTSTART:${yyyymmdd(startDateTime)}T${pad2(hours)}${pad2(minutes)}00`;
      dtend = `DTEND:${yyyymmdd(endDateTime)}T${pad2(hours + 1)}${pad2(minutes)}00`;
    } else {
      // All-day event
      const start = yyyymmdd(event.date);
      const end = yyyymmdd(addDays(event.date, 1));
      dtstart = `DTSTART;VALUE=DATE:${start}`;
      dtend = `DTEND;VALUE=DATE:${end}`;
    }

    icsContent.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:${esc(event.title)}`,
      `DESCRIPTION:${esc(event.description)}`,
      dtstart,
      dtend,
      "END:VEVENT"
    );
  }

  icsContent.push("END:VCALENDAR");
  return icsContent.join("\r\n");
}

function makeIcsAllDayEvent({ title, description, date, time }){
  const dtstamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const uid = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "@dayoffpwa";

  const esc = (s) => String(s || "")
    .replaceAll("\\","\\\\")
    .replaceAll("\n","\\n")
    .replaceAll(",","\\,")
    .replaceAll(";","\\;");

  let dtstart, dtend;
  if(time){
    // Timed event
    const [hours, minutes] = time.split(':').map(Number);
    const startDateTime = new Date(date);
    startDateTime.setHours(hours, minutes, 0, 0);
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(hours + 1, minutes, 0, 0); // 1 hour duration
    
    dtstart = `DTSTART:${yyyymmdd(startDateTime)}T${pad2(hours)}${pad2(minutes)}00`;
    dtend = `DTEND:${yyyymmdd(endDateTime)}T${pad2(hours + 1)}${pad2(minutes)}00`;
  } else {
    // All-day event
    const start = yyyymmdd(date);
    const end = yyyymmdd(addDays(date, 1));
    dtstart = `DTSTART;VALUE=DATE:${start}`;
    dtend = `DTEND;VALUE=DATE:${end}`;
  }

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
    dtstart,
    dtend,
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
  let time = null; // null = all-day event

  if(kind === "submitBy"){
    eventDate = addDays(dayOff, -s.advanceDays);
    title = label?.trim() ? `${label.trim()} — Get form stamped (deadline)` : "Get form stamped (deadline)";
    time = s.submitByTime;
  }else if(kind === "early"){
    const offset = s.advanceDays + s.earlyExtraDays;
    eventDate = addDays(dayOff, -offset);
    title = label?.trim() ? `${label.trim()} — Early reminder to get stamped` : "Early reminder to get stamped";
    time = s.earlyTime;
  }

  const descLines = [
    `Day-off date: ${toInputDateValue(dayOff)}`,
    `Policy: submit ${s.advanceDays} days in advance`,
    `Extra early days: ${s.earlyExtraDays}`,
  ];
  if(kind === "submitBy") descLines.unshift(`Get form stamped by: ${toInputDateValue(eventDate)}`);
  if(kind === "early") descLines.unshift(`Early reminder: ${toInputDateValue(eventDate)}`);

  const ics = makeIcsAllDayEvent({ title, description: descLines.join("\n"), date: eventDate, time });

  const safeKind = kind === "dayOff" ? "dayoff" : kind;
  const safeLabel = (label?.trim() ? label.trim().slice(0,24).replace(/[^\w\-]+/g,"_") + "_" : "");
  const filename = `${safeLabel}${safeKind}_${toInputDateValue(eventDate)}.ics`;

  downloadIcs(filename, ics);
  setStatus("Calendar export downloaded.");
}

function exportRemindersForDate({ label, dayOffDateStr }){
  const s = loadSettings();
  const dayOff = parseInputDate(dayOffDateStr);
  if(!dayOff){ setStatus("Pick a valid day-off date."); return; }

  const submitBy = addDays(dayOff, -s.advanceDays);
  const earlyOffset = s.advanceDays + s.earlyExtraDays;
  const early = addDays(dayOff, -earlyOffset);

  const events = [];

  // Event 1: Early reminder to submit paperwork
  events.push({
    title: label?.trim() ? `${label.trim()} — Submit paperwork (early)` : "Submit paperwork (early)",
    description: [
      `Early reminder: ${toInputDateValue(early)}`,
      `Submit paperwork ${s.earlyExtraDays} days before deadline`,
      `Day-off date: ${toInputDateValue(dayOff)}`,
      `Deadline: ${toInputDateValue(submitBy)}`,
    ].join("\n"),
    date: early,
    time: s.earlyTime
  });

  // Event 2: Deadline to get form stamped
  events.push({
    title: label?.trim() ? `${label.trim()} — Get form stamped (deadline)` : "Get form stamped (deadline)",
    description: [
      `Deadline: ${toInputDateValue(submitBy)}`,
      `Get submitted form stamped by this date`,
      `Day-off date: ${toInputDateValue(dayOff)}`,
      `Policy: ${s.advanceDays} days in advance`,
    ].join("\n"),
    date: submitBy,
    time: s.submitByTime
  });

  const ics = makeIcsMultiEvent(events);

  const safeLabel = (label?.trim() ? label.trim().slice(0,24).replace(/[^\w\-]+/g,"_") + "_" : "");
  const filename = `${safeLabel}reminders_${toInputDateValue(dayOff)}.ics`;

  downloadIcs(filename, ics);
  setStatus("Reminders calendar export downloaded.");
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
  if(exists){ setStatus("That saved item already exists."); return false; }

  items.push({ id, dayOff: dayOffStr, label: label || "" });
  saveSaved(items);
  renderSaved();
  setStatus("Saved.");
  return true;
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

  // Close Saved modal then open Pick modal
  closeModal();
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

  // Safety: if the container is missing, don't crash
  if (!els.savedList) return;

  els.savedList.innerHTML = "";

  // Empty state message
  if(items.length === 0){
    els.savedList.innerHTML = `
      <div class="item" style="text-align: center; padding: 2rem 1rem;">
        <div class="itemTitle" style="font-size: 1.2rem; margin-bottom: 1rem;">📋 No saved dates yet</div>
        <div class="itemMeta" style="margin-bottom: 0.5rem;">To save your first date:</div>
        <div class="itemMeta" style="text-align: left; max-width: 400px; margin: 1rem auto;">
          <div style="margin: 0.5rem 0;">1️⃣ Click <strong>"Pick a day-off date"</strong> on the home screen</div>
          <div style="margin: 0.5rem 0;">2️⃣ Select your desired day-off date</div>
          <div style="margin: 0.5rem 0;">3️⃣ Add an optional label (e.g., "Family trip")</div>
          <div style="margin: 0.5rem 0;">4️⃣ Click the <strong>"Save"</strong> button</div>
        </div>
        <div class="itemMeta" style="margin-top: 1rem;">Your saved dates will appear here!</div>
      </div>
    `;
    return;
  }

  for(const item of items){
    const dayOff = parseInputDate(item.dayOff);

    // If an item is corrupted, skip it gracefully
    if(!dayOff) continue;

    const submitBy = addDays(dayOff, -s.advanceDays);
    const early = addDays(dayOff, -(s.advanceDays + s.earlyExtraDays));

    const title = item.label?.trim() ? item.label.trim() : "Day off";
    
    // Check if dates are still in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const submitByStillValid = submitBy >= today;
    const earlyStillValid = early >= today;
    // Show reminders button if at least the submit-by date is still valid
    const showReminders = !item.submitted && submitByStillValid;
    
    // Status badge
    const statusBadge = item.submitted 
      ? '<span style="color: #4ade80; font-weight: 600; margin-left: 0.5rem;">✓ Submitted</span>'
      : '<span style="color: #fbbf24; font-weight: 600; margin-left: 0.5rem;">⏳ Pending</span>';

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTitle">${escapeHtml(title)} — ${fmtLong(dayOff)} (${item.dayOff})${statusBadge}</div>
      <div class="itemMeta">Submit by: ${fmtLong(submitBy)} (${toInputDateValue(submitBy)})</div>
      <div class="itemMeta">Early: ${fmtLong(early)} (${toInputDateValue(early)})</div>
      <div class="itemBtns">
        <button type="button" data-action="use" data-id="${item.id}">Open</button>
        <button type="button" data-action="toggle-submit" data-id="${item.id}" style="background: ${item.submitted ? '#4ade80' : '#fbbf24'}; color: #000;">
          ${item.submitted ? '✓ Submitted' : 'Mark as Submitted'}
        </button>
        ${item.submitted ? '<button type="button" data-action="ics-dayoff" data-id="' + item.id + '">Day-off .ics</button>' : ''}
        ${showReminders ? '<button type="button" data-action="ics-reminders" data-id="' + item.id + '">Submission reminders .ics</button>' : ''}
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
  // Initialize element references
  els = {
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
    modalSaved: $("modalSaved"),

    // Modal: Submit Today
    today: $("today"),
    todayPlusAdvance: $("todayPlusAdvance"),
    labelFromToday: $("labelFromToday"),
    saveTodayBtn: $("saveTodayBtn"),
    exportDayOffFromTodayBtn: $("exportDayOffFromTodayBtn"),
    submitRuleText: $("submitRuleText"),

    // Submit Today hero
    todayPlusAdvanceHero: $("todayPlusAdvanceHero"),
    todayPlusAdvanceSub: $("todayPlusAdvanceSub"),

    // Pick Day Off hero
    submitByHero: $("submitByHero"),
    submitBySub: $("submitBySub"),

    // Modal: Pick Day Off
    dayOffDate: $("dayOffDate"),
    submitBy: $("submitBy"),
    earlyReminder: $("earlyReminder"),
    label: $("label"),
    saveBtn: $("saveBtn"),
    exportDayOffBtn: $("exportDayOffBtn"),
    exportRemindersBtn: $("exportRemindersBtn"),
    pickRuleText: $("pickRuleText"),

    // Settings modal
    advanceDays: $("advanceDays"),
    earlyExtraDays: $("earlyExtraDays"),
    submitByTime: $("submitByTime"),
    earlyTime: $("earlyTime"),
    earlyOffsetText: $("earlyOffsetText"),
    saveSettingsBtn: $("saveSettingsBtn"),
    resetSettingsBtn: $("resetSettingsBtn"),

    // Saved list
    savedList: $("savedList"),
    clearAllBtn: $("clearAllBtn"),
    
    openSaved: $("openSaved"),
  };

  applySettingsToUI();

  // default today
  els.today.value = toInputDateValue(new Date());
  computeFromToday();
  computeFromDayOff();
  renderSaved();
  registerSW();

  els.openSaved.addEventListener("click", () => {
  renderSaved();
  showModal(els.modalSaved);
});


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
    const submitByTime = els.submitByTime.value || "09:00";
    const earlyTime = els.earlyTime.value || "09:00";
    saveSettings({ advanceDays, earlyExtraDays, submitByTime, earlyTime });

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
  els.saveTodayBtn.addEventListener("click", () => {
    const s = loadSettings();
    const base = parseInputDate(els.today.value);
    
    if(!base){
      showToast("⚠️ Please select today's date first");
      setStatus("Pick a valid date.");
      return;
    }
    
    const dayOff = addDays(base, s.advanceDays);
    const dayOffStr = toInputDateValue(dayOff);
    
    // Validate the resulting day-off date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if(dayOff < today){
      showToast("⚠️ Cannot save: This date has already passed", 4000);
      return;
    }
    
    const minDate = addDays(today, 14);
    
    if(dayOff < minDate){
      showToast("⚠️ Cannot save: Missed day-off request window (minimum 14 days notice)", 4000);
      return;
    }
    
    const success = addSavedItem(dayOffStr, els.labelFromToday.value);
    
    if(success){
      closeModal();
      showToast("✓ Date saved successfully! Click folder icon to view.", 4000);
      setStatus("Date saved. Click folder icon to view.");
    } else {
      showToast("⚠️ This date is already saved");
    }
  });

  els.exportDayOffFromTodayBtn.addEventListener("click", () => {
    const s = loadSettings();
    const base = parseInputDate(els.today.value);
    if(!base) return setStatus("Pick a valid 'today' date.");
    const dayOff = addDays(base, s.advanceDays);
    exportEventForDate({ kind:"dayOff", label: els.labelFromToday.value || "Day off (from today)", dayOffDateStr: toInputDateValue(dayOff) });
  });

  els.exportDayOffBtn.addEventListener("click", () => {
    exportEventForDate({ kind:"dayOff", label: els.label.value, dayOffDateStr: els.dayOffDate.value });
  });
  els.exportRemindersBtn.addEventListener("click", () => {
    exportRemindersForDate({ label: els.label.value, dayOffDateStr: els.dayOffDate.value });
  });

  // save day off
  els.saveBtn.addEventListener("click", () => {
    const dayOffStr = els.dayOffDate.value;
    
    if(!dayOffStr){
      showToast("⚠️ Please select a day-off date first");
      setStatus("Pick a day-off date first.");
      return;
    }
    
    // Validate date range before saving
    const dayOff = parseInputDate(dayOffStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if date is in the past
    if(dayOff < today){
      showToast("⚠️ Cannot save: This date has already passed", 4000);
      return;
    }
    
    const minDate = addDays(today, 14); // Minimum 14 days advance notice
    
    if(dayOff < minDate){
      showToast("⚠️ Cannot save: Missed day-off request window (minimum 14 days notice)", 4000);
      return;
    }
    
    const success = addSavedItem(dayOffStr, els.label.value);
    
    if(success){
      closeModal();
      showToast("✓ Date saved successfully! Click folder icon to view.", 4000);
      setStatus("Date saved. Click folder icon to view.");
    } else {
      showToast("⚠️ This date is already saved");
    }
  });

  // saved list actions
  els.savedList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if(action === "use") return useSavedItem(id);
    if(action === "toggle-submit") return toggleSubmitted(id);
    if(action === "delete") return deleteSavedItem(id);

    const item = loadSaved().find(x => x.id === id);
    if(!item) return;

    if(action === "ics-dayoff") return exportEventForDate({ kind:"dayOff", label:item.label, dayOffDateStr:item.dayOff, isSubmitted:item.submitted });
    if(action === "ics-reminders") return exportRemindersForDate({ label:item.label, dayOffDateStr:item.dayOff });
  });

  els.clearAllBtn.addEventListener("click", clearAllSaved);
}

init();
