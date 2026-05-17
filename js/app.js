/**
 * TravelSync PWA — main app
 * Changes: Day tab (5-tab nav), unassigned white dots, Dynamic Island safe topbar, Geist style
 */

const App = {
  events:        [],
  selectedDate:  null,
  currentMonth:  new Date(),
  // Day tab has its own date tracking
  dayTabDate:    new Date(),
  chatHistory:   [],
  activeScreen:  'calendar',

  CATEGORIES: [
    { id:'flight',        label:'Flight',        icon:'✈️',  color:'#5B8CFF' },
    { id:'transport',     label:'Transport',     icon:'🚌',  color:'#A78BFA' },
    { id:'accommodation', label:'Accommodation', icon:'🏨',  color:'#14B8A6' },
    { id:'food',          label:'Food & Drink',  icon:'🍜',  color:'#F97316' },
    { id:'activity',      label:'Activity',      icon:'🎭',  color:'#10B981' },
    { id:'admin',         label:'Admin',         icon:'📋',  color:'#EC4899' },
    { id:'other',         label:'Other',         icon:'📌',  color:'#64748B' }
  ],

  getCategoryColor(id)  { return this.CATEGORIES.find(c=>c.id===id)?.color  || '#64748B' },
  getCategoryLabel(id)  { return this.CATEGORIES.find(c=>c.id===id)?.label  || 'Uncategorised' },
  getCategoryIcon(id)   { return this.CATEGORIES.find(c=>c.id===id)?.icon   || '📌' },

  applyCategories() {
    this.events.forEach(e => {
      e.category = Store.getCategoryFor(e.id) || null;
    });
  },

  toDayKey(date) {
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },

  eventsForDay(dayKey) {
    return this.events
      .filter(e => e.dayKey === dayKey)
      .sort((a,b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.startDate||0)-(b.startDate||0);
      });
  },

  // Returns categories for dot display — null means unassigned
  dotsForDay(dayKey) {
    const events = this.eventsForDay(dayKey);
    if (!events.length) return [];
    // Up to 3 dots; unassigned events show as null
    return events.slice(0,3).map(e => e.category || null);
  },

  categoriesForDay(dayKey) {
    const seen = new Set();
    const priority = ['flight','accommodation','activity','food','transport','admin','other'];
    const dayCats = this.eventsForDay(dayKey).map(e=>e.category).filter(Boolean);
    return priority.filter(p => dayCats.includes(p) && !seen.has(p) && seen.add(p));
  },

  isInTrip(date) {
    const cfg = Store.getConfig();
    if (!cfg.startDate || !cfg.endDate) return true;
    const key = this.toDayKey(date);
    return key >= cfg.startDate && key <= cfg.endDate;
  },

  formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
  },

  timeRange(event) {
    if (event.isAllDay) return 'All day';
    const s = this.formatTime(event.startDate);
    const e = this.formatTime(event.endDate);
    return e ? `${s} – ${e}` : s;
  },

  buildItineraryContext() {
    const cfg = Store.getConfig();
    const lines = [];
    lines.push(`TRIP: ${cfg.tripName}`);
    if (cfg.destination) lines.push(`DESTINATION: ${cfg.destination}`);
    if (cfg.startDate)   lines.push(`DATES: ${cfg.startDate} to ${cfg.endDate}`);
    lines.push('');
    const todayKey = this.toDayKey(new Date());
    const todayEvents = this.eventsForDay(todayKey);
    if (todayEvents.length) {
      lines.push(`TODAY (${todayKey}):`);
      todayEvents.forEach(e => {
        let line = `  - ${this.timeRange(e)}: ${e.title}`;
        if (e.category) line += ` [${this.getCategoryLabel(e.category)}]`;
        if (e.location)  line += ` @ ${e.location}`;
        lines.push(line);
      });
      lines.push('');
    }
    lines.push('FULL ITINERARY:');
    const byDay = {};
    this.events.forEach(e => {
      if (!byDay[e.dayKey]) byDay[e.dayKey]=[];
      byDay[e.dayKey].push(e.title);
    });
    Object.keys(byDay).sort().forEach(day => {
      lines.push(`${day}: ${byDay[day].join(', ')}`);
    });
    return lines.join('\n');
  }
};

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  if (!Store.isConfigured()) { showSetup(); return; }
  showLoading();
  await loadEvents();
  App.chatHistory = Store.getChatHistory();
  showApp();
  // Use rAF to ensure DOM is fully painted before navigating
  requestAnimationFrame(() => navigateTo('calendar'));
});

// ── Loading ───────────────────────────────────────────────────

function showLoading() {
  document.getElementById('app').innerHTML = `
    <div class="loading-screen">
      <img src="./icons/icon-192.png" class="loading-eagle" alt=""/>
      <p class="loading-text">Loading itinerary…</p>
    </div>`;
}

// ── Setup ─────────────────────────────────────────────────────

