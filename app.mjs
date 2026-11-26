import {
  GAME_DURATION_MS,
  createInitialState,
  createRng,
  getAccuracyPct,
  getAvgReactionMs,
  getComboMultiplier,
  getDailySeed,
  handlePointerHit,
  leaderboardToCsv,
  stepGame,
  triggerPulseSync,
  updateLeaderboard,
} from "./engine.mjs";

const LB_KEY = "skypulse_relay_lb_v1";
const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");

const hudScore = document.getElementById("hudScore");
const hudCombo = document.getElementById("hudCombo");
const hudAcc = document.getElementById("hudAcc");
const hudReact = document.getElementById("hudReact");
const hudTime = document.getElementById("hudTime");
const timerBar = document.getElementById("timerBar");
const overlay = document.getElementById("overlay");
const overlayBadge = document.getElementById("overlayBadge");
const overlayTitle = document.getElementById("overlayTitle");
const overlayDesc = document.getElementById("overlayDesc");
const hotseatBanner = document.getElementById("hotseatBanner");
const seedMeta = document.getElementById("seedMeta");
const modeSelect = document.getElementById("modeSelect");
const tagInput = document.getElementById("tagInput");
const startBtn = document.getElementById("startBtn");
const pulseBtn = document.getElementById("pulseBtn");
const restartBtn = document.getElementById("restartBtn");
const soundToggle = document.getElementById("soundToggle");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const leaderboardList = document.getElementById("leaderboardList");
const overdrivePill = document.getElementById("overdrivePill");
const rulesBtn = document.getElementById("rulesBtn");
const rulesDialog = document.getElementById("rulesDialog");

let soundEnabled = true;
let audioCtx = null;
let state = createInitialState({ mode: "arcade", seed: getDailySeed(), playerTag: "C9X" });
let rng = createRng(state.seed);
let lastFrameTs = 0;
let hotseatP1 = null;

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioCtx && typeof AudioContext !== "undefined") {
    audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq, duration = 0.08, type = "sine", gainVal = 0.12) {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(gainVal, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LB_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [
    { tag: "SKY", mode: "daily", score: 18400, accuracy: 96.4, maxCombo: 24, avgReactionMs: 285, seed: getDailySeed(), timestamp: "2026-11-26T00:00:00Z" },
    { tag: "JET", mode: "arcade", score: 14250, accuracy: 92.1, maxCombo: 18, avgReactionMs: 318, seed: "BOOTH-DEMO", timestamp: "2026-11-26T00:00:00Z" },
    { tag: "C9X", mode: "daily", score: 11800, accuracy: 89.5, maxCombo: 15, avgReactionMs: 342, seed: getDailySeed(), timestamp: "2026-11-26T00:00:00Z" },
  ];
}

function saveLeaderboard(entries) {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(entries));
  } catch {}
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  leaderboardList.replaceChildren();
  entries.forEach((e, idx) => {
    const li = document.createElement("li");
    li.className = "lb-row";
    li.innerHTML = `<span class="lb-rank">#${idx + 1}</span><span class="lb-tag"></span><span class="lb-meta"></span><span class="lb-score"></span>`;
    li.querySelector(".lb-tag").textContent = e.tag;
    li.querySelector(".lb-meta").textContent = `${e.mode} · ${e.accuracy}%`;
    li.querySelector(".lb-score").textContent = e.score.toLocaleString();
    leaderboardList.appendChild(li);
  });
}

function syncHud() {
  const mult = getComboMultiplier(state.combo);
  hudScore.textContent = state.score.toLocaleString();
  hudCombo.textContent = `${state.combo} (${mult}×)`;
  hudAcc.textContent = `${getAccuracyPct(state).toFixed(1)}%`;
  hudReact.textContent = `${getAvgReactionMs(state)} ms`;
  hudTime.textContent = `${(state.timeLeftMs / 1000).toFixed(1)}s`;
  timerBar.style.transform = `scaleX(${Math.max(0, state.timeLeftMs / GAME_DURATION_MS)})`;
  overdrivePill.hidden = state.overdriveMs <= 0;
}

