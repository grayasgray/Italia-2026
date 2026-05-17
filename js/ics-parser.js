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
      if (event) events.push(event);
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

    // Clean URL from notes
    let cleanNotes = notes
      ? notes
          .replace(/\\n/g, '\n')
          .replace(/\\,/g, ',')
          .replace(/\\;/g, ';')
          .replace(extractedURL || '', '')
          .trim()
      : null;

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
