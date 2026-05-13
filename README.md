# Italia 2026 — Travel Companion PWA

A personal travel companion app for two iPhones. Reads your shared iCloud calendar and adds Claude AI features on top.

## Features

- 📅 Colour-coded calendar from your iCloud shared calendar
- 🗓 Day-by-day timeline with Maps links and URL links
- 🎨 Tap any event to assign a category colour
- 📷 Scan booking confirmations with Claude AI
- 🤖 Claude AI travel assistant with your itinerary as context
- 📱 Installable PWA — add to home screen on both iPhones
- ✈️ Works offline (cached calendar data)

## Setup

### 1. Get your iCloud calendar ICS link

1. Open **Calendar.app** on your iPhone
2. Tap **Calendars** at the bottom
3. Tap the **ⓘ** next to your "Italia 2026" calendar
4. Scroll down and toggle **Public Calendar** ON
5. Tap **Share Link** and copy the `webcal://` URL

### 2. Get your Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in
3. Click **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-`)

### 3. Deploy to GitHub Pages

1. Create a new GitHub repository (public)
2. Upload all files from this folder
3. Go to Settings → Pages → Source: main branch
4. Your app will be live at `https://yourusername.github.io/repo-name`

### 4. Install on both iPhones

1. Open the GitHub Pages URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add**
5. Repeat on your wife's phone
6. Open the app — enter your trip details, ICS URL and API key on first launch

### 5. Assign categories

After the calendar loads, tap any event card to assign it a colour category. Do this once on each phone.

## File Structure

```
index.html          Main app
manifest.json       PWA manifest (home screen install)
sw.js               Service worker (offline support)
css/app.css         All styles
js/app.js           Main app logic
js/store.js         localStorage persistence
js/ics-parser.js    iCloud ICS calendar parser
js/claude.js        Claude API calls
icons/              App icons (Friuli eagle)
```

## Updating

To update the app:
1. Edit files locally
2. Push to GitHub
3. Both phones get the update automatically next time they open the app

No App Store. No Xcode. No expiry.

## Privacy

- Your API key and calendar URL are stored only in your phone's localStorage
- Nothing is sent to any server except Claude API calls (direct from your phone to Anthropic)
- Calendar data is fetched directly from iCloud and cached locally