function showSetup() {
  document.getElementById('app').innerHTML = `
    <div class="setup-screen">
      <img src="./icons/icon-192.png" class="setup-eagle" alt=""/>
      <h1 class="setup-title">Italia 2026</h1>
      <p class="setup-sub">Your travel companion</p>
      <div class="setup-form">
        <input class="setup-input" id="s-name"  placeholder="Trip name"           value="Italia 2026"/>
        <input class="setup-input" id="s-dest"  placeholder="Destination"/>
        <input class="setup-input" id="s-start" placeholder="Start date (YYYY-MM-DD)" type="date"/>
        <input class="setup-input" id="s-end"   placeholder="End date (YYYY-MM-DD)"   type="date"/>
        <input class="setup-input" id="s-cal"   placeholder="iCloud ICS URL (webcal://…)"/>
        <input class="setup-input" id="s-key"   placeholder="Anthropic API key (sk-ant-…)" type="password"/>
      </div>
      <button class="btn btn-primary" style="max-width:380px;width:100%" onclick="saveSetup()">Get started</button>
      <p class="setup-footer">
        Your API key and calendar URL are stored only on this device.<br>
        Get your ICS link: Calendar.app → ⓘ next to your calendar → Public Calendar → Share Link.
      </p>
    </div>`;
}

function saveSetup() {
  const name  = document.getElementById('s-name').value.trim();
  const dest  = document.getElementById('s-dest').value.trim();
  const start = document.getElementById('s-start').value.trim();
  const end   = document.getElementById('s-end').value.trim();
  const cal   = document.getElementById('s-cal').value.trim();
  const key   = document.getElementById('s-key').value.trim();
  if (!name||!cal||!key) { showToast('Please fill in trip name, calendar URL and API key'); return; }
  Store.saveConfig({tripName:name,destination:dest,startDate:start,endDate:end,calendarURL:cal,apiKey:key});
  showLoading();
  loadEvents().then(()=>{ App.chatHistory=[]; showApp(); navigateTo('calendar'); });
}

// ── Load events ───────────────────────────────────────────────

async function loadEvents(forceRefresh=false) {
  // Always try cache first — fast path that works offline and on home screen launch
  if (!forceRefresh) {
    const cached = Store.restoreEvents();
    if (cached && cached.length) {
      App.events = cached;
      App.applyCategories();
      // Refresh in background without blocking UI
      refreshInBackground();
      return;
    }
  }
  // No cache — must fetch (first launch or forced refresh)
  await fetchWithTimeout();
}

async function fetchWithTimeout() {
  try {
    const url = Store.getCalendarURL();
    // 10 second timeout — prevents hanging on home screen launch
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const text = await ICSParser.fetchURL(url, controller.signal);
    clearTimeout(timer);
    App.events = ICSParser.parse(text);
    App.applyCategories();
    Store.cacheEvents(App.events);
  } catch(err) {
    console.error('Calendar load failed:', err);
    const cached = Store.restoreEvents();
    if (cached) { App.events = cached; App.applyCategories(); }
  }
}

function refreshInBackground() {
  // Silently refresh calendar after app is shown — no loading screen
  setTimeout(async () => {
    try {
      const url = Store.getCalendarURL();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const text = await ICSParser.fetchURL(url, controller.signal);
      clearTimeout(timer);
      const fresh = ICSParser.parse(text);
      App.events = fresh;
      App.applyCategories();
      Store.cacheEvents(fresh);
      // Re-render current screen silently
      if (App.activeScreen === 'calendar') renderCalendar();
      if (App.activeScreen === 'day') renderDayTab();
    } catch(e) {
      // Silent fail — cached data already shown
    }
  }, 1500);
}

// ── App shell ─────────────────────────────────────────────────