function startRound() {
  const mode = modeSelect.value;
  const tag = (tagInput.value || "C9X").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3) || "C9X";
  tagInput.value = tag;

  let seed = null;
  if (mode === "daily") {
    seed = getDailySeed();
  } else if (mode === "hotseat") {
    seed = hotseatP1 ? hotseatP1.seed : `DUEL-${Date.now().toString(36).toUpperCase()}`;
  } else {
    seed = `ARCADE-${Date.now().toString(36).toUpperCase()}`;
  }

  state = createInitialState({ mode, seed, playerTag: tag });
  state.status = "running";
  rng = createRng(state.seed);
  seedMeta.textContent = `Seed: ${state.seed}`;
  overlay.hidden = true;
  hotseatBanner.hidden = true;
  lastFrameTs = performance.now();
  playTone(520, 0.1, "triangle", 0.14);
  syncHud();
}

function finishRound() {
  const acc = getAccuracyPct(state);
  const avgReact = getAvgReactionMs(state);
  const entry = {
    tag: state.playerTag,
    mode: state.mode,
    score: state.score,
    accuracy: acc,
    maxCombo: state.maxCombo,
    avgReactionMs: avgReact,
    seed: state.seed,
    timestamp: new Date().toISOString(),
  };
  const updated = updateLeaderboard(loadLeaderboard(), entry);
  saveLeaderboard(updated);
  renderLeaderboard();

  overlay.hidden = false;
  if (state.mode === "hotseat" && !hotseatP1) {
    hotseatP1 = entry;
    overlayBadge.textContent = "2P HOT-SEAT · PLAYER 1 COMPLETE";
    overlayTitle.textContent = `${entry.tag}: ${entry.score.toLocaleString()} pts`;
    overlayDesc.textContent = `Pass controls to Player 2! Same seed (${state.seed}) locked for a fair head-to-head duel.`;
    hotseatBanner.hidden = false;
    hotseatBanner.textContent = `P1 ${entry.tag} set the pace at ${entry.score.toLocaleString()} pts (${acc}% acc). Enter P2 tag & hit Start!`;
    tagInput.value = "P2X";
    startBtn.textContent = "Start Player 2 Round";
  } else if (state.mode === "hotseat" && hotseatP1) {
    const p1 = hotseatP1;
    hotseatP1 = null;
    const winner = entry.score > p1.score ? entry.tag : entry.score < p1.score ? p1.tag : "TIE";
    overlayBadge.textContent = "2P HOT-SEAT FINAL";
    overlayTitle.textContent = winner === "TIE" ? "Dead Heat Tie!" : `${winner} Wins the Booth!`;
    overlayDesc.textContent = `${p1.tag} (${p1.score.toLocaleString()}) vs ${entry.tag} (${entry.score.toLocaleString()}) on seed ${state.seed}.`;
    hotseatBanner.hidden = true;
    startBtn.textContent = "Play Again";
  } else {
    overlayBadge.textContent = "ROUND COMPLETE";
    overlayTitle.textContent = `${entry.score.toLocaleString()} pts`;
    overlayDesc.textContent = `Accuracy ${acc}% · Max Combo ${state.maxCombo} · Avg Reaction ${avgReact} ms · Pulse Syncs ${state.pulseClears}`;
    startBtn.textContent = "Play Another 60s";
  }
  playTone(660, 0.16, "triangle", 0.14);
}

