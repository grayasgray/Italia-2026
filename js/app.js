/**
 * TravelSync PWA — main app
 */

// ── State ─────────────────────────────────────────────────────

const App = {
  events:       [],
  filteredEvents: [],
  selectedDate: null,
  currentMonth: new Date(),
  chatHistory:  [],
  activeScreen: 'calendar',
  currentDetail: null,

  CATEGORIES: [
    { id: 'flight',        label: 'Flight',        icon: '✈️',  color: '#5B8CFF' },
    { id: 'transport',     label: 'Transport',     icon: '🚌',  color: '#A78BFA' },
    { id: 'accommodation', label: 'Accommodation', icon: '🏨',  color: '#14B8A6' },
    { id: 'food',          label: 'Food & Drink',  icon: '🍜',  color: '#F97316' },
    { id: 'activity',      label: 'Activity',      icon: '🎭',  color: '#10B981' },
    { id: 'free',          label: 'Free Day',      icon: '☀️',  color: '#94A3B8' },
    { id: 'admin',         label: 'Admin',         icon: '📋',  color: '#EC4899' },
    { id: 'other',         label: 'Other',         icon: '📌',  color: '#64748B' }
  ],

  getCategoryColor(id) {
    return this.CATEGORIES.find(c => c.id === id)?.color || '#64748B';
  },
  getCategoryLabel(id) {
    return this.CATEGORIES.find(c => c.id === id)?.label || 'Uncategorised';
  },
  getCategoryIcon(id) {
    return this.CATEGORIES.find(c => c.id === id)?.icon || '📌';
  },

  // Merge stored category assignments into events
  applyCategories() {
    this.events.forEach(e => {
      e.category = Store.getCategoryFor(e.id) || e.category || null;
    });
  },

  // Day key helpers
  toDayKey(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  eventsForDay(dayKey) {
    return this.events
      .filter(e => e.dayKey === dayKey)
      .sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.startDate || 0) - (b.startDate || 0);
      });
  },

  categoriesForDay(dayKey) {
    const seen = new Set();
    const priority = ['flight','accommodation','activity','food','transport','admin','other','free'];
    const dayCats = this.eventsForDay(dayKey).map(e => e.category).filter(Boolean);
    return priority.filter(p => dayCats.includes(p) && !seen.has(p) && seen.add(p));
  },

  isInTrip(date) {
    const cfg = Store.getConfig();
    if (!cfg.startDate || !cfg.endDate) return true;
    const key   = this.toDayKey(date);
    return key >= cfg.startDate && key <= cfg.endDate;
  },

  formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
    // Group by day
    const byDay = {};
    this.events.forEach(e => {
      if (!byDay[e.dayKey]) byDay[e.dayKey] = [];
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
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (!Store.isConfigured()) {
    showSetup();
    return;
  }

  showLoading();
  await loadEvents();
  App.chatHistory = Store.getChatHistory();
  showApp();
  navigateTo('calendar');
});

// ── Loading ───────────────────────────────────────────────────

function showLoading() {
  document.getElementById('app').innerHTML = `
    <div class="loading-screen">
      <img src="./icons/icon-192.png" class="loading-eagle" alt=""/>
      <p class="loading-text">Loading itinerary…</p>
    </div>`;
}

// ── Setup screen ──────────────────────────────────────────────