function showApp() {
  document.getElementById('app').innerHTML = `
    <!-- Calendar -->
    <div id="screen-calendar" class="screen">
      <div class="topbar">
        <div>
          <div class="topbar-title" id="cal-trip-name">${Store.getTripName()}</div>
          <div class="topbar-sub" id="cal-trip-dest">${Store.getDestination()}</div>
        </div>
        <button class="topbar-btn" onclick="refreshCalendar()" title="Refresh">↻</button>
      </div>
      <div id="calendar-body" style="overflow-y:auto;flex:1"></div>
    </div>

    <!-- Day tab -->
    <div id="screen-day" class="screen" style="padding-bottom:calc(60px + var(--sab))">
      <div class="topbar">
        <div class="topbar-title">Day</div>
      </div>
      <div class="day-nav-bar">
        <button class="day-nav-btn" onclick="dayTabMove(-1)">←</button>
        <div class="day-nav-center">
          <div class="day-nav-date" id="day-tab-date"></div>
          <div class="day-nav-meta" id="day-tab-meta"></div>
        </div>
        <button class="day-nav-btn" onclick="dayTabMove(1)">→</button>
      </div>
      <div class="day-cards-scroll" id="day-tab-body"></div>
    </div>

    <!-- Scan -->
    <div id="screen-scan" class="screen">
      <div class="topbar">
        <div>
          <div class="topbar-title">Scan</div>
          <div class="topbar-sub">Claude AI extraction</div>
        </div>
      </div>
      <div style="overflow-y:auto;flex:1" id="scan-outer"><div id="scan-body" class="scan-screen-body"></div></div>
    </div>

    <!-- Assistant -->
    <div id="screen-assistant" class="screen" style="padding-bottom:0">
      <div class="topbar">
        <div>
          <div class="topbar-title">Assistant</div>
          <div class="topbar-sub">Claude AI</div>
        </div>
        <button class="topbar-btn" onclick="clearChat()">✕</button>
      </div>
      <div class="assistant-context">
        <span>✦</span>
        <span id="assistant-context-text">Loading…</span>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="suggestions-row" id="suggestions-row"></div>
      <div class="chat-input-row">
        <textarea class="chat-input" id="chat-input" rows="1"
          placeholder="Ask anything about your trip…"
          onkeydown="chatKeydown(event)"></textarea>
        <button class="chat-send" id="chat-send-btn" onclick="sendChat()" disabled>↑</button>
      </div>
    </div>

    <!-- Settings -->
    <div id="screen-settings" class="screen">
      <div class="topbar"><div class="topbar-title">Settings</div></div>
      <div id="settings-body" style="overflow-y:auto;flex:1"></div>
    </div>

    <!-- Bottom nav — 5 tabs -->
    <nav class="bottomnav">
      <button class="nav-item active" id="nav-calendar" onclick="navigateTo('calendar')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        Cal
      </button>
      <button class="nav-item" id="nav-day" onclick="navigateTo('day')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
        Day
      </button>
      <button class="nav-item" id="nav-scan" onclick="navigateTo('scan')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><path d="M8 12h8M12 8v8"/></svg>
        Scan
      </button>
      <button class="nav-item" id="nav-assistant" onclick="navigateTo('assistant')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l1.5 4.5h4.5l-3.6 2.7 1.4 4.3L12 12l-3.8 2.5 1.4-4.3L6 7.5h4.5z"/></svg>
        AI
      </button>
      <button class="nav-item" id="nav-settings" onclick="navigateTo('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        More
      </button>
    </nav>

    <!-- Detail sheet -->
    <div class="sheet-overlay" id="detail-sheet" onclick="closeSheet(event)">
      <div class="sheet" id="sheet-content"></div>
    </div>

    <!-- Toast -->
    <div class="toast" id="toast"></div>`;

  renderCalendar();
  renderDayTab();
  renderScan();
  renderSettings();
  initAssistant();
}

// ── Navigation ────────────────────────────────────────────────

function navigateTo(screen) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`screen-${screen}`)?.classList.add('active');
  document.getElementById(`nav-${screen}`)?.classList.add('active');
  App.activeScreen = screen;
  if (screen==='calendar')  renderCalendar();
  if (screen==='day')       renderDayTab();
  if (screen==='assistant') initAssistant();
}

// ── Calendar ──────────────────────────────────────────────────

function renderCalendar() {
  const container = document.getElementById('calendar-body');
  if (!container) return;

  const today = new Date();
  App.selectedDate  = App.selectedDate  || today;
  App.currentMonth  = App.currentMonth  || today;

  const year  = App.currentMonth.getFullYear();
  const month = App.currentMonth.getMonth();
  const monthLabel = App.currentMonth.toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const firstDay    = new Date(year,month,1);
  const daysInMonth = new Date(year,month+1,0).getDate();
  const startDow    = firstDay.getDay();

  let gridHTML = '';
  for (let i=0;i<startDow;i++) gridHTML += '<div class="cal-day outside"></div>';

  for (let d=1;d<=daysInMonth;d++) {
    const date   = new Date(year,month,d);
    const dayKey = App.toDayKey(date);
    const dots   = App.dotsForDay(dayKey);
    const isToday    = App.toDayKey(today)===dayKey;
    const isSelected = App.toDayKey(App.selectedDate)===dayKey;
    const inTrip     = App.isInTrip(date);

    // Build dots — unassigned = hollow white ring, assigned = filled colour
    const dotsHTML = dots.map(cat =>
      cat
        ? `<div class="cal-dot" style="background:${App.getCategoryColor(cat)}"></div>`
        : `<div class="cal-dot unassigned"></div>`
    ).join('');

    gridHTML += `
      <div class="cal-day
        ${isToday?'today':''}
        ${isSelected?'selected':''}
        ${!inTrip?'not-in-trip':''}"
        onclick="selectDay('${dayKey}')">
        <div class="cal-day-num">${d}</div>
        <div class="cal-dots">${dotsHTML}</div>
      </div>`;
  }

  const totalCells = startDow+daysInMonth;
  const remainder  = totalCells%7;
  if (remainder>0) for (let i=0;i<7-remainder;i++) gridHTML+='<div class="cal-day outside"></div>';

  const selEvents  = App.eventsForDay(App.toDayKey(App.selectedDate));
  const selLabel   = App.selectedDate.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});

  container.innerHTML = `
    <div class="cal-month-nav">
      <button class="cal-nav-btn" onclick="changeMonth(-1)">‹</button>
      <span class="cal-month-label">${monthLabel}</span>
      <button class="cal-nav-btn" onclick="changeMonth(1)">›</button>
    </div>
    <div class="cal-dow">
      ${['S','M','T','W','T','F','S'].map(d=>`<span>${d}</span>`).join('')}
    </div>
    <div class="cal-grid">${gridHTML}</div>

    <div class="day-strip">
      <div class="day-strip-header">
        <span class="day-strip-date">${selLabel}</span>
        ${selEvents.length?`<button class="day-strip-see-all" onclick="jumpDayTab('${App.toDayKey(App.selectedDate)}')">See all →</button>`:''}
      </div>
      ${selEvents.length===0
        ?'<p class="day-strip-empty">Nothing scheduled</p>'
        :selEvents.slice(0,3).map(e=>entryPreviewHTML(e)).join('')}
      ${selEvents.length>3?`<p style="padding:8px 16px;font-size:12px;color:var(--dim)">+ ${selEvents.length-3} more</p>`:''}
    </div>

    <div class="legend">
      ${App.CATEGORIES.map(c=>`
        <div class="legend-item">
          <div class="legend-dot" style="background:${c.color}"></div>
          <span>${c.label}</span>
        </div>`).join('')}
      <div class="legend-item">
        <div class="legend-dot unassigned"></div>
        <span>Unassigned</span>
      </div>
    </div>`;
}

