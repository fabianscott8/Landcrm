# Landcrm

This project is a static, browser-based CRM prototype. To see the live preview:

1. Serve the repository (for example `python3 -m http.server 8000`) or open `index.html` directly in your browser.
2. The app boots with sample leads and buyers so you can explore the workflows immediately.
3. Use the **Load Sample** buttons (top-right of each tab) if you ever clear the data and want to restore the preview dataset.

All changes you make in the UI persist automatically in `localStorage`.

## Testing

Run the Node.js test suite to exercise the shared CRM helpers:

```bash
npm test
```

The project has no external dependencies; Node 18+ is sufficient to execute the tests.
