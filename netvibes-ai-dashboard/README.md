# My AI Dashboard — first working version

This is a simple Netvibes-style personal dashboard. It is deliberately built without a database or complicated setup.

## What already works

- Add RSS or Atom feeds
- Open feed articles, images, comics and supported YouTube links in a popup
- Drag boxes to rearrange them
- Collapse, archive, restore and permanently delete boxes
- Add a local calendar and notes boxes
- Save an X search as a live shortcut
- Ask Gemini for a concise daily summary of all current RSS items
- Export and import a complete dashboard backup
- Responsive layout for desktop and phone

The layout, notes and calendar are stored in the browser on the device you use. The Gemini key remains on Vercel and is never sent to browser code.

## What is intentionally postponed

Real Gmail and Google Calendar boxes need a Google sign-in and permissions screen. Directly importing X posts needs X API access. Those should be phase two, after deciding whether the basic dashboard feels right.

## Put it online using Vercel

1. In Vercel, choose **Add New → Project** and select the `clarity-lab` repository.
2. Set **Root Directory** to `netvibes-ai-dashboard`.
3. Set the production branch to `agent/netvibes-ai-dashboard` for this first test deployment.
4. Deploy it. No build command is needed.
5. In the Vercel project, open **Settings → Environment Variables**.
6. Add an environment variable named `GEMINI_API_KEY` and paste your Gemini API key as its value.
7. Redeploy once. The **Daily brief** button should now work.

The RSS boxes work without the Gemini key.

## Main files

- `index.html` — the dashboard screen
- `styles.css` — appearance and responsive layout
- `app.js` — boxes, dragging, archive, reader, calendar and local saving
- `api/rss.js` — safely retrieves and parses RSS/Atom feeds
- `api/gemini.js` — creates the daily Gemini brief without exposing the API key

## Testing completed

The JavaScript files pass syntax checks, and the RSS parser is tested against both RSS and Atom examples.