function entryPreviewHTML(event) {
  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Unassigned';
  const catColor = event.category ? color : 'rgba(255,255,255,0.38)';
  return `
    <div class="entry-preview" onclick="jumpDayTab('${event.dayKey}')">
      <div class="entry-preview-bar" style="background:${catColor}"></div>
      <div class="entry-preview-body">
        <div class="entry-preview-title">${escHtml(event.title)}</div>
        <div class="entry-preview-time">${App.timeRange(event)}</div>
      </div>
      <span class="entry-preview-cat" style="background:${catColor}22;color:${catColor}">${catLabel}</span>
    </div>`;
}

function selectDay(dayKey) {
  const [y,m,d] = dayKey.split('-').map(Number);
  App.selectedDate = new Date(y,m-1,d);
  renderCalendar();
}

function changeMonth(dir) {
  App.currentMonth = new Date(App.currentMonth.getFullYear(),App.currentMonth.getMonth()+dir,1);
  renderCalendar();
}

async function refreshCalendar() {
  showToast('Refreshing…');
  await loadEvents(true);
  renderCalendar();
  renderDayTab();
  showToast('Refreshed');
}

// ── Day Tab ───────────────────────────────────────────────────

// Extract the best location string from a day's events
function getDayLocation(events) {
  // Priority: accommodation first (most likely to be a city/place name),
  // then any event with a location
  const byCategory = events.find(e => e.category === 'accommodation' && e.location);
  if (byCategory) return byCategory.location;
  return events.find(e => e.location)?.location || null;
}

// Build an Unsplash search URL for a location
// Uses the free Unsplash source API — no key needed


