# Missing Star Ranking Setup

This ranking backend uses Google Sheets plus Google Apps Script.

## 1. Create the backend

1. Create a new Google Sheet.
2. Open `Extensions > Apps Script`.
3. Paste the contents of `missing-star/ranking-apps-script.js`.
4. Save the Apps Script project.
5. Deploy as a web app. When updating this backend later, use `Manage deployments > Edit > New version`.
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

- One six-hour problem is worth up to 25 points.
- Problem 1 is worth 2 points per answer.
- Problem 2 is worth 1 point per answer.
- Problem 3 is worth 1 point per answer.
- Problem 4 is worth 2 points.
- Problem 5 is worth 3 points.
- Problem 6 is worth 2 points.
- Weekly ranking is grouped by the KST Monday start date.
- Ranking uses each player's best single score for the week.
- Scores submitted after pressing `Reveal` are not accepted by the website UI and are ignored by the backend when `revealed=true`.

When changing scoring rules, delete the old submission rows from Google Sheets or start a new `submissions` sheet so old scores do not mix with new scores.
