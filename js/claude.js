/**
 * Claude API service
 */
const ClaudeService = {

  MODEL: 'claude-sonnet-4-6',
  API_URL: 'https://api.anthropic.com/v1/messages',

  // ── Photo / document parsing ─────────────────────────────

  async parseBookingImage(base64Data, mimeType = 'image/jpeg') {
    const apiKey = Store.getAPIKey();
    if (!apiKey) throw new Error('No API key configured');

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true'
      },
      body: JSON.stringify({
        model: this.MODEL,
        max_tokens: 1024,
        system: this.PARSE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Data }
            },
            { type: 'text', text: this.PARSE_USER_PROMPT }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return this.parseJSON(text);
  },

  // ── Assistant chat ────────────────────────────────────────

  async chat(message, history, itineraryContext) {
    const apiKey = Store.getAPIKey();
    if (!apiKey) throw new Error('No API key configured');

    // Build messages array from history + new message
    const messages = history.map(m => ({
      role: m.role,
      content: m.content
    }));
    messages.push({ role: 'user', content: message });

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true'
      },
      body: JSON.stringify({
        model: this.MODEL,
        max_tokens: 1024,
        system: this.assistantSystemPrompt(itineraryContext),
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Sorry, I could not get a response.';
  },

  // ── JSON parsing ──────────────────────────────────────────

  parseJSON(text) {
    const cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error('Could not parse Claude response as JSON');
    }
  },

  // ── Prompts ───────────────────────────────────────────────

  PARSE_SYSTEM_PROMPT: `You are a travel itinerary assistant. Extract structured information from images of travel documents — booking confirmations, restaurant cards, hotel vouchers, flight itineraries, and attraction tickets.

Always respond with a single valid JSON object. Never include explanation or markdown outside the JSON. Use null for any field not visible in the image. Never fabricate information.`,

  PARSE_USER_PROMPT: `Extract all travel itinerary details from this image and return them as JSON with this exact schema:
{
  "title": "Short descriptive name (string, required)",
  "date": "YYYY-MM-DD if visible, else null",
  "startTime": "HH:mm 24hr if visible, else null",
  "endTime": "HH:mm 24hr if visible, else null",
  "isAllDay": true or false,
  "category": "one of: flight, transport, accommodation, food, activity, admin, other",
  "location": "full address or venue name, else null",
  "notes": "useful details: instructions, what's included, meeting point etc, else null",
  "url": "website URL if visible, else null",
  "bookingReference": "confirmation/booking number if visible, else null",
  "confidence": "high, medium, or low"
}

Category guide:
- flight: airplane journeys
- transport: trains, buses, ferries, taxis, transfers
- accommodation: hotels, Airbnb, any overnight stay
- food: restaurants, cafes, bars, food tours
- activity: sightseeing, tours, museums, experiences
- admin: visas, insurance, reminders
- other: anything else

Respond with only the JSON object.`,

  assistantSystemPrompt(context) {
    return `You are a knowledgeable and friendly travel assistant helping a couple enjoy their holiday in Italy. You have access to their current itinerary.

ITINERARY:
${context}

Guidelines:
- Be concise and practical — they are on holiday and want quick useful answers
- When suggesting places, consider their current location and schedule  
- For restaurant or activity suggestions, give 2-3 concrete options with a one-line reason each
- Include opening hours or booking tips when relevant
- Use a warm conversational tone like a knowledgeable local friend
- If asked about something on their itinerary, refer to it specifically`;
  }
};

window.ClaudeService = ClaudeService;