function renderDayTab() {
  const dateEl = document.getElementById('day-tab-date');
  const metaEl = document.getElementById('day-tab-meta');
  const body   = document.getElementById('day-tab-body');
  if (!dateEl||!body) return;

  const date    = App.dayTabDate;
  const dayKey  = App.toDayKey(date);
  const events  = App.eventsForDay(dayKey);
  const isToday = App.toDayKey(new Date())===dayKey;

  dateEl.textContent = date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const cfg = Store.getConfig();
  let meta = isToday ? 'Today' : '';
  if (cfg.startDate) {
    const start = new Date(cfg.startDate);
    const diff  = Math.round((date-start)/86400000)+1;
    if (diff>=1) meta = (isToday?'Today · ':'') + `Day ${diff}`;
  }
  meta += events.length ? ` · ${events.length} event${events.length>1?'s':''}` : ' · Nothing scheduled';
  metaEl.textContent = meta;

  // Find location for this day
  const location = getDayLocation(events);

  if (events.length===0 && !location) {
    body.innerHTML = `
      <div class="day-empty">
        <div class="day-empty-icon">📍</div>
        <div class="day-empty-title">Nothing scheduled</div>
        <div class="day-empty-sub">A free day — add events in Calendar.app</div>
      </div>`;
    return;
  }

  let html = '';

  // ── Location card ──
  if (location) {
    // Display name: strip street number, show city-level text
    const parts   = location.split(',');
    const cityLine = (parts.length > 1 ? parts.slice(1).join(',') : parts[0]).trim();
    const subLine  = parts.length > 1 ? parts[0].trim() : '';
    html += `
      <div class="location-card">
        <div class="location-card-body">
          <div class="location-card-pin">📍</div>
          <div>
            <div class="location-card-city">${escHtml(cityLine)}</div>
            ${subLine ? `<div class="location-card-sub">${escHtml(subLine)}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  const allDay = events.filter(e=>e.isAllDay);
  const timed  = events.filter(e=>!e.isAllDay);

  if (allDay.length) {
    html += `<div class="allday-label" style="margin-top:${location?'4px':'0'}">All day</div>
      <div class="allday-card">
        ${allDay.map(e=>allDayRowHTML(e)).join('')}
      </div>`;
  }

  timed.forEach(e => { html += entryCardHTML(e); });

  body.innerHTML = html;
}

function dayTabMove(dir) {
  App.dayTabDate = new Date(
    App.dayTabDate.getFullYear(),
    App.dayTabDate.getMonth(),
    App.dayTabDate.getDate()+dir
  );
  renderDayTab();
}

// Jump from calendar strip to day tab for a specific date
function jumpDayTab(dayKey) {
  const [y,m,d] = dayKey.split('-').map(Number);
  App.dayTabDate = new Date(y,m-1,d);
  navigateTo('day');
}

function allDayRowHTML(event) {
  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Unassigned';
  const catColor = event.category ? color : 'rgba(255,255,255,0.38)';
  return `
    <div class="entry-preview" onclick="openDetail('${event.id}')">
      <div class="entry-preview-bar" style="background:${catColor};height:36px"></div>
      <div class="entry-preview-body">
        <div class="entry-preview-title">${escHtml(event.title)}</div>
        ${event.location?`<div class="entry-preview-time">📍 ${escHtml(event.location)}</div>`:''}
      </div>
      <span class="entry-preview-cat" style="background:${catColor}22;color:${catColor}">${catLabel}</span>
    </div>`;
}

function entryCardHTML(event) {
  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Unassigned';
  const catIcon  = App.getCategoryIcon(event.category);
  const catColor = event.category ? color : 'rgba(255,255,255,0.38)';
  const mapURL   = event.location ? `https://maps.apple.com/?q=${encodeURIComponent(event.location)}` : null;
  const accentColor = event.category ? color : 'rgba(255,255,255,0.12)';

  return `
    <div class="entry-card" onclick="openDetail('${event.id}')">
      <div class="entry-card-accent" style="background:${accentColor}"></div>
      <div class="entry-card-body">
        <div class="entry-card-header">
          <div class="entry-card-title">${escHtml(event.title)}</div>
          <span class="cat-badge" style="background:${catColor}22;color:${catColor}"
                onclick="event.stopPropagation();openCategoryPicker('${event.id}')">
            ${catIcon} ${catLabel}
          </span>
        </div>
        <div class="entry-card-time">⏱ ${App.timeRange(event)}</div>
        ${event.notes?`<div class="entry-card-notes">${escHtml(event.notes)}</div>`:''}
        <div class="entry-card-chips">
          ${mapURL?`<a class="chip chip-map" href="${mapURL}" onclick="event.stopPropagation()" target="_blank">📍 Maps</a>`:''}
          ${event.url?`<a class="chip chip-url" href="${event.url}" onclick="event.stopPropagation()" target="_blank">🔗 Link</a>`:''}
        </div>
      </div>
    </div>`;
}

// ── Detail Sheet ──────────────────────────────────────────────

function openDetail(eventId) {
  const event = App.events.find(e=>e.id===eventId);
  if (!event) return;

  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Not set';
  const catIcon  = App.getCategoryIcon(event.category);
  const catColor = event.category ? color : 'rgba(255,255,255,0.38)';
  const mapURL   = event.location ? `https://maps.apple.com/?q=${encodeURIComponent(event.location)}` : null;

  document.getElementById('sheet-content').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${escHtml(event.title)}</div>
      <span class="cat-badge" style="background:${catColor}22;color:${catColor};cursor:pointer"
            onclick="openCategoryPicker('${event.id}')">
        ${catIcon} ${catLabel} — tap to change
      </span>
    </div>
    <div class="sheet-body">
      <div class="sheet-row">
        <div class="sheet-row-icon">⏱</div>
        <div>
          <div class="sheet-row-label">When</div>
          <div class="sheet-row-value">
            ${event.startDate?.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            <br>${App.timeRange(event)}
          </div>
        </div>
      </div>
      ${event.location?`
      <div class="sheet-row">
        <div class="sheet-row-icon">📍</div>
        <div>
          <div class="sheet-row-label">Where</div>
          <a class="sheet-row-link" href="${mapURL}" target="_blank">${escHtml(event.location)} ↗</a>
        </div>
      </div>`:''}
      ${event.notes?`
      <div class="sheet-row">
        <div class="sheet-row-icon">📝</div>
        <div>
          <div class="sheet-row-label">Notes</div>
          <div class="sheet-row-value">${escHtml(event.notes)}</div>
        </div>
      </div>`:''}
      ${event.url?`
      <div class="sheet-row">
        <div class="sheet-row-icon">🔗</div>
        <div>
          <div class="sheet-row-label">Link</div>
          <a class="sheet-row-link" href="${event.url}" target="_blank">
            ${(() => { try { return new URL(event.url).hostname; } catch { return event.url; } })()} ↗
          </a>
        </div>
      </div>`:''}
    </div>`;

  document.getElementById('detail-sheet').classList.add('open');
}

function closeSheet(e) {
  if (e.target===document.getElementById('detail-sheet')) {
    document.getElementById('detail-sheet').classList.remove('open');
  }
}

// ── Category Picker ───────────────────────────────────────────

function openCategoryPicker(eventId) {
  document.getElementById('detail-sheet').classList.remove('open');
  const event   = App.events.find(e=>e.id===eventId);
  const current = event?.category;

  const grid = App.CATEGORIES.map(c=>`
    <div class="cat-option ${current===c.id?'selected':''}"
         style="${current===c.id?`border-color:${c.color}`:''}"
         onclick="assignCategory('${eventId}','${c.id}')">
      <div class="cat-option-swatch" style="background:${c.color}22;border:1px solid ${c.color}20">
        <span>${c.icon}</span>
      </div>
      <div class="cat-option-label">${c.label}</div>
    </div>`).join('');

  document.getElementById('sheet-content').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Category</div>
      <p style="font-size:13px;color:var(--muted);margin-top:4px">${escHtml(event?.title||'')}</p>
    </div>
    <div class="cat-picker-grid">${grid}</div>
    ${current?`
    <div style="padding:0 16px 20px">
      <button class="btn btn-danger" onclick="assignCategory('${eventId}',null)">Remove category</button>
    </div>`:''}`;

  document.getElementById('detail-sheet').classList.add('open');
}

function assignCategory(eventId, category) {
  if (category) Store.assignCategory(eventId,category);
  else Store.removeCategory(eventId);
  App.applyCategories();
  document.getElementById('detail-sheet').classList.remove('open');
  if (App.activeScreen==='calendar') renderCalendar();
  else if (App.activeScreen==='day') renderDayTab();
  showToast(category?`Set to ${App.getCategoryLabel(category)}`:'Category removed');
}

// ── Scan ──────────────────────────────────────────────────────

function renderScan() {
  const body = document.getElementById('scan-body');
  if (!body) return;
  body.innerHTML = `
    <div class="scan-drop-zone">
      <input type="file" accept="image/*" capture="environment" id="scan-input" onchange="handleScanFile(event)"/>
      <div class="scan-drop-icon">📷</div>
      <div class="scan-drop-title">Scan a booking</div>
      <div class="scan-drop-sub">Take a photo or choose from library</div>
    </div>`;
}

async function handleScanFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const imgURL = URL.createObjectURL(file);
  document.getElementById('scan-body').innerHTML = `
    <div class="scan-preview">
      <img src="${imgURL}" alt=""/>
      <div class="scan-overlay">
        <div class="scan-spinner"></div>
        <p>Claude is reading your booking…</p>
      </div>
    </div>`;
  try {
    const base64 = await fileToBase64(file);
    const result = await ClaudeService.parseBookingImage(base64,file.type);
    showScanReview(result,imgURL);
  } catch(err) {
    document.getElementById('scan-body').innerHTML = `
      <div class="scan-drop-zone" onclick="renderScan()">
        <div class="scan-drop-icon">⚠️</div>
        <div class="scan-drop-title">Scan failed</div>
        <div class="scan-drop-sub">${escHtml(err.message)}<br>Tap to try again</div>
      </div>`;
  }
}

function fileToBase64(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(',')[1]);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

function showScanReview(result,imgURL) {
  const confClass = `confidence-${result.confidence||'medium'}`;
  const confMsg   = {high:'✓ High confidence',medium:'⚠ Medium confidence — review carefully',low:'⚠ Low confidence — verify all fields'}[result.confidence]||'Review details';

  document.getElementById('scan-body').innerHTML = `
    <div class="confidence-bar ${confClass}">${confMsg}</div>
    <span class="form-label">Title</span>
    <div class="form-field"><input class="form-input" id="r-title" value="${escAttr(result.title||'')}" placeholder="Event title"/></div>
    <span class="form-label">Date</span>
    <div class="form-field"><input class="form-input" id="r-date" type="date" value="${result.date||''}"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px">
      <div class="form-field"><input class="form-input" id="r-start" type="time" value="${result.startTime||''}" placeholder="Start"/></div>
      <div class="form-field"><input class="form-input" id="r-end" type="time" value="${result.endTime||''}" placeholder="End"/></div>
    </div>
    <span class="form-label">Category</span>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px 16px 12px">
      ${App.CATEGORIES.map(c=>`
        <div class="cat-option ${result.category===c.id?'selected':''}"
             style="${result.category===c.id?`border-color:${c.color}`:''}; padding:8px 10px"
             onclick="selectScanCat('${c.id}',this,'${c.color}')">
          <div class="cat-option-swatch" style="background:${c.color}22;border:1px solid ${c.color}20;width:22px;height:22px;font-size:12px">${c.icon}</div>
          <div class="cat-option-label" style="font-size:12px">${c.label}</div>
        </div>`).join('')}
    </div>
    <span class="form-label">Location</span>
    <div class="form-field"><input class="form-input" id="r-location" value="${escAttr(result.location||'')}" placeholder="Address or venue"/></div>
    <span class="form-label">Booking ref</span>
    <div class="form-field"><input class="form-input" id="r-ref" value="${escAttr(result.bookingReference||'')}" placeholder="Confirmation number"/></div>
    <span class="form-label">Notes</span>
    <div class="form-field"><textarea class="form-input" id="r-notes" rows="3">${escHtml(result.notes||'')}</textarea></div>
    <div style="padding:12px 16px 24px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" onclick="saveScanResult()">✓ Add to calendar info</button>
      <button class="btn btn-secondary" onclick="renderScan()">Scan another</button>
    </div>`;
  document._scanCategory = result.category||'other';
}

function selectScanCat(catId, el, color) {
  document._scanCategory = catId;
  document.querySelectorAll('#scan-body .cat-option').forEach(o=>{
    o.classList.remove('selected');
    o.style.borderWidth='1px';
    o.style.borderColor='';
  });
  el.classList.add('selected');
  el.style.borderColor=color;
  el.style.borderWidth='2px';
}

function saveScanResult() {
  const title = document.getElementById('r-title')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  const date     = document.getElementById('r-date')?.value;
  const start    = document.getElementById('r-start')?.value;
  const end      = document.getElementById('r-end')?.value;
  const location = document.getElementById('r-location')?.value.trim();
  const ref      = document.getElementById('r-ref')?.value.trim();
  const notes    = document.getElementById('r-notes')?.value.trim();

  const lines=[`📅 ${title}`];
  if (date)     lines.push(`Date: ${date}`);
  if (start)    lines.push(`Time: ${start}${end?' – '+end:''}`);
  if (location) lines.push(`📍 ${location}`);
  if (ref)      lines.push(`Ref: ${ref}`);
  if (notes)    lines.push(`Notes: ${notes}`);

  navigator.clipboard?.writeText(lines.join('\n')).catch(()=>{});
  window.location.href='calshow://';
  showToast('Details copied — Calendar.app opening…');
  setTimeout(()=>{ renderScan(); navigateTo('calendar'); },1500);
}

// ── Assistant ─────────────────────────────────────────────────

function initAssistant() {
  const ctxEl = document.getElementById('assistant-context-text');
  if (ctxEl) {
    const cfg=Store.getConfig();
    const todayKey=App.toDayKey(new Date());
    const te=App.eventsForDay(todayKey);
    ctxEl.textContent = te.length
      ? `Today · ${te.length} event${te.length>1?'s':''} · ${cfg.destination||cfg.tripName}`
      : `${cfg.tripName} · ${App.events.length} events`;
  }
  renderChatMessages();
  renderSuggestions();
  const input=document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input',()=>{
      document.getElementById('chat-send-btn').disabled=!input.value.trim();
      input.style.height='auto';
      input.style.height=Math.min(input.scrollHeight,100)+'px';
    });
  }
}

