(function () {
  const DATA_URL = "../assets/missing-star/catalog.json";
  const LATITUDE_DEG = 20.9626;
  const LONGITUDE_DEG = 105.7487;
  const STAR_MAG_LIMIT = 5.0;
  const MISSING_COUNT = 5;
  const MISSING_MAG_LIMIT = 2.6;
  const NUMBERED_COUNT = 4;
  const NUMBERED_MAG_LIMIT = 2.6;
  const MIRROR_HORIZONTAL = true;
  const MIN_ALTITUDE_DEG = 10.0;
  const MESSIER_COUNT = 4;
  const LATITUDE_TOLERANCE_DEG = 3.0;
  const LONGITUDE_TOLERANCE_DEG = 3.0;
  const LST_TOLERANCE_HOURS = 0.25;
  const TOTAL_ANSWER_COUNT = MISSING_COUNT + MESSIER_COUNT + NUMBERED_COUNT + 3;
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

  const state = {
    catalog: null,
    problem: null,
    canvas: null,
    ctx: null,
    initializedRoot: null,
    resizeObserver: null,
    showSolution: false,
    revealed: false,
    hintLevel: 0,
    countdownTimer: null,
  };

  const greekNames = {
    "α": "alpha",
    "β": "beta",
    "γ": "gamma",
    "δ": "delta",
    "ε": "epsilon",
    "ζ": "zeta",
    "η": "eta",
    "θ": "theta",
    "ι": "iota",
    "κ": "kappa",
    "λ": "lambda",
    "μ": "mu",
    "ν": "nu",
    "ξ": "xi",
    "ο": "omicron",
    "π": "pi",
    "ρ": "rho",
    "σ": "sigma",
    "τ": "tau",
    "υ": "upsilon",
    "φ": "phi",
    "χ": "chi",
    "ψ": "psi",
    "ω": "omega",
  };

  const superscriptDigits = {
    "¹": "1",
    "²": "2",
    "³": "3",
    "⁴": "4",
    "⁵": "5",
    "⁶": "6",
    "⁷": "7",
    "⁸": "8",
    "⁹": "9",
    "⁰": "0",
  };

  function initMissingStarPage() {
    const root = document.getElementById("missing-star-root");
    if (!root || state.initializedRoot === root) {
      return;
    }

    state.initializedRoot = root;
    state.canvas = document.getElementById("missing-star-canvas");
    state.ctx = state.canvas.getContext("2d");
    state.showSolution = false;
    state.revealed = false;
    state.hintLevel = 0;

    bindControls();
    loadCatalog()
      .then(() => {
        generateTodayProblem();
        renderInputs();
        renderProblemInfo();
        drawChart();
        updateFeedback("Bayer 표기, 별 이름, 또는 catalog id를 입력할 수 있습니다.");
        startCountdown();
      })
      .catch((error) => {
        updateFeedback(`데이터를 불러오지 못했습니다: ${error.message}`);
      });

    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
    }
    state.resizeObserver = new ResizeObserver(() => drawChart());
    state.resizeObserver.observe(state.canvas.parentElement);
  }

  function bindControls() {
    document.getElementById("missing-star-refresh").addEventListener("click", () => {
      state.showSolution = false;
      state.revealed = false;
      state.hintLevel = 0;
      generateTodayProblem();
      renderInputs();
      renderProblemInfo();
      drawChart();
      updateHints();
      updateFeedback("오늘 날짜 seed로 문제를 다시 그렸습니다.");
    });

    document.getElementById("missing-star-check").addEventListener("click", checkAnswers);
    document.getElementById("missing-star-hint").addEventListener("click", () => {
      state.hintLevel = Math.min(3, state.hintLevel + 1);
      updateHints();
    });
    document.getElementById("missing-star-reveal").addEventListener("click", revealAnswers);
    document.getElementById("missing-star-solution-toggle").addEventListener("click", () => {
      state.showSolution = !state.showSolution;
      drawChart();
    });
  }

  async function loadCatalog() {
    if (state.catalog) {
      return state.catalog;
    }
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    state.catalog = await response.json();
    return state.catalog;
  }

  function generateTodayProblem() {
    const dateKey = kstDateKey();
    const seed = fnv1a(`missing-star:${dateKey}`);
    const rng = mulberry32(seed);
    const slotHourUtc = 12 + Math.floor(rng() * 4);
    const observationUtc = dateKeyToUtcDate(dateKey, slotHourUtc);
    const lstHours = utcToLstHours(observationUtc, LONGITUDE_DEG);
    const rotation = rng() * Math.PI * 2;

    const projectedStars = state.catalog.stars
      .map((star) => {
        const horizontal = horizontalCoordinates(
          star.ra,
          star.dec,
          LATITUDE_DEG,
          lstHours,
          rotation,
        );
        return { ...star, ...horizontal };
      })
      .filter((star) => star.mag < STAR_MAG_LIMIT && star.altDeg >= 0);

    let missingCandidates = projectedStars.filter((star) => (
      star.mag < MISSING_MAG_LIMIT
      && star.altDeg >= MIN_ALTITUDE_DEG
      && state.catalog.bayer[star.id]
    ));

    if (missingCandidates.length < MISSING_COUNT) {
      missingCandidates = projectedStars.filter((star) => (
        star.mag <= 3.0
        && star.altDeg >= MIN_ALTITUDE_DEG
        && state.catalog.bayer[star.id]
      ));
    }

    const missingStars = pickMany(missingCandidates, MISSING_COUNT, rng)
      .map((star, index) => ({
        ...star,
        answerIndex: index + 1,
        info: state.catalog.bayer[star.id],
      }));
    const missingIds = new Set(missingStars.map((star) => star.id));
    const referenceCandidates = missingCandidates.filter((star) => !missingIds.has(star.id));
    const referenceStar = pickMany(referenceCandidates, 1, rng)[0] || missingCandidates[0];

    const numberedCandidates = projectedStars.filter((star) => (
      star.mag <= NUMBERED_MAG_LIMIT
      && star.altDeg >= MIN_ALTITUDE_DEG
      && !missingIds.has(star.id)
      && star.id !== referenceStar.id
      && state.catalog.bayer[star.id]
    ));
    const numberedStars = pickMany(numberedCandidates, NUMBERED_COUNT, rng)
      .map((star, index) => ({
        ...star,
        label: String(index + 1),
        info: state.catalog.bayer[star.id],
      }));

    const messierObjects = state.catalog.messier
      .map((object) => {
        const horizontal = horizontalCoordinates(
          object.ra,
          object.dec,
          LATITUDE_DEG,
          lstHours,
          rotation,
        );
        return { ...object, ...horizontal };
      })
      .filter((object) => object.altDeg >= MIN_ALTITUDE_DEG);
    const selectedMessier = pickMany(messierObjects, MESSIER_COUNT, rng)
      .map((object, index) => ({ ...object, label: alphabeticLabel(index) }));

    state.problem = {
      dateKey,
      seed,
      observationUtc,
      lstHours,
      rotation,
      stars: projectedStars,
      missingStars,
      referenceStar: {
        ...referenceStar,
        info: state.catalog.bayer[referenceStar.id],
      },
      numberedStars,
      messierObjects: selectedMessier,
    };
  }

  function renderInputs() {
    renderLabeledInputs("missing-star-inputs", MISSING_COUNT, (index) => String(index + 1), "예: α Cyg");
    renderLabeledInputs("messier-inputs", state.problem.messierObjects.length, (index) => alphabeticLabel(index), "예: M31");
    renderLabeledInputs("numbered-star-inputs", state.problem.numberedStars.length, (index) => String(index + 1), "예: α Cyg");
    renderSingleInput("latitude-input", "latitude-answer", "위도 (deg)");
    renderSingleInput("lst-input", "lst-answer", "LST (hours)");
    renderSingleInput("longitude-input", "longitude-answer", "경도 (deg)");
  }

  function renderLabeledInputs(containerId, count, labelForIndex, placeholder) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for (let index = 0; index < count; index += 1) {
      const row = document.createElement("div");
      row.className = "answer-row";

      const label = document.createElement("label");
      label.htmlFor = `${containerId}-${index}`;
      label.textContent = labelForIndex(index);

      const input = document.createElement("input");
      input.id = `${containerId}-${index}`;
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = placeholder;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          checkAnswers();
        }
      });

      row.append(label, input);
      container.append(row);
    }
  }

  function renderSingleInput(containerId, inputId, placeholder) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = placeholder;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        checkAnswers();
      }
    });
    container.append(input);
  }

  function renderProblemInfo() {
    const problem = state.problem;
    document.getElementById("missing-star-date").textContent = `KST ${problem.dateKey}`;
    document.getElementById("missing-star-seed").textContent = `seed ${problem.seed}`;
    document.getElementById("missing-star-chart-date").textContent = `Chart date ${formatUtcDateTime(problem.observationUtc)}`;
    document.getElementById("lst-reference").textContent = `Star R RA: ${formatRa(problem.referenceStar.ra)}`;
    document.getElementById("longitude-reference").textContent = `Chart date: ${formatUtcDateTime(problem.observationUtc)}`;
    document.getElementById("longitude-ra-reference").textContent = `Star R RA: ${formatRa(problem.referenceStar.ra)}`;
    document.getElementById("missing-star-solution-toggle").disabled = !state.revealed;
    updateProgress(0);
  }

  function checkAnswers() {
    const result = evaluateInputs();
    updateProgress(result.correctCount);

    result.items.forEach(({ input, status }) => {
      input.classList.toggle("is-correct", status === "correct");
      input.classList.toggle("is-close", status === "close");
    });

    if (result.correctCount === TOTAL_ANSWER_COUNT) {
      state.revealed = true;
      state.showSolution = true;
      document.getElementById("missing-star-solution-toggle").disabled = false;
      drawChart();
      updateFeedback("정답입니다. 정답 성도를 표시했습니다.", "success");
      return;
    }

    updateFeedback(`${result.correctCount} / ${TOTAL_ANSWER_COUNT}개를 맞혔습니다.`);
  }

  function revealAnswers() {
    state.revealed = true;
    state.showSolution = true;
    document.getElementById("missing-star-solution-toggle").disabled = false;

    const inputs = missingAnswerInputs();
    state.problem.missingStars.forEach((star, index) => {
      inputs[index].value = star.info.bayerUnicode || star.info.bayerLatex || star.id;
      inputs[index].classList.add("is-correct");
    });

    messierAnswerInputs().forEach((input, index) => {
      const object = state.problem.messierObjects[index];
      input.value = object.id;
      input.classList.add("is-correct");
    });

    numberedAnswerInputs().forEach((input, index) => {
      const star = state.problem.numberedStars[index];
      input.value = star.info.bayerUnicode || star.info.bayerLatex || star.id;
      input.classList.add("is-correct");
    });

    document.getElementById("latitude-answer").value = LATITUDE_DEG.toFixed(2);
    document.getElementById("lst-answer").value = state.problem.lstHours.toFixed(2);
    document.getElementById("longitude-answer").value = LONGITUDE_DEG.toFixed(2);
    numericInputs().forEach((input) => input.classList.add("is-correct"));

    updateProgress(TOTAL_ANSWER_COUNT);
    drawChart();
    updateHints(true);
    updateFeedback("정답을 표시했습니다.", "revealed");
  }

  function evaluateInputs() {
    const matchedIds = new Set();
    const items = [];

    missingAnswerInputs().forEach((input) => {
      const value = normalizeAnswer(input.value);
      let matched = null;
      if (value) {
        matched = state.problem.missingStars.find((star) => (
          !matchedIds.has(star.id)
          && answerAliases(star).some((alias) => normalizeAnswer(alias) === value)
        ));
      }
      if (matched) {
        matchedIds.add(matched.id);
      }
      items.push({ input, status: matched ? "correct" : "wrong" });
    });

    messierAnswerInputs().forEach((input, index) => {
      const object = state.problem.messierObjects[index];
      const value = normalizeAnswer(input.value);
      const correct = Boolean(value) && messierAliases(object).some((alias) => normalizeAnswer(alias) === value);
      items.push({ input, status: correct ? "correct" : "wrong" });
    });

    numberedAnswerInputs().forEach((input, index) => {
      const star = state.problem.numberedStars[index];
      const value = normalizeAnswer(input.value);
      const correct = Boolean(value) && answerAliases(star).some((alias) => normalizeAnswer(alias) === value);
      items.push({ input, status: correct ? "correct" : "wrong" });
    });

    items.push(evaluateNumericInput(
      document.getElementById("latitude-answer"),
      LATITUDE_DEG,
      LATITUDE_TOLERANCE_DEG,
      "linear",
    ));
    items.push(evaluateNumericInput(
      document.getElementById("lst-answer"),
      state.problem.lstHours,
      LST_TOLERANCE_HOURS,
      "hours",
    ));
    items.push(evaluateNumericInput(
      document.getElementById("longitude-answer"),
      LONGITUDE_DEG,
      LONGITUDE_TOLERANCE_DEG,
      "longitude",
    ));

    return {
      correctCount: items.filter((item) => item.status === "correct").length,
      items,
    };
  }

  function answerAliases(star) {
    return [
      star.id,
      star.info.nameKo,
      star.info.bayerUnicode,
      star.info.bayerLatex,
    ].filter(Boolean);
  }

  function messierAliases(object) {
    return [
      object.id,
      object.id.replace(/^M/i, ""),
      object.nameKo,
      object.nameEn,
    ].filter(Boolean);
  }

  function evaluateNumericInput(input, expected, tolerance, mode) {
    const parsed = mode === "hours"
      ? parseHours(input.value)
      : parseSignedAngle(input.value, mode === "longitude" ? "longitude" : "latitude");
    if (!Number.isFinite(parsed)) {
      return { input, status: "wrong" };
    }

    let error = Math.abs(parsed - expected);
    if (mode === "hours") {
      error = hourDistance(parsed, expected);
    } else if (mode === "longitude") {
      error = angularDistanceDeg(parsed, expected);
    }

    return {
      input,
      status: error <= tolerance ? "correct" : "wrong",
    };
  }

  function normalizeAnswer(value) {
    let text = String(value || "").trim().toLowerCase();
    Object.entries(greekNames).forEach(([symbol, name]) => {
      text = text.replaceAll(symbol, ` ${name} `);
    });
    Object.entries(superscriptDigits).forEach(([symbol, digit]) => {
      text = text.replaceAll(symbol, digit);
    });
    text = text
      .replace(/\\mathrm\{([^}]+)\}/g, " $1 ")
      .replace(/\\([a-z]+)/g, " $1 ")
      .replace(/[{}^_~$(),.;:/\\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }

  function updateProgress(correctCount) {
    document.getElementById("missing-star-progress").textContent = `${correctCount} / ${TOTAL_ANSWER_COUNT}`;
  }

  function updateFeedback(message, mode) {
    const box = document.getElementById("missing-star-feedback");
    box.classList.toggle("is-success", mode === "success");
    box.classList.toggle("is-revealed", mode === "revealed");
    box.textContent = message;
  }

  function updateHints(forceReveal = false) {
    const hints = document.getElementById("missing-star-hints");
    const level = forceReveal ? 3 : state.hintLevel;
    hints.hidden = level === 0;
    if (level === 0) {
      hints.innerHTML = "";
      return;
    }

    const missingHintHtml = state.problem.missingStars.map((star, index) => {
      const direction = azimuthName(star.azDeg);
      const first = (star.info.bayerUnicode || star.info.bayerLatex || star.id).slice(0, 1);
      const identity = level >= 3
        ? `<span>${escapeHtml(star.info.nameKo)} · ${escapeHtml(star.info.bayerUnicode)}</span>`
        : `<span>Bayer 첫 글자: ${escapeHtml(first)}</span>`;
      const position = level >= 2
        ? `<span>고도 ${star.altDeg.toFixed(1)}°, ${direction}</span>`
        : "<span>밝은 별 후보입니다.</span>";
      return (
        `<div class="hint-item">`
        + `<strong>${index + 1}</strong>`
        + `${position}`
        + `${level >= 1 ? identity : ""}`
        + `</div>`
      );
    }).join("");

    const messierHintHtml = state.problem.messierObjects.map((object) => {
      const name = object.nameKo || object.nameEn || object.type;
      const answer = level >= 3 ? `${object.id} · ${name}` : `${object.type}`;
      return `<div class="hint-item"><strong>${object.label}</strong><span>${escapeHtml(answer)}</span></div>`;
    }).join("");

    const numberedHintHtml = state.problem.numberedStars.map((star) => {
      const answer = level >= 3
        ? `${star.info.nameKo} · ${star.info.bayerUnicode}`
        : `Vmag ${star.mag.toFixed(2)}, ${azimuthName(star.azDeg)}`;
      return `<div class="hint-item"><strong>Number ${star.label}</strong><span>${escapeHtml(answer)}</span></div>`;
    }).join("");

    const numericHintHtml = level >= 3
      ? [
        `<div class="hint-item"><strong>Latitude</strong><span>${LATITUDE_DEG.toFixed(2)} deg</span></div>`,
        `<div class="hint-item"><strong>LST</strong><span>${formatHours(state.problem.lstHours)}</span></div>`,
        `<div class="hint-item"><strong>Longitude</strong><span>${LONGITUDE_DEG.toFixed(2)} deg</span></div>`,
      ].join("")
      : [
        `<div class="hint-item"><strong>Latitude</strong><span>Use the altitude pattern around the pole and horizon.</span></div>`,
        `<div class="hint-item"><strong>LST</strong><span>Reference star RA is shown as ${formatRa(state.problem.referenceStar.ra)}.</span></div>`,
        `<div class="hint-item"><strong>Longitude</strong><span>Use the chart date and your estimated LST.</span></div>`,
      ].join("");

    hints.innerHTML = missingHintHtml + messierHintHtml + numberedHintHtml + numericHintHtml;
  }

  function missingAnswerInputs() {
    return Array.from(document.querySelectorAll("#missing-star-inputs input"));
  }

  function messierAnswerInputs() {
    return Array.from(document.querySelectorAll("#messier-inputs input"));
  }

  function numberedAnswerInputs() {
    return Array.from(document.querySelectorAll("#numbered-star-inputs input"));
  }

  function numericInputs() {
    return [
      document.getElementById("latitude-answer"),
      document.getElementById("lst-answer"),
      document.getElementById("longitude-answer"),
    ].filter(Boolean);
  }

  function drawChart() {
    if (!state.problem || !state.canvas || !state.ctx) {
      return;
    }

    const canvas = state.canvas;
    const ctx = state.ctx;
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(320, Math.floor(Math.min(rect.width || 960, rect.height || rect.width || 960)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.44;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fbfbf7";
    ctx.fillRect(0, 0, size, size);

    drawGrid(ctx, cx, cy, radius);
    drawStars(ctx, cx, cy, radius);
    drawMessier(ctx, cx, cy, radius);
    drawNumberedStars(ctx, cx, cy, radius);
    drawReferenceStar(ctx, cx, cy, radius);
    if (state.showSolution) {
      drawMissingStars(ctx, cx, cy, radius);
    }
    drawFrameLabels(ctx, cx, cy, radius);
  }

  function drawGrid(ctx, cx, cy, radius) {
    ctx.save();
    ctx.strokeStyle = "#d5d7d0";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach((fraction) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * fraction, 0, Math.PI * 2);
      ctx.stroke();
    });

    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.sin(angle), cy - radius * Math.cos(angle));
      ctx.stroke();
    }

    ctx.strokeStyle = "#171a18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawStars(ctx, cx, cy, radius) {
    const missingIds = new Set(state.problem.missingStars.map((star) => star.id));
    ctx.save();
    state.problem.stars.forEach((star) => {
      if (missingIds.has(star.id)) {
        return;
      }
      const point = project(star, cx, cy, radius);
      const starRadius = canvasStarRadius(star.mag);
      if (starRadius <= 0) {
        return;
      }
      ctx.beginPath();
      ctx.fillStyle = "#171a18";
      ctx.arc(point.x, point.y, starRadius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawMissingStars(ctx, cx, cy, radius) {
    ctx.save();
    state.problem.missingStars.forEach((star, index) => {
      const point = project(star, cx, cy, radius);
      const starRadius = Math.max(4, canvasStarRadius(star.mag) + 1.5);
      ctx.beginPath();
      ctx.fillStyle = "#1f7a54";
      ctx.arc(point.x, point.y, starRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "#9a2f2f";
      ctx.lineWidth = 2;
      ctx.arc(point.x, point.y, starRadius + 7, 0, Math.PI * 2);
      ctx.stroke();

      drawRedLabel(ctx, String(index + 1), point.x + 15, point.y - 12);
    });
    ctx.restore();
  }

  function drawNumberedStars(ctx, cx, cy, radius) {
    ctx.save();
    state.problem.numberedStars.forEach((star, index) => {
      const point = project(star, cx, cy, radius);
      const offset = labelOffset(index);
      drawRedLabel(ctx, star.label, point.x + offset.x, point.y + offset.y);
    });
    ctx.restore();
  }

  function drawReferenceStar(ctx, cx, cy, radius) {
    const star = state.problem.referenceStar;
    if (!star) {
      return;
    }
    const point = project(star, cx, cy, radius);
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "#245f73";
    ctx.lineWidth = 2;
    ctx.arc(point.x, point.y, Math.max(8, canvasStarRadius(star.mag) + 7), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#245f73";
    ctx.font = "700 14px Trebuchet MS, Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", point.x + 16, point.y - 14);
    ctx.restore();
  }

  function drawMessier(ctx, cx, cy, radius) {
    ctx.save();
    state.problem.messierObjects.forEach((object, index) => {
      const point = project(object, cx, cy, radius);
      drawDsoSymbol(ctx, object.type, point.x, point.y);
      const offset = labelOffset(index);
      drawRedLabel(ctx, object.label, point.x + offset.x, point.y + offset.y);
    });
    ctx.restore();
  }

  function drawFrameLabels(ctx, cx, cy, radius) {
    ctx.save();
    ctx.fillStyle = "#5e645f";
    ctx.font = "700 13px Trebuchet MS, Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([label, physicalAzDeg]) => {
      const displayAz = degToRad(physicalAzDeg) + state.problem.rotation;
      ctx.fillText(label, cx + horizontalMirrorSign() * (radius + 20) * Math.sin(displayAz), cy - (radius + 20) * Math.cos(displayAz));
    });
    ctx.restore();
  }

  function drawRedLabel(ctx, text, x, y) {
    ctx.save();
    ctx.fillStyle = "#9a2f2f";
    ctx.font = "700 14px Trebuchet MS, Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawDsoSymbol(ctx, type, x, y) {
    const code = String(type || "").toUpperCase();
    ctx.save();
    ctx.strokeStyle = "#171a18";
    ctx.lineWidth = 1.5;
    if (code === "OC" || code === "SC") {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, code === "OC" ? 7 : 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (code === "GC") {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();
    } else if (code === "GAL") {
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 5, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x - 6, y - 6, 12, 12);
    }
    ctx.restore();
  }

  function project(object, cx, cy, radius) {
    const r = projectionRadius(degToRad(object.altDeg));
    return {
      x: cx + horizontalMirrorSign() * radius * r * Math.sin(degToRad(object.azDeg)),
      y: cy - radius * r * Math.cos(degToRad(object.azDeg)),
    };
  }

  function horizontalMirrorSign() {
    return MIRROR_HORIZONTAL ? -1 : 1;
  }

  function canvasStarRadius(magnitude) {
    if (magnitude <= 0) return 3.5;
    if (magnitude <= 1) return 3.1;
    if (magnitude <= 1.5) return 2.8;
    if (magnitude <= 2) return 2.45;
    if (magnitude <= 2.5) return 2.1;
    if (magnitude <= 3) return 1.75;
    if (magnitude <= 3.5) return 1.35;
    if (magnitude <= 4) return 1.0;
    if (magnitude <= 4.5) return 0.75;
    if (magnitude <= 5) return 0.55;
    return 0;
  }

  function notebookProjectionRadius(altitudeRad) {
    return 2 * ((Math.PI / 2) - altitudeRad) / Math.PI;
  }

  function projectionRadius(altitudeRad) {
    return notebookProjectionRadius(altitudeRad);
  }

  function horizontalCoordinates(raDeg, decDeg, latitudeDeg, lstHours, rotation) {
    const ra = degToRad(raDeg);
    const dec = degToRad(decDeg);
    const lat = degToRad(latitudeDeg);
    const lst = lstHours * Math.PI / 12;
    const hourAngle = lst - ra;
    const sinAlt = (
      Math.sin(lat) * Math.sin(dec)
      + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
    );
    const alt = Math.asin(clamp(sinAlt, -1, 1));
    const cosAlt = Math.cos(alt);
    let az = 0;
    if (Math.abs(cosAlt) > 1e-12) {
      const sinAz = -Math.cos(dec) * Math.sin(hourAngle) / cosAlt;
      const cosAz = (Math.sin(dec) - Math.sin(lat) * Math.sin(alt)) / (Math.cos(lat) * cosAlt);
      az = positiveMod(Math.atan2(sinAz, cosAz), Math.PI * 2);
    }
    return {
      altDeg: radToDeg(alt),
      azDeg: radToDeg(positiveMod(az + rotation, Math.PI * 2)),
    };
  }

  function utcToLstHours(date, longitudeDeg) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525.0;
    const gmstDeg = positiveMod(
      280.46061837
      + 360.98564736629 * (jd - 2451545.0)
      + 0.000387933 * t * t
      - (t * t * t) / 38710000.0,
      360,
    );
    return positiveMod(gmstDeg + longitudeDeg, 360) / 15;
  }

  function dateKeyToUtcDate(dateKey, hourUtc) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, hourUtc, 0, 0));
  }

  function kstDateKey(now = new Date()) {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }
    const tick = () => {
      if (!document.getElementById("missing-star-root")) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        return;
      }

      const now = new Date();
      const kst = new Date(now.getTime() + KST_OFFSET_MS);
      const nextKstMidnightUtcMs = Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate() + 1,
        0,
        0,
        0,
      ) - KST_OFFSET_MS;
      const remaining = Math.max(0, nextKstMidnightUtcMs - now.getTime());
      document.getElementById("missing-star-countdown").textContent = formatDuration(remaining);

      const currentKey = kstDateKey(now);
      if (state.problem && currentKey !== state.problem.dateKey) {
        state.showSolution = false;
        state.revealed = false;
        state.hintLevel = 0;
        generateTodayProblem();
        renderInputs();
        renderProblemInfo();
        updateHints();
        drawChart();
      }
    };
    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function pickMany(items, count, rng) {
    if (items.length < count) {
      return items.slice();
    }
    const pool = items.slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      const index = Math.floor(rng() * pool.length);
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  }

  function labelOffset(index) {
    const offsets = [
      { x: 9, y: -10 },
      { x: 10, y: 13 },
      { x: -14, y: -10 },
      { x: -14, y: 13 },
      { x: 15, y: 0 },
      { x: -17, y: 0 },
    ];
    return offsets[index % offsets.length];
  }

  function alphabeticLabel(index) {
    let n = index + 1;
    let label = "";
    while (n > 0) {
      n -= 1;
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    return label;
  }

  function azimuthName(deg) {
    const names = ["북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽"];
    return names[Math.round(positiveMod(deg, 360) / 45) % 8];
  }

  function formatHours(hours) {
    const totalSeconds = Math.round(positiveMod(hours, 24) * 3600);
    const h = Math.floor(totalSeconds / 3600) % 24;
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  }

  function formatRa(raDeg) {
    return formatHours(raDeg / 15);
  }

  function formatUtcDateTime(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute} UTC`;
  }

  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function parseNumber(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/[＋]/g, "+")
      .replace(/[−–—]/g, "-")
      .replace(/,/g, ".")
      .replace(/[^0-9.+-]/g, "");
    if (!normalized) {
      return NaN;
    }
    return Number.parseFloat(normalized);
  }

  function parseHours(value) {
    const text = String(value || "").trim().toLowerCase();
    const clock = text.match(/([+-]?\d+(?:[.,]\d+)?)\s*(?:h|:)\s*(\d+(?:[.,]\d+)?)/);
    if (clock) {
      return Number.parseFloat(clock[1].replace(",", ".")) + Number.parseFloat(clock[2].replace(",", ".")) / 60;
    }
    return parseNumber(text);
  }

  function parseSignedAngle(value, kind) {
    const text = String(value || "").trim().toUpperCase();
    const parsed = parseNumber(text);
    if (!Number.isFinite(parsed)) {
      return NaN;
    }

    if (kind === "longitude") {
      if (text.includes("W")) return -Math.abs(parsed);
      if (text.includes("E")) return Math.abs(parsed);
    } else {
      if (text.includes("S")) return -Math.abs(parsed);
      if (text.includes("N")) return Math.abs(parsed);
    }
    return parsed;
  }

  function hourDistance(a, b) {
    const delta = Math.abs(positiveMod(a - b + 12, 24) - 12);
    return delta;
  }

  function angularDistanceDeg(a, b) {
    return Math.abs(positiveMod(a - b + 180, 360) - 180);
  }

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function radToDeg(rad) {
    return rad * 180 / Math.PI;
  }

  function positiveMod(value, mod) {
    return ((value % mod) + mod) % mod;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.addEventListener("DOMContentLoaded", initMissingStarPage);
}());
