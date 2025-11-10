# Landcrm

This project is a static, browser-based CRM prototype. To see the live preview:

1. Serve the repository (for example `python3 -m http.server 8000`) or open `index.html` directly in your browser.
2. The app boots with sample leads and buyers so you can explore the workflows immediately.
3. Use the **Load Sample** buttons (top-right of each tab) if you ever clear the data and want to restore the preview dataset.

All changes you make in the UI persist automatically in `localStorage`.

## Features

* Lead management with history logging, buyer assignments, and bulk geocoding tools.
* Collapsible lead detail panels covering the map, contact details, communication history, and nearby comps.
* Multi-channel contact actions with click-to-call/text/email controls and DNC indicators pulled from your import fields.
* A dedicated **Buyers** tab with county, acreage, and price range filters plus buyer history tracking and lead matching.
* Automatic local persistence so uploaded leads, buyers, and notes survive page refreshes.

## Geocoding

The **Geocode via OpenStreetMap** button reverse-geocodes the selected or missing-coordinate leads using OpenStreetMap's Nominatim service. Requests are throttled to one every 1.2 seconds to remain within the public usage policy.

## Testing

Run the Node.js test suite to exercise the shared CRM helpers:

```bash
npm test
```

The project has no external dependencies; Node 18+ is sufficient to execute the tests.