function renderChatMessages() {
  const container=document.getElementById('chat-messages');
  if (!container) return;
  if (App.chatHistory.length===0) {
    container.innerHTML=`
      <div class="chat-welcome">
        <div class="chat-welcome-icon">✦</div>
        <h3>Ciao! I'm your Italy guide</h3>
        <p>Ask me anything about your trip — what's nearby, where to eat, what to do, or anything else.</p>
      </div>`;
    return;
  }
  container.innerHTML=App.chatHistory.map(m=>`
    <div class="msg-wrap ${m.role}">
      <div class="msg-bubble ${m.role}">${m.role==='assistant'?formatAssistantText(m.content):escHtml(m.content)}</div>
      <div class="msg-time">${new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
    </div>`).join('');
  container.scrollTop=container.scrollHeight;
}

function formatAssistantText(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

function renderSuggestions() {
  const row=document.getElementById('suggestions-row');
  if (!row) return;
  const cfg=Store.getConfig();
  const dest=cfg.destination||'the area';
  const hour=new Date().getHours();
  const todayEvents=App.eventsForDay(App.toDayKey(new Date()));
  const firstLoc=todayEvents.find(e=>e.location)?.location;
  const chips=[
    firstLoc?`What's near ${firstLoc}?`:`What's near us today?`,
    hour<11?'Best breakfast spots?':hour<15?'Lunch recommendations?':'Dinner suggestions tonight?',
    `Top things to do in ${dest}`,
    'Any travel tips for Italy?'
  ];
  row.innerHTML=chips.map(c=>
    `<button class="suggestion-chip" onclick="sendSuggestion('${escAttr(c)}')">${escHtml(c)}</button>`
  ).join('');
}

function chatKeydown(e) {
  if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendChat(); }
}