function drawArena() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Subtle tactical grid
  ctx.fillStyle = state.overdriveMs > 0 ? "#0a162d" : "#060a12";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0, 174, 239, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Pulse Sync Gate
  if (state.pulseGate && state.pulseGate.active) {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.44;
    const rMin = maxR * state.pulseGate.syncMin;
    const rMax = maxR * state.pulseGate.syncMax;
    const curR = maxR * state.pulseGate.progress;

    // Target cyan sync band
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, (rMin + rMax) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 174, 239, 0.25)";
    ctx.lineWidth = rMax - rMin;
    ctx.stroke();

    // Expanding wave
    const inBand = state.pulseGate.progress >= state.pulseGate.syncMin && state.pulseGate.progress <= state.pulseGate.syncMax;
    ctx.beginPath();
    ctx.arc(cx, cy, curR, 0, Math.PI * 2);
    ctx.strokeStyle = inBand ? "#00aeef" : "#ff318c";
    ctx.lineWidth = inBand ? 5 : 3;
    ctx.stroke();
    ctx.restore();
  }

  // Ripples
  for (const rp of state.ripples) {
    const p = rp.ageMs / 420;
    ctx.save();
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, 16 + p * 44, 0, Math.PI * 2);
    ctx.strokeStyle = rp.color;
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // Targets
  for (const t of state.targets) {
    const life = Math.min(1, t.ageMs / t.ttlMs);
    const outerR = t.radius + (1 - life) * 18;
    const primary = t.kind === "decoy" ? "#ff4d6d" : t.kind === "bonus" ? "#ff318c" : "#00aeef";

    ctx.save();
    // Contracting timing ring
    ctx.beginPath();
    ctx.arc(t.x, t.y, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = primary;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Core disc
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
    ctx.fillStyle = t.kind === "decoy" ? "rgba(255, 77, 109, 0.22)" : t.kind === "bonus" ? "rgba(255, 49, 140, 0.25)" : "rgba(0, 174, 239, 0.22)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = primary;
    ctx.stroke();

    // Inner glyph
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.kind === "decoy" ? "✕" : t.kind === "bonus" ? "1.6×" : "●", t.x, t.y);
    ctx.restore();
  }

  // Floating feedback text
  for (const f of state.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - f.ageMs / 750);
    ctx.fillStyle = f.color;
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

function loop(ts) {
  if (state.status === "running") {
    const dt = ts - lastFrameTs;
    lastFrameTs = ts;
    const events = stepGame(state, dt, rng, canvas.width, canvas.height);
    for (const ev of events) {
      if (ev.type === "finished") finishRound();
    }
    syncHud();
  }
  drawArena();
  requestAnimationFrame(loop);
}

canvas.addEventListener("pointerdown", (e) => {
  if (state.status !== "running") return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  const res = handlePointerHit(state, x, y);
  if (res.kind === "decoy") {
    playTone(170, 0.14, "sawtooth", 0.14);
  } else if (res.hit) {
    playTone(460 + Math.min(state.combo, 20) * 28, 0.07, "sine", 0.12);
  } else {
    playTone(220, 0.06, "triangle", 0.07);
  }
  syncHud();
});

function doPulseSync() {
  const res = triggerPulseSync(state, canvas.width / 2, canvas.height / 2);
  if (res.synced) {
    playTone(880, 0.14, "triangle", 0.15);
  } else if (state.status === "running") {
    playTone(200, 0.08, "sawtooth", 0.08);
  }
  syncHud();
}

pulseBtn.addEventListener("click", doPulseSync);
startBtn.addEventListener("click", startRound);
restartBtn.addEventListener("click", () => {
  hotseatP1 = null;
  startRound();
});

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggle.textContent = `Sound: ${soundEnabled ? "ON" : "OFF"}`;
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
});

exportCsvBtn.addEventListener("click", () => {
  const csv = leaderboardToCsv(loadLeaderboard());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `skypulse-leaderboard-${getDailySeed()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("keydown", (e) => {
  if (rulesDialog.open) return;
  if (e.code === "Space" && state.status === "running") {
    e.preventDefault();
    doPulseSync();
  } else if (e.key === "r" || e.key === "R") {
    if (document.activeElement !== tagInput) startRound();
  }
});

// Progressive fallback for Invoker Commands & dialog closedby="any"
if (!("commandForElement" in HTMLButtonElement.prototype)) {
  rulesBtn.addEventListener("click", () => rulesDialog.showModal());
}
if (!("closedBy" in HTMLDialogElement.prototype)) {
  const outside = (e, dlg) => {
    const r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  rulesDialog.addEventListener("pointerdown", (e) => { pressedOutside = outside(e, rulesDialog); });
  rulesDialog.addEventListener("pointerup", (e) => { if (pressedOutside && outside(e, rulesDialog)) rulesDialog.close(); });
}
rulesDialog.addEventListener("close", () => { rulesDialog.returnValue = ""; });

// Expose clean hook for automated E2E verification
window.__SKYPULSE__ = {
  getState: () => state,
  triggerPulseSync: doPulseSync,
};

seedMeta.textContent = `Daily Seed: ${getDailySeed()}`;
renderLeaderboard();
syncHud();
requestAnimationFrame(loop);