function showSetup() {
  document.getElementById('app').innerHTML = `
    <div class="setup-screen">
      <img src="./icons/icon-192.png" class="setup-eagle" alt=""/>
      <h1 class="setup-title">Italia 2026</h1>
      <p class="setup-sub">Your personal travel companion</p>
      <div class="setup-form">
        <input class="setup-input" id="s-name"   placeholder="Trip name (e.g. Italia 2026)" value="Italia 2026"/>
        <input class="setup-input" id="s-dest"   placeholder="Destination (e.g. Friuli, Italy)"/>
        <input class="setup-input" id="s-start"  placeholder="Start date (YYYY-MM-DD)" type="date"/>
        <input class="setup-input" id="s-end"    placeholder="End date (YYYY-MM-DD)"   type="date"/>
        <input class="setup-input" id="s-cal"    placeholder="iCloud calendar ICS URL (webcal://...)"/>
        <input class="setup-input" id="s-key"    placeholder="Anthropic API key (sk-ant-...)" type="password"/>
      </div>
      <button class="btn btn-primary w-full" style="max-width:380px" onclick="saveSetup()">
        Get started
      </button>
      <p class="setup-footer">
        Your API key and calendar URL are stored only on this device.<br>
        Get your ICS link from Calendar.app → tap ⓘ next to your calendar → Public Calendar → Share Link.
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

  if (!name || !cal || !key) {
    showToast('Please fill in trip name, calendar URL and API key');
    return;
  }

  Store.saveConfig({ tripName: name, destination: dest, startDate: start, endDate: end, calendarURL: cal, apiKey: key });
  showLoading();
  loadEvents().then(() => {
    App.chatHistory = [];
    showApp();
    navigateTo('calendar');
  });
}

// ── Load events ───────────────────────────────────────────────

async function loadEvents(forceRefresh = false) {
  // Use cache if fresh (< 10 minutes old) and not forced
  if (!forceRefresh && Store.eventCacheAge() < 10 * 60 * 1000) {
    const cached = Store.restoreEvents();
    if (cached && cached.length) {
      App.events = cached;
      App.applyCategories();
      return;
    }
  }

  try {
    const url  = Store.getCalendarURL();
    const text = await ICSParser.fetchURL(url);
    App.events = ICSParser.parse(text);
    App.applyCategories();
    Store.cacheEvents(App.events);
  } catch (err) {
    console.error('Calendar load failed:', err);
    // Fall back to cache even if stale
    const cached = Store.restoreEvents();
    if (cached) {
      App.events = cached;
      App.applyCategories();
    }
    showToast('Could not refresh calendar — showing cached data');
  }
}

// ── App shell ─────────────────────────────────────────────────

function showApp() {
  document.getElementById('app').innerHTML = `
    <!-- Calendar screen -->
    <div id="screen-calendar" class="screen">
      <div class="topbar">
        <div>
          <div class="topbar-title" id="cal-trip-name">${Store.getTripName()}</div>
          <div class="topbar-sub" id="cal-trip-dest">${Store.getDestination()}</div>
        </div>
        <button class="topbar-btn" onclick="refreshCalendar()" title="Refresh">↻</button>
      </div>
      <div id="calendar-body"></div>
    </div>

    <!-- Day screen -->
    <div id="screen-day" class="screen">
      <div class="topbar">
        <button class="topbar-btn" onclick="navigateTo('calendar')">←</button>
        <div style="flex:1;text-align:center">
          <div class="topbar-title" id="day-title"></div>
        </div>
        <div style="width:36px"></div>
      </div>
      <div id="day-body"></div>
    </div>

    <!-- Scan screen -->
    <div id="screen-scan" class="screen scan-screen">
      <div class="topbar">
        <div>
          <div class="topbar-title">Scan booking</div>
          <div class="topbar-sub">Claude AI extraction</div>
        </div>
      </div>
      <div id="scan-body"></div>
    </div>

    <!-- Assistant screen -->
    <div id="screen-assistant" class="screen" style="padding-bottom:0">
      <div class="topbar">
        <div>
          <div class="topbar-title">Travel assistant</div>
          <div class="topbar-sub">Powered by Claude AI</div>
        </div>
        <button class="topbar-btn" onclick="clearChat()" title="Clear">✕</button>
      </div>
      <div class="assistant-context">
        <span>✦</span>
        <span id="assistant-context-text">Loading itinerary context…</span>
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

    <!-- Settings screen -->
    <div id="screen-settings" class="screen">
      <div class="topbar">
        <div class="topbar-title">Settings</div>
      </div>
      <div id="settings-body"></div>
    </div>

    <!-- Bottom nav -->
    <nav class="bottomnav">
      <button class="nav-item active" id="nav-calendar" onclick="navigateTo('calendar')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        Calendar
      </button>
      <button class="nav-item" id="nav-scan" onclick="navigateTo('scan')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
          <path d="M8 12h8M12 8v8"/>
        </svg>
        Scan
      </button>
      <button class="nav-item" id="nav-assistant" onclick="navigateTo('assistant')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 3l1.5 4.5h4.5l-3.6 2.7 1.4 4.3L12 12l-3.8 2.5 1.4-4.3L6 7.5h4.5z"/>
        </svg>
        Assistant
      </button>
      <button class="nav-item" id="nav-settings" onclick="navigateTo('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        Settings
      </button>
    </nav>

    <!-- Detail sheet -->
    <div class="sheet-overlay" id="detail-sheet" onclick="closeSheet(event)">
      <div class="sheet" id="sheet-content"></div>
    </div>

    <!-- Toast -->
    <div class="toast" id="toast"></div>`;

  // Initial render
  renderCalendar();
  renderScan();
  renderSettings();
  initAssistant();
}

// ── Navigation ────────────────────────────────────────────────

function navigateTo(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`screen-${screen}`)?.classList.add('active');
  document.getElementById(`nav-${screen}`)?.classList.add('active');
  App.activeScreen = screen;
  if (screen === 'calendar') renderCalendar();
}

// ── Calendar ──────────────────────────────────────────────────

function renderCalendar() {
  const container = document.getElementById('calendar-body');
  if (!container) return;

  const today = new Date();
  App.selectedDate = App.selectedDate || today;
  App.currentMonth = App.currentMonth || today;

  const year  = App.currentMonth.getFullYear();
  const month = App.currentMonth.getMonth();

  const monthLabel = App.currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const firstDay    = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow    = firstDay.getDay(); // 0=Sun

  let gridHTML = '';
  // Leading blanks
  for (let i = 0; i < startDow; i++) gridHTML += '<div class="cal-day outside"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const date   = new Date(year, month, d);
    const dayKey = App.toDayKey(date);
    const cats   = App.categoriesForDay(dayKey);
    const isToday    = App.toDayKey(today) === dayKey;
    const isSelected = App.toDayKey(App.selectedDate) === dayKey;
    const inTrip     = App.isInTrip(date);

    const dots = cats.slice(0,3).map(c =>
      `<div class="cal-dot" style="background:${App.getCategoryColor(c)}"></div>`
    ).join('');

    gridHTML += `
      <div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${!inTrip ? 'not-in-trip' : ''}"
           onclick="selectDay('${dayKey}')">
        <div class="cal-day-num">${d}</div>
        <div class="cal-dots">${dots}</div>
      </div>`;
  }

  // Trailing blanks
  const totalCells = startDow + daysInMonth;
  const remainder  = totalCells % 7;
  if (remainder > 0) {
    for (let i = 0; i < 7 - remainder; i++) gridHTML += '<div class="cal-day outside"></div>';
  }

  const selectedDayEvents = App.eventsForDay(App.toDayKey(App.selectedDate));
  const selectedLabel = App.selectedDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  container.innerHTML = `
    <div class="cal-month-nav">
      <button class="cal-nav-btn" onclick="changeMonth(-1)">‹</button>
      <span class="cal-month-label">${monthLabel}</span>
      <button class="cal-nav-btn" onclick="changeMonth(1)">›</button>
    </div>
    <div class="cal-dow">
      ${['S','M','T','W','T','F','S'].map(d => `<span>${d}</span>`).join('')}
    </div>
    <div class="cal-grid">${gridHTML}</div>

    <div class="day-strip">
      <div class="day-strip-header">
        <span class="day-strip-date">${selectedLabel}</span>
        ${selectedDayEvents.length ? `<button class="day-strip-see-all" onclick="openDay('${App.toDayKey(App.selectedDate)}')">See all →</button>` : ''}
      </div>
      ${selectedDayEvents.length === 0
        ? '<p class="day-strip-empty">Nothing scheduled</p>'
        : selectedDayEvents.slice(0,3).map(e => entryPreviewHTML(e)).join('')
      }
      ${selectedDayEvents.length > 3 ? `<p style="padding:8px 16px;font-size:12px;color:var(--text3)">+ ${selectedDayEvents.length - 3} more</p>` : ''}
    </div>

    <div class="legend">
      ${App.CATEGORIES.map(c => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${c.color}"></div>
          <span>${c.label}</span>
        </div>`).join('')}
    </div>`;
}

function entryPreviewHTML(event) {
  const color = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Unset';
  return `
    <div class="entry-preview" onclick="openDay('${event.dayKey}')">
      <div class="entry-preview-bar" style="background:${color}"></div>
      <div class="entry-preview-body">
        <div class="entry-preview-title">${escHtml(event.title)}</div>
        <div class="entry-preview-time">${App.timeRange(event)}</div>
      </div>
      <span class="entry-preview-cat" style="background:${color}22;color:${color}">${catLabel}</span>
    </div>`;
}

function selectDay(dayKey) {
  const [y,m,d] = dayKey.split('-').map(Number);
  App.selectedDate = new Date(y, m-1, d);
  renderCalendar();
}

function changeMonth(dir) {
  App.currentMonth = new Date(
    App.currentMonth.getFullYear(),
    App.currentMonth.getMonth() + dir,
    1
  );
  renderCalendar();
}

async function refreshCalendar() {
  showToast('Refreshing calendar…');
  await loadEvents(true);
  renderCalendar();
  showToast('Calendar refreshed');
}

// ── Day View ──────────────────────────────────────────────────

function openDay(dayKey) {
  const [y,m,d] = dayKey.split('-').map(Number);
  const date  = new Date(y, m-1, d);
  const events = App.eventsForDay(dayKey);

  document.getElementById('day-title').textContent =
    date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const cfg = Store.getConfig();
  let dayNum = '';
  if (cfg.startDate) {
    const start = new Date(cfg.startDate);
    const diff  = Math.round((date - start) / 86400000) + 1;
    if (diff >= 1) dayNum = `Day ${diff}`;
  }

  const allDay = events.filter(e => e.isAllDay);
  const timed  = events.filter(e => !e.isAllDay);

  let html = `
    <div class="day-header">
      <div class="day-header-date">
        ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <div class="day-header-meta">
        ${dayNum ? dayNum + ' · ' : ''}${events.length} event${events.length !== 1 ? 's' : ''}
      </div>
    </div>`;

  if (events.length === 0) {
    html += `<div style="padding:60px 20px;text-align:center">
      <p style="font-size:32px;margin-bottom:12px">☀️</p>
      <p style="font-family:var(--font-display);font-size:20px;color:var(--text2)">Nothing scheduled</p>
      <p style="font-size:13px;color:var(--text3);margin-top:6px">A free day in Italy</p>
    </div>`;
  }

  if (allDay.length) {
    html += `<div class="allday-section">
      <div class="allday-label">All day</div>
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        ${allDay.map(e => allDayRowHTML(e)).join('')}
      </div>
    </div>`;
  }

  if (timed.length) {
    html += `<div class="timeline">`;
    timed.forEach((e, i) => {
      const isLast = i === timed.length - 1;
      const color  = App.getCategoryColor(e.category);
      html += `
        <div class="timeline-row">
          <div class="timeline-time">${App.formatTime(e.startDate)}</div>
          <div class="timeline-spine">
            <div class="spine-dot" style="background:${color}"></div>
            ${!isLast ? '<div class="spine-line"></div>' : ''}
          </div>
          ${entryCardHTML(e)}
        </div>`;
    });
    html += `</div>`;
  }

  document.getElementById('day-body').innerHTML = html;
  navigateTo('day');
}

function allDayRowHTML(event) {
  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Tap to set';
  return `
    <div class="entry-preview" onclick="openDetail('${event.id}')">
      <div class="entry-preview-bar" style="background:${color}"></div>
      <div class="entry-preview-body">
        <div class="entry-preview-title">${escHtml(event.title)}</div>
        ${event.location ? `<div class="entry-preview-time">📍 ${escHtml(event.location)}</div>` : ''}
      </div>
      <span class="entry-preview-cat" style="background:${color}22;color:${color}">${catLabel}</span>
    </div>`;
}

function entryCardHTML(event) {
  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Tap to set';
  const catIcon  = App.getCategoryIcon(event.category);

  const mapURL = event.location
    ? (hasGoogleMaps()
        ? `comgooglemaps://?q=${encodeURIComponent(event.location)}`
        : `https://maps.apple.com/?q=${encodeURIComponent(event.location)}`)
    : null;

  return `
    <div class="entry-card" onclick="openDetail('${event.id}')">
      <div class="entry-card-accent" style="background:${color}"></div>
      <div class="entry-card-body">
        <div class="entry-card-header">
          <div class="entry-card-title">${escHtml(event.title)}</div>
          <span class="cat-badge" style="background:${color}22;color:${color}"
                onclick="event.stopPropagation();openCategoryPicker('${event.id}')">
            ${catIcon} ${catLabel}
          </span>
        </div>
        <div class="entry-card-time">🕐 ${App.timeRange(event)}</div>
        ${event.notes ? `<div class="entry-card-notes">${escHtml(event.notes)}</div>` : ''}
        <div class="entry-card-chips">
          ${mapURL ? `<a class="chip chip-map" href="${mapURL}" onclick="event.stopPropagation()" target="_blank">📍 Maps</a>` : ''}
          ${event.url ? `<a class="chip chip-url" href="${event.url}" onclick="event.stopPropagation()" target="_blank">🔗 Link</a>` : ''}
        </div>
      </div>
    </div>`;
}

function hasGoogleMaps() {
  // Safari on iOS — can check if scheme is available
  return false; // Default to Apple Maps for PWA; Google Maps opens in browser anyway
}

// ── Detail Sheet ──────────────────────────────────────────────

function openDetail(eventId) {
  const event = App.events.find(e => e.id === eventId);
  if (!event) return;
  App.currentDetail = event;

  const color    = App.getCategoryColor(event.category);
  const catLabel = event.category ? App.getCategoryLabel(event.category) : 'Not set';
  const catIcon  = App.getCategoryIcon(event.category);

  const mapURL = event.location
    ? `https://maps.apple.com/?q=${encodeURIComponent(event.location)}`
    : null;

  document.getElementById('sheet-content').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">${escHtml(event.title)}</div>
      <span class="cat-badge" style="background:${color}22;color:${color};cursor:pointer"
            onclick="openCategoryPicker('${event.id}')">
        ${catIcon} ${catLabel} — tap to change
      </span>
    </div>
    <div class="sheet-body">
      <div class="sheet-row">
        <div class="sheet-row-icon">🕐</div>
        <div>
          <div class="sheet-row-label">When</div>
          <div class="sheet-row-value">
            ${event.startDate?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            <br>${App.timeRange(event)}
          </div>
        </div>
      </div>
      ${event.location ? `
      <div class="sheet-row">
        <div class="sheet-row-icon">📍</div>
        <div>
          <div class="sheet-row-label">Where</div>
          <a class="sheet-row-link" href="${mapURL}" target="_blank">
            ${escHtml(event.location)} ↗
          </a>
        </div>
      </div>` : ''}
      ${event.notes ? `
      <div class="sheet-row">
        <div class="sheet-row-icon">📝</div>
        <div>
          <div class="sheet-row-label">Notes</div>
          <div class="sheet-row-value">${escHtml(event.notes)}</div>
        </div>
      </div>` : ''}
      ${event.url ? `
      <div class="sheet-row">
        <div class="sheet-row-icon">🔗</div>
        <div>
          <div class="sheet-row-label">Link</div>
          <a class="sheet-row-link" href="${event.url}" target="_blank">
            ${new URL(event.url).hostname} ↗
          </a>
        </div>
      </div>` : ''}
    </div>`;

  document.getElementById('detail-sheet').classList.add('open');
}

function closeSheet(e) {
  if (e.target === document.getElementById('detail-sheet')) {
    document.getElementById('detail-sheet').classList.remove('open');
  }
}

// ── Category Picker ───────────────────────────────────────────

function openCategoryPicker(eventId) {
  document.getElementById('detail-sheet').classList.remove('open');

  const event   = App.events.find(e => e.id === eventId);
  const current = event?.category;

  const grid = App.CATEGORIES.map(c => `
    <div class="cat-option ${current === c.id ? 'selected' : ''}"
         style="${current === c.id ? `border-color:${c.color}` : ''}"
         onclick="assignCategory('${eventId}', '${c.id}')">
      <div class="cat-option-swatch" style="background:${c.color}22;border:1.5px solid ${c.color}">
        <span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:14px">${c.icon}</span>
      </div>
      <div class="cat-option-label">${c.label}</div>
    </div>`).join('');

  document.getElementById('sheet-content').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <div class="sheet-title">Choose category</div>
      <p style="font-size:13px;color:var(--text3);margin-top:4px">${escHtml(event?.title || '')}</p>
    </div>
    <div class="cat-picker-grid">${grid}</div>
    ${current ? `
    <div style="padding:0 16px 20px">
      <button class="btn btn-danger" onclick="assignCategory('${eventId}', null)">
        Remove category
      </button>
    </div>` : ''}`;

  document.getElementById('detail-sheet').classList.add('open');
}

function assignCategory(eventId, category) {
  if (category) {
    Store.assignCategory(eventId, category);
  } else {
    Store.removeCategory(eventId);
  }
  App.applyCategories();
  document.getElementById('detail-sheet').classList.remove('open');
  // Re-render current view
  if (App.activeScreen === 'calendar') renderCalendar();
  else if (App.activeScreen === 'day') {
    const event = App.events.find(e => e.id === eventId);
    if (event) openDay(event.dayKey);
  }
  showToast(category ? `Category set to ${App.getCategoryLabel(category)}` : 'Category removed');
}

// ── Scan / Photo Import ───────────────────────────────────────

function renderScan() {
  const body = document.getElementById('scan-body');
  if (!body) return;
  body.innerHTML = `
    <div class="scan-drop-zone" id="scan-zone">
      <input type="file" accept="image/*" capture="environment" id="scan-input" onchange="handleScanFile(event)"/>
      <div class="scan-drop-icon">📷</div>
      <div class="scan-drop-title">Scan a booking</div>
      <div class="scan-drop-sub">Take a photo or choose from library<br>Claude will extract the details</div>
    </div>
    <div id="scan-result"></div>`;
}

async function handleScanFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Show preview + scanning state
  const imgURL = URL.createObjectURL(file);
  document.getElementById('scan-body').innerHTML = `
    <div class="scan-preview">
      <img src="${imgURL}" alt="Scanned booking"/>
      <div class="scan-overlay">
        <div class="scan-spinner"></div>
        <p>Claude is reading your booking…</p>
      </div>
    </div>`;

  try {
    const base64 = await fileToBase64(file);
    const result = await ClaudeService.parseBookingImage(base64, file.type);
    showScanReview(result, imgURL);
  } catch (err) {
    document.getElementById('scan-body').innerHTML = `
      <div class="scan-drop-zone" onclick="renderScan()">
        <div class="scan-drop-icon">⚠️</div>
        <div class="scan-drop-title">Scan failed</div>
        <div class="scan-drop-sub">${escHtml(err.message)}<br>Tap to try again</div>
      </div>`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showScanReview(result, imgURL) {
  const confClass = `confidence-${result.confidence || 'medium'}`;
  const confMsg   = {
    high:   '✓ High confidence — details look good',
    medium: '⚠ Medium confidence — please review carefully',
    low:    '⚠ Low confidence — verify all fields'
  }[result.confidence] || 'Review the extracted details';

  document.getElementById('scan-body').innerHTML = `
    <div class="confidence-bar ${confClass}">${confMsg}</div>

    <div style="padding:0 0 8px">
      <span class="form-label">Title</span>
      <div class="form-field">
        <input class="form-input" id="r-title" value="${escAttr(result.title || '')}" placeholder="Event title"/>
      </div>

      <span class="form-label">Date</span>
      <div class="form-field">
        <input class="form-input" id="r-date" type="date" value="${result.date || ''}"/>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px">
        <div class="form-field">
          <input class="form-input" id="r-start" type="time" value="${result.startTime || ''}" placeholder="Start"/>
        </div>
        <div class="form-field">
          <input class="form-input" id="r-end" type="time" value="${result.endTime || ''}" placeholder="End"/>
        </div>
      </div>

      <span class="form-label">Category</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 16px 12px">
        ${App.CATEGORIES.map(c => `
          <div class="cat-option ${result.category === c.id ? 'selected' : ''}"
               style="${result.category === c.id ? `border-color:${c.color}` : ''}"
               onclick="selectScanCat('${c.id}')">
            <div class="cat-option-swatch" style="background:${c.color}22;border:1px solid ${c.color}">
              <span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px">${c.icon}</span>
            </div>
            <div class="cat-option-label" style="font-size:12px">${c.label}</div>
          </div>`).join('')}
      </div>

      <span class="form-label">Location</span>
      <div class="form-field">
        <input class="form-input" id="r-location" value="${escAttr(result.location || '')}" placeholder="Address or venue"/>
      </div>

      <span class="form-label">Booking reference</span>
      <div class="form-field">
        <input class="form-input" id="r-ref" value="${escAttr(result.bookingReference || '')}" placeholder="Confirmation number"/>
      </div>

      <span class="form-label">Notes</span>
      <div class="form-field">
        <textarea class="form-input" id="r-notes" rows="3" placeholder="Additional details">${escHtml(result.notes || '')}</textarea>
      </div>
    </div>

    <div style="padding:0 16px 24px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" onclick="saveScanResult('${escAttr(result.category || 'other')}')">
        ✓ Add to calendar info
      </button>
      <button class="btn btn-secondary" onclick="renderScan()">
        Scan another
      </button>
    </div>`;

  // Store selected category
  document._scanCategory = result.category || 'other';
}

function selectScanCat(catId) {
  document._scanCategory = catId;
  document.querySelectorAll('.cat-option').forEach(el => {
    el.classList.remove('selected');
    el.style.borderWidth = '';
    el.style.borderColor = '';
  });
  const allOpts = document.querySelectorAll('.cat-option');
  const cat = App.CATEGORIES.find(c => c.id === catId);
  allOpts.forEach(el => {
    if (el.querySelector('.cat-option-label')?.textContent === cat?.label) {
      el.classList.add('selected');
      el.style.borderColor = cat.color;
      el.style.borderWidth = '2px';
    }
  });
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
  const category = document._scanCategory || 'other';

  // Build a summary to copy to clipboard for pasting into Calendar.app
  const lines = [`📅 ${title}`];
  if (date)     lines.push(`Date: ${date}`);
  if (start)    lines.push(`Time: ${start}${end ? ' – ' + end : ''}`);
  if (location) lines.push(`📍 ${location}`);
  if (ref)      lines.push(`Ref: ${ref}`);
  if (notes)    lines.push(`Notes: ${notes}`);

  const summary = lines.join('\n');

  // Copy to clipboard
  navigator.clipboard?.writeText(summary).catch(() => {});

  // Try to open Calendar.app
  const calURL = buildCalendarURL({ title, date, start, end, location, notes: [ref ? `Ref: ${ref}` : '', notes].filter(Boolean).join('\n') });
  window.location.href = calURL;

  showToast('Details copied — Calendar.app opening…');

  setTimeout(() => {
    renderScan();
    navigateTo('calendar');
  }, 1500);
}

function buildCalendarURL({ title, date, start, end, location, notes }) {
  // x-apple-calevent:// deep link to prefill a new Calendar event
  const base = 'calshow://';
  // Fallback: just open Calendar
  return base;
}

// ── Assistant ─────────────────────────────────────────────────

function initAssistant() {
  const ctxEl = document.getElementById('assistant-context-text');
  if (ctxEl) {
    const cfg = Store.getConfig();
    const todayKey = App.toDayKey(new Date());
    const todayEvents = App.eventsForDay(todayKey);
    ctxEl.textContent = todayEvents.length
      ? `Today · ${todayEvents.length} event${todayEvents.length > 1 ? 's' : ''} · ${cfg.destination || cfg.tripName}`
      : `${cfg.tripName} · ${App.events.length} events loaded`;
  }

  renderChatMessages();
  renderSuggestions();

  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input', () => {
      document.getElementById('chat-send-btn').disabled = !input.value.trim();
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (App.chatHistory.length === 0) {
    container.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">✦</div>
        <h3>Ciao! I'm your Italy guide</h3>
        <p>Ask me anything about your trip — what's nearby, where to eat, what to do, or anything else.</p>
      </div>`;
    return;
  }

  container.innerHTML = App.chatHistory.map(m => `
    <div class="msg-wrap ${m.role}">
      <div class="msg-bubble ${m.role}">${m.role === 'assistant' ? formatAssistantText(m.content) : escHtml(m.content)}</div>
      <div class="msg-time">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
    </div>`).join('');

  container.scrollTop = container.scrollHeight;
}

function formatAssistantText(text) {
  // Simple formatting: bold (**text**), line breaks
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function renderSuggestions() {
  const row = document.getElementById('suggestions-row');
  if (!row) return;

  const cfg = Store.getConfig();
  const dest = cfg.destination || 'the area';
  const hour = new Date().getHours();
  const todayEvents = App.eventsForDay(App.toDayKey(new Date()));
  const firstLoc = todayEvents.find(e => e.location)?.location;

  const chips = [
    firstLoc ? `What's near ${firstLoc}?` : `What's near us today?`,
    hour < 11 ? 'Best breakfast spots?' : hour < 15 ? 'Lunch recommendations?' : 'Dinner suggestions tonight?',
    `Top things to do in ${dest}`,
    'Any travel tips for Italy?'
  ];

  row.innerHTML = chips.map(c =>
    `<button class="suggestion-chip" onclick="sendSuggestion('${escAttr(c)}')">${escHtml(c)}</button>`
  ).join('');
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input?.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('chat-send-btn').disabled = true;

  App.chatHistory.push({ role: 'user', content: text, timestamp: Date.now() });
  Store.saveChatHistory(App.chatHistory);
  renderChatMessages();

  // Show thinking
  const container = document.getElementById('chat-messages');
  container.insertAdjacentHTML('beforeend', `
    <div class="msg-wrap assistant" id="thinking-indicator">
      <div class="thinking-bubble">
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
      </div>
    </div>`);
  container.scrollTop = container.scrollHeight;

  try {
    const context = App.buildItineraryContext();
    // Pass history without the message we just added
    const history = App.chatHistory.slice(0, -1);
    const reply = await ClaudeService.chat(text, history, context);

    document.getElementById('thinking-indicator')?.remove();
    App.chatHistory.push({ role: 'assistant', content: reply, timestamp: Date.now() });
    Store.saveChatHistory(App.chatHistory);
    renderChatMessages();
  } catch (err) {
    document.getElementById('thinking-indicator')?.remove();
    App.chatHistory.push({
      role: 'assistant',
      content: `Sorry, I couldn't connect. ${err.message}`,
      timestamp: Date.now()
    });
    renderChatMessages();
  }
}

function sendSuggestion(text) {
  const input = document.getElementById('chat-input');
  if (input) input.value = text;
  document.getElementById('chat-send-btn').disabled = false;
  sendChat();
}

function clearChat() {
  App.chatHistory = [];
  Store.clearChatHistory();
  renderChatMessages();
  renderSuggestions();
}

// ── Settings ──────────────────────────────────────────────────

function renderSettings() {
  const body = document.getElementById('settings-body');
  if (!body) return;
  const cfg = Store.getConfig();

  body.innerHTML = `
    <span class="form-label" style="margin-top:16px;display:block">Trip</span>
    <div class="settings-section">
      <div class="settings-row" onclick="editSetting('tripName','Trip name',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">Trip name</div>
        </div>
        <div class="settings-row-right">${escHtml(cfg.tripName || '')} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('destination','Destination',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">Destination</div>
        </div>
        <div class="settings-row-right">${escHtml(cfg.destination || 'Not set')} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('startDate','Start date (YYYY-MM-DD)',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">Start date</div>
        </div>
        <div class="settings-row-right">${cfg.startDate || 'Not set'} ›</div>
      </div>
      <div class="settings-row" onclick="editSetting('endDate','End date (YYYY-MM-DD)',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">End date</div>
        </div>
        <div class="settings-row-right">${cfg.endDate || 'Not set'} ›</div>
      </div>
    </div>

    <span class="form-label" style="display:block">Calendar</span>
    <div class="settings-section">
      <div class="settings-row" onclick="editSetting('calendarURL','iCloud ICS URL',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">Calendar ICS URL</div>
          <div class="settings-row-sub">${cfg.calendarURL ? '✓ Configured' : 'Not set'}</div>
        </div>
        <div class="settings-row-right">›</div>
      </div>
      <div class="settings-row" onclick="refreshCalendar()">
        <div class="settings-row-left">
          <div class="settings-row-title">Refresh calendar now</div>
          <div class="settings-row-sub">Last updated: ${Store.eventCacheAge() < 60000 ? 'just now' : 'earlier'}</div>
        </div>
        <div class="settings-row-right">↻</div>
      </div>
    </div>

    <span class="form-label" style="display:block">Claude AI</span>
    <div class="settings-section">
      <div class="settings-row" onclick="editSetting('apiKey','Anthropic API key',cfg)">
        <div class="settings-row-left">
          <div class="settings-row-title">API key</div>
          <div class="settings-row-sub">${cfg.apiKey ? '✓ Configured' : 'Not set'}</div>
        </div>
        <div class="settings-row-right">›</div>
      </div>
    </div>

    <span class="form-label" style="display:block">Data</span>
    <div class="settings-section">
      <div class="settings-row" onclick="clearAllCategories()">
        <div class="settings-row-left">
          <div class="settings-row-title">Clear all category assignments</div>
          <div class="settings-row-sub">Removes colours set on this device</div>
        </div>
        <div class="settings-row-right" style="color:#EC4899">Clear</div>
      </div>
    </div>

    <div style="padding:24px 16px;text-align:center">
      <p style="font-size:12px;color:var(--text3)">Italia 2026 · Personal travel companion</p>
      <p style="font-size:11px;color:var(--text3);margin-top:4px">All data stored on this device only</p>
    </div>`;
}

function editSetting(key, label, cfg) {
  const current = cfg[key] || '';
  const newVal  = prompt(`${label}:`, current);
  if (newVal === null) return;
  cfg[key] = newVal.trim();
  Store.saveConfig(cfg);
  renderSettings();
  if (key === 'tripName' || key === 'destination') {
    document.getElementById('cal-trip-name').textContent = Store.getTripName();
    document.getElementById('cal-trip-dest').textContent = Store.getDestination();
  }
  if (key === 'calendarURL') refreshCalendar();
  showToast('Setting saved');
}

function clearAllCategories() {
  if (!confirm('Remove all category colour assignments on this device?')) return;
  localStorage.removeItem('ts_categories');
  App.applyCategories();
  renderCalendar();
  showToast('Categories cleared');
}

// ── Toast ─────────────────────────────────────────────────────

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Utilities ─────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
