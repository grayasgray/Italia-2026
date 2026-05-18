/**
 * ICS Parser — parses .ics / webcal calendar data into event objects
 */
const ICSParser = {

  parse(text) {
    const events = [];
    const blocks = text.split('BEGIN:VEVENT');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0];
      const event = this.parseEvent(block);
      if (!event) continue;

      // Expand multi-day all-day events into one entry per day
      // ICS spec: DTEND for all-day events is exclusive (end day not included)
      if (event.isAllDay && event.endDate && event.endDate > event.startDate) {
        const msPerDay = 86400000;
        // Count how many days this event spans (endDate is exclusive so subtract 1)
        const spanDays = Math.round((event.endDate - event.startDate) / msPerDay);

        if (spanDays > 1) {
          // Create one entry per day
          for (let d = 0; d < spanDays; d++) {
            const dayDate = new Date(event.startDate.getTime() + d * msPerDay);
            events.push({
              ...event,
              // Give each day-entry a unique ID to avoid collisions
              id: d === 0 ? event.id : `${event.id}_day${d}`,
              startDate: dayDate,
              endDate:   dayDate,
              dayKey:    this.toDayKey(dayDate),
              // Mark as a span so category picker still updates the base ID
              spanBaseId: event.id,
              spanDay: d,
              spanTotal: spanDays
            });
          }
          continue; // Don't push original
        }
      }

      events.push(event);
    }

    return events.sort((a, b) => a.startDate - b.startDate);
  },

  parseEvent(block) {
    const get = (key) => {
      // Handle folded lines (lines starting with space/tab are continuations)
      const unfolded = block.replace(/\r?\n[ \t]/g, '');
      const lines = unfolded.split(/\r?\n/);

      for (const line of lines) {
        // Match KEY:value or KEY;PARAM=val:value
        const match = line.match(new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'i'));
        if (match) return match[1].trim();
      }
      return null;
    };

    const uid       = get('UID');
    const summary   = get('SUMMARY');
    if (!summary) return null;

    const dtstart   = get('DTSTART');
    const dtend     = get('DTEND');
    const location  = get('LOCATION');
    const notes     = get('DESCRIPTION');
    const url       = get('URL');

    const startDate = this.parseDate(dtstart);
    const endDate   = this.parseDate(dtend);
    if (!startDate) return null;

    const isAllDay  = dtstart && !dtstart.includes('T');

    // Extract first URL from notes if no explicit URL field
    let extractedURL = url || null;
    if (!extractedURL && notes) {
      const urlMatch = notes.match(/https?:\/\/[^\s\n]+/);
      if (urlMatch) extractedURL = urlMatch[0];
    }

    // Clean URL from notes and normalise escapes
    let cleanNotes = notes
      ? notes
          .replace(/\\n/g, '\n')
          .replace(/\\,/g, ',')
          .replace(/\\;/g, ';')
          .replace(/\\\\/g, '\\')
      : null;
    // Strip extracted URL from notes if present
    if (cleanNotes && extractedURL) {
      cleanNotes = cleanNotes.replace(extractedURL, '').trim();
      // Clean up double spaces and orphan punctuation
      cleanNotes = cleanNotes.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');
    }
    if (cleanNotes === '') cleanNotes = null;

    return {
      id:           uid || `${summary}-${dtstart}`,
      title:        this.unescape(summary),
      startDate,
      endDate,
      isAllDay,
      dayKey:       this.toDayKey(startDate),
      location:     location ? this.unescape(location) : null,
      notes:        cleanNotes || null,
      url:          extractedURL,
      category:     null,  // assigned locally by user
      raw:          block
    };
  },

  parseDate(str) {
    if (!str) return null;
    try {
      // All day: YYYYMMDD
      if (/^\d{8}$/.test(str)) {
        const y = str.slice(0,4), m = str.slice(4,6), d = str.slice(6,8);
        return new Date(`${y}-${m}-${d}T00:00:00`);
      }
      // Date-time: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
      const match = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
      if (match) {
        const [,y,mo,d,h,mi,s,z] = match;
        const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
        return new Date(iso);
      }
    } catch {}
    return null;
  },

  toDayKey(date) {
    if (!date) return null;
    const y  = date.getFullYear();
    const m  = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  unescape(str) {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  },

  // Fetch a webcal:// or https:// ICS URL via a CORS proxy
  async fetchURL(url, signal) {
    const httpsURL = url.replace(/^webcal:\/\//i, 'https://');
    const opts = { cache: 'no-store', signal };

    // Try direct fetch first
    try {
      const res = await fetch(httpsURL, opts);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch(e) {
      // If aborted, propagate so timeout works
      if (e.name === 'AbortError') throw e;
    }

    // CORS proxy fallback
    const proxy = `https://corsproxy.io/?${encodeURIComponent(httpsURL)}`;
    const res = await fetch(proxy, { cache: 'no-store', signal });
    if (!res.ok) throw new Error(`Failed to fetch calendar: ${res.status}`);
    return res.text();
  }
};

window.ICSParser = ICSParser;
