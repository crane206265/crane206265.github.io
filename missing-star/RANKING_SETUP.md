# Hourly Missing Star Ranking Setup

This ranking backend uses Google Sheets plus Google Apps Script.

## 1. Create the backend

1. Create a new Google Sheet.
2. Open `Extensions > Apps Script`.
3. Paste the contents of `missing-star/ranking-apps-script.js`.
4. Save the Apps Script project.
5. Deploy as a web app.
6. Set access to `Anyone`.
7. Copy the `/exec` web app URL.

The script creates a `submissions` sheet automatically on first request.

## 2. Connect the website

Edit `missing-star/ranking-config.js`:

```js
window.MISSING_STAR_RANKING_ENDPOINT = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

Commit and push that file.

## Scoring

- One hourly problem is worth up to 16 points.
- Weekly ranking is grouped by the KST Monday start date.
- If the same player submits the same hour more than once, only that player's best score for that hour is counted.
- Scores submitted after pressing `Reveal` are not accepted by the website UI and are ignored by the backend when `revealed=true`.
