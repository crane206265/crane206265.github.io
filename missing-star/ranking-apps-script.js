const SHEET_NAME = "submissions";
const TIME_ZONE = "Asia/Seoul";
const HEADERS = [
  "created_at",
  "player",
  "week_key",
  "hour_key",
  "seed",
  "score",
  "max_score",
  "duration_ms",
  "revealed",
];

function doGet(event) {
  const params = event.parameter || {};
  try {
    const action = params.action || "leaderboard";
    if (action === "submit") {
      return jsonp(params.callback, submitScore(params));
    }
    if (action === "leaderboard") {
      return jsonp(params.callback, {
        ok: true,
        rows: getLeaderboard(params.weekKey, params.limit),
      });
    }
    return jsonp(params.callback, { ok: false, error: "unknown action" });
  } catch (error) {
    return jsonp(params.callback, { ok: false, error: String(error.message || error) });
  }
}

function submitScore(params) {
  const player = cleanPlayerName(params.player);
  const weekKey = cleanKey(params.weekKey);
  const hourKey = cleanKey(params.hourKey);
  const score = clampNumber(params.score, 0, Number(params.maxScore || 25));
  const maxScore = clampNumber(params.maxScore, 1, 100);
  const durationMs = clampNumber(params.durationMs, 0, 24 * 60 * 60 * 1000);
  const seed = String(params.seed || "").replace(/[^0-9]/g, "").slice(0, 20);
  const revealed = String(params.revealed || "") === "1";

  if (!player) {
    throw new Error("player is required");
  }
  if (!weekKey || !hourKey) {
    throw new Error("weekKey and hourKey are required");
  }

  getSheet().appendRow([
    new Date(),
    player,
    "'" + weekKey,
    "'" + hourKey,
    seed,
    score,
    maxScore,
    durationMs,
    revealed,
  ]);

  return {
    ok: true,
    message: "Score submitted.",
    rows: getLeaderboard(weekKey, params.limit),
  };
}

function getLeaderboard(weekKey, limitValue) {
  const key = cleanKey(weekKey);
  if (!key) {
    return [];
  }

  const limit = clampNumber(limitValue || 20, 1, 100);
  const values = getSheet().getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }

  const index = makeHeaderIndex(values[0]);
  const byPlayer = {};

  values.slice(1).forEach((row) => {
    if (storedKey(row[index.week_key]) !== key) {
      return;
    }
    if (row[index.revealed] === true || String(row[index.revealed]).toLowerCase() === "true") {
      return;
    }

    const player = cleanPlayerName(row[index.player]);
    const hourKey = storedKey(row[index.hour_key]);
    const score = clampNumber(row[index.score], 0, 100);
    const durationMs = clampNumber(row[index.duration_ms], 0, 24 * 60 * 60 * 1000);
    if (!player || !hourKey) {
      return;
    }

    if (!byPlayer[player]) {
      byPlayer[player] = { player: player, attempts: {}, best: null };
    }
    byPlayer[player].attempts[hourKey] = true;
    if (
      !byPlayer[player].best
      || score > byPlayer[player].best.score
      || (score === byPlayer[player].best.score && durationMs < byPlayer[player].best.durationMs)
    ) {
      byPlayer[player].best = { score: score, durationMs: durationMs };
    }
  });

  return Object.keys(byPlayer).map((player) => {
    const best = byPlayer[player].best || { score: 0, durationMs: 0 };
    return {
      player: player,
      score: best.score,
      attempts: Object.keys(byPlayer[player].attempts).length,
      durationMs: best.durationMs,
    };
  }).sort((a, b) => (
    b.score - a.score
    || a.durationMs - b.durationMs
    || b.attempts - a.attempts
    || a.player.localeCompare(b.player)
  )).slice(0, limit).map((row) => ({
    player: row.player,
    score: row.score,
    attempts: row.attempts,
  }));
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (existingHeaders.join("") === "") {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("C:D").setNumberFormat("@");
  return sheet;
}

function makeHeaderIndex(headerRow) {
  const index = {};
  headerRow.forEach((name, i) => {
    index[String(name)] = i;
  });
  HEADERS.forEach((name) => {
    if (index[name] === undefined) {
      throw new Error("missing sheet header: " + name);
    }
  });
  return index;
}

function jsonp(callback, payload) {
  const safeCallback = String(callback || "").replace(/[^\w.$]/g, "");
  const json = JSON.stringify(payload);
  const body = safeCallback ? safeCallback + "(" + json + ");" : json;
  const mime = safeCallback
    ? ContentService.MimeType.JAVASCRIPT
    : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}

function cleanPlayerName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .slice(0, 24);
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .replace(/^'/, "")
    .replace(/[^0-9A-Za-z_-]/g, "")
    .slice(0, 32);
}

function storedKey(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd");
  }
  return cleanKey(value);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}