async function sendChat() {
  const input=document.getElementById('chat-input');
  const text=input?.value.trim();
  if (!text) return;
  input.value='';
  input.style.height='auto';
  document.getElementById('chat-send-btn').disabled=true;
  App.chatHistory.push({role:'user',content:text,timestamp:Date.now()});
  Store.saveChatHistory(App.chatHistory);
  renderChatMessages();
  const container=document.getElementById('chat-messages');
  container.insertAdjacentHTML('beforeend',`
    <div class="msg-wrap assistant" id="thinking-indicator">
      <div class="thinking-bubble">
        <div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>
      </div>
    </div>`);
  container.scrollTop=container.scrollHeight;
  try {
    const context=App.buildItineraryContext();
    const history=App.chatHistory.slice(0,-1);
    const reply=await ClaudeService.chat(text,history,context);
    document.getElementById('thinking-indicator')?.remove();
    App.chatHistory.push({role:'assistant',content:reply,timestamp:Date.now()});
    Store.saveChatHistory(App.chatHistory);
    renderChatMessages();
  } catch(err) {
    document.getElementById('thinking-indicator')?.remove();
    App.chatHistory.push({role:'assistant',content:`Sorry, I couldn't connect. ${err.message}`,timestamp:Date.now()});
    renderChatMessages();
  }
}

