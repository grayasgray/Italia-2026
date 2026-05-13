/**
 * Store — all localStorage persistence
 */
const Store = {

  // ── Config ──────────────────────────────────────────────

  getConfig() {
    try {
      return JSON.parse(localStorage.getItem('ts_config') || '{}');
    } catch { return {}; }
  },

  saveConfig(config) {
    localStorage.setItem('ts_config', JSON.stringify(config));
  },

  getCalendarURL()  { return this.getConfig().calendarURL  || ''; },
  getTripName()     { return this.getConfig().tripName     || 'My Trip'; },
  getDestination()  { return this.getConfig().destination  || ''; },
  getStartDate()    { return this.getConfig().startDate    || ''; },
  getEndDate()      { return this.getConfig().endDate      || ''; },
  getAPIKey()       { return this.getConfig().apiKey       || ''; },

  isConfigured() {
    const c = this.getConfig();
    return !!(c.calendarURL && c.tripName && c.apiKey);
  },

  // ── Category assignments ─────────────────────────────────

  getCategories() {
    try {
      return JSON.parse(localStorage.getItem('ts_categories') || '{}');
    } catch { return {}; }
  },

  assignCategory(eventId, category) {
    const cats = this.getCategories();
    cats[eventId] = category;
    localStorage.setItem('ts_categories', JSON.stringify(cats));
  },

  removeCategory(eventId) {
    const cats = this.getCategories();
    delete cats[eventId];
    localStorage.setItem('ts_categories', JSON.stringify(cats));
  },

  getCategoryFor(eventId) {
    return this.getCategories()[eventId] || null;
  },

  // ── Chat history ─────────────────────────────────────────

  getChatHistory() {
    try {
      return JSON.parse(localStorage.getItem('ts_chat') || '[]');
    } catch { return []; }
  },

  saveChatHistory(messages) {
    // Keep last 40 messages to avoid storage bloat
    const trimmed = messages.slice(-40);
    localStorage.setItem('ts_chat', JSON.stringify(trimmed));
  },

  clearChatHistory() {
    localStorage.removeItem('ts_chat');
  },

  // ── Cached events ────────────────────────────────────────

  getCachedEvents() {
    try {
      const raw = localStorage.getItem('ts_events');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  cacheEvents(events) {
    // Store dates as ISO strings for JSON serialisation
    const serialisable = events.map(e => ({
      ...e,
      startDate: e.startDate?.toISOString(),
      endDate:   e.endDate?.toISOString()
    }));
    localStorage.setItem('ts_events', JSON.stringify(serialisable));
    localStorage.setItem('ts_events_time', Date.now().toString());
  },

  restoreEvents() {
    const cached = this.getCachedEvents();
    if (!cached) return null;
    return cached.map(e => ({
      ...e,
      startDate: e.startDate ? new Date(e.startDate) : null,
      endDate:   e.endDate   ? new Date(e.endDate)   : null
    }));
  },

  eventCacheAge() {
    const t = localStorage.getItem('ts_events_time');
    return t ? Date.now() - parseInt(t) : Infinity;
  },

  clearEventCache() {
    localStorage.removeItem('ts_events');
    localStorage.removeItem('ts_events_time');
  }
};

window.Store = Store;