function sendSuggestion(text) {
  const input=document.getElementById('chat-input');
  if (input) input.value=text;
  document.getElementById('chat-send-btn').disabled=false;
  sendChat();
}

function clearChat() {
  App.chatHistory=[];
  Store.clearChatHistory();
  renderChatMessages();
  renderSuggestions();
}

// ── Settings ──────────────────────────────────────────────────

function renderSettings() {
  const body=document.getElementById('settings-body');
  if (!body) return;
  const cfg=Store.getConfig();
  body.innerHTML=`
    <span class="form-label" style="margin-top:16px;display:block">Trip</span>
    <div style="margin-bottom:2px">
      <div class="settings-row" onclick="editSetting('tripName','Trip name',cfg)">
        <div class="settings-row-left"><div class="settings-row-title">Trip name</div></div>
        <div class="settings-row-right">${escHtml(cfg.tripName||'')} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('destination','Destination',cfg)">
        <div class="settings-row-left"><div class="settings-row-title">Destination</div></div>
        <div class="settings-row-right">${escHtml(cfg.destination||'Not set')} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('startDate','Start date (YYYY-MM-DD)',cfg)">
        <div class="settings-row-left"><div class="settings-row-title">Start date</div></div>
        <div class="settings-row-right">${cfg.startDate||'Not set'} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('endDate','End date (YYYY-MM-DD)',cfg)">
        <div class="settings-row-left"><div class="settings-row-title">End date</div></div>
        <div class="settings-row-right">${cfg.endDate||'Not set'} ›</div>
      </div>
    </div>
    <span class="form-label" style="display:block">Calendar</span>
    <div style="margin-bottom:2px">
      <div class="settings-row" onclick="editSetting('calendarURL','iCloud ICS URL',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">Calendar ICS URL</div>
          <div class="settings-row-sub">${cfg.calendarURL?'✓ Configured':'Not set'}</div>
        </div>
        <div class="settings-row-right">›</div>
      </div>
      <div class="settings-row" onclick="refreshCalendar()">
        <div class="settings-row-left">
          <div class="settings-row-title">Refresh calendar</div>
          <div class="settings-row-sub">Last updated: ${Store.eventCacheAge()<60000?'just now':'earlier'}</div>
        </div>
        <div class="settings-row-right">↻</div>
      </div>
    </div>
    <span class="form-label" style="display:block">Claude AI</span>
    <div style="margin-bottom:2px">
      <div class="settings-row" onclick="editSetting('apiKey','Anthropic API key',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">API key</div>
          <div class="settings-row-sub">${cfg.apiKey?'✓ Configured':'Not set'}</div>
        </div>
        <div class="settings-row-right">›</div>
      </div>
    </div>
    <span class="form-label" style="display:block">Data</span>
    <div>
      <div class="settings-row" onclick="clearAllCategories()">
        <div class="settings-row-left">
          <div class="settings-row-title">Clear all category assignments</div>
          <div class="settings-row-sub">Removes colours set on this device</div>
        </div>
        <div class="settings-row-right" style="color:var(--danger)">Clear</div>
      </div>
    </div>
    <div style="padding:24px 16px;text-align:center">
      <p style="font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:0.08em;text-transform:uppercase">Italia 2026 · Personal travel companion</p>
      <p style="font-size:11px;color:var(--dim);margin-top:4px">All data stored on this device only</p>
    </div>`;
}

function editSetting(key,label,cfg) {
  const current=cfg[key]||'';
  const newVal=prompt(`${label}:`,current);
  if (newVal===null) return;
  cfg[key]=newVal.trim();
  Store.saveConfig(cfg);
  renderSettings();
  if (key==='tripName'||key==='destination') {
    const n=document.getElementById('cal-trip-name');
    const d=document.getElementById('cal-trip-dest');
    if (n) n.textContent=Store.getTripName();
    if (d) d.textContent=Store.getDestination();
  }
  if (key==='calendarURL') refreshCalendar();
  showToast('Saved');
}

function clearAllCategories() {
  if (!confirm('Remove all category colour assignments on this device?')) return;
  localStorage.removeItem('ts_categories');
  App.applyCategories();
  renderCalendar();
  renderDayTab();
  showToast('Categories cleared');
}

// ── Toast ─────────────────────────────────────────────────────

function showToast(msg,duration=2500) {
  const toast=document.getElementById('toast');
  if (!toast) return;
  toast.textContent=msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),duration);
}

// ── Utilities ─────────────────────────────────────────────────

function escHtml(str) {
  return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str??'').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
