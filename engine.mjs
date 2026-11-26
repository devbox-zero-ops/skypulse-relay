// SkyPulse Relay — Pure Deterministic Esports Booth Mini-Game Engine
// Zero runtime dependencies; works in both browser ES modules and Node.js tests.

export const GAME_DURATION_MS = 60_000;
export const MAX_COMBO_MULT = 8;
export const OVERDRIVE_BONUS_MS = 2_000;

export function hashSeed(seedStr) {
  let h = 2166136261 >>> 0;
  const s = String(seedStr || "SKYPULSE");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seedStr) {
  let a = hashSeed(seedStr);
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDailySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `SKYPULSE-${y}-${m}-${d}`;
}

export function getComboMultiplier(combo) {
  if (combo >= 28) return 8;
  if (combo >= 20) return 6;
  if (combo >= 14) return 4;
  if (combo >= 8) return 3;
  if (combo >= 4) return 2;
  return 1;
}

export function gradeHit(lifeRatio) {
  // lifeRatio: 0 (just spawned) -> 1 (about to expire)
  // Best score when clicked quickly (< 0.42) or near peak sync
  if (lifeRatio <= 0.42) return { grade: "PERFECT", basePoints: 250 };
  if (lifeRatio <= 0.72) return { grade: "GREAT", basePoints: 150 };
  return { grade: "HIT", basePoints: 80 };
}

export function createInitialState({ mode = "arcade", seed = null, playerTag = "ACE" } = {}) {
  const effectiveSeed =
    mode === "daily" ? seed || getDailySeed() : seed || `ARCADE-${Date.now()}`;
  return {
    mode, // "arcade" | "daily" | "hotseat"
    seed: effectiveSeed,
    playerTag: String(playerTag || "ACE").toUpperCase().slice(0, 3),
    status: "idle", // "idle" | "running" | "finished"
    timeLeftMs: GAME_DURATION_MS,
    elapsedMs: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    perfects: 0,
    misses: 0,
    decoyHits: 0,
    pulseClears: 0,
    reactionSumMs: 0,
    targets: [],
    nextTargetId: 1,
    spawnCooldownMs: 350,
    pulseGate: null, // { progress: 0..1, speed, syncMin, syncMax, active }
    pulseCooldownMs: 6_500,
    overdriveMs: 0,
    floatingTexts: [],
    ripples: [],
  };
}

export function spawnTarget(state, rng, arenaWidth, arenaHeight) {
  const pad = 64;
  const w = Math.max(240, arenaWidth);
  const h = Math.max(200, arenaHeight);

  // Escalate difficulty smoothly over 60 seconds
  const progress = Math.min(1, state.elapsedMs / GAME_DURATION_MS);
  const isDecoy = rng() < 0.16 + progress * 0.10;
  const isBonus = !isDecoy && rng() < 0.14;
  const radius = isDecoy ? 24 : isBonus ? 22 : Math.round(30 - progress * 6);
  const ttlMs = isDecoy
    ? Math.round(2300 - progress * 500)
    : isBonus
      ? Math.round(1650 - progress * 350)
      : Math.round(2200 - progress * 650);

  // Try up to 8 positions to avoid overlapping existing targets
  let x = pad + rng() * (w - pad * 2);
  let y = pad + rng() * (h - pad * 2);
  for (let attempt = 0; attempt < 8; attempt++) {
    const cx = pad + rng() * (w - pad * 2);
    const cy = pad + rng() * (h - pad * 2);
    const overlaps = state.targets.some((t) => {
      const dx = t.x - cx;
      const dy = t.y - cy;
      return Math.hypot(dx, dy) < t.radius + radius + 18;
    });
    if (!overlaps) {
      x = cx;
      y = cy;
      break;
    }
  }

  const target = {
    id: state.nextTargetId++,
    kind: isDecoy ? "decoy" : isBonus ? "bonus" : "flick",
    x,
    y,
    radius,
    ageMs: 0,
    ttlMs,
  };
  state.targets.push(target);
  return target;
}

export function spawnPulseGate(state) {
  state.pulseGate = {
    active: true,
    progress: 0, // 0 -> 1
    durationMs: 1850,
    syncMin: 0.68,
    syncMax: 0.90,
  };
}

export function stepGame(state, dtMs, rng, arenaWidth, arenaHeight) {
  if (state.status !== "running") return [];
  const events = [];
  const dt = Math.min(100, Math.max(0, dtMs));
  state.elapsedMs += dt;
  state.timeLeftMs = Math.max(0, state.timeLeftMs - dt);
  if (state.overdriveMs > 0) {
    state.overdriveMs = Math.max(0, state.overdriveMs - dt);
  }

  // Update targets
  const kept = [];
  for (const t of state.targets) {
    t.ageMs += dt;
    if (t.ageMs >= t.ttlMs) {
      if (t.kind !== "decoy") {
        state.misses += 1;
        state.combo = 0;
        events.push({ type: "miss", x: t.x, y: t.y });
      }
    } else {
      kept.push(t);
    }
  }
  state.targets = kept;

  // Spawn new targets
  const progress = Math.min(1, state.elapsedMs / GAME_DURATION_MS);
  const maxActive = progress > 0.6 ? 5 : progress > 0.25 ? 4 : 3;
  state.spawnCooldownMs -= dt;
  if (state.spawnCooldownMs <= 0 && state.targets.length < maxActive) {
    spawnTarget(state, rng, arenaWidth, arenaHeight);
    state.spawnCooldownMs = Math.round(740 - progress * 290 + rng() * 140);
  }

  // Update pulse gate
  if (state.pulseGate && state.pulseGate.active) {
    state.pulseGate.progress += dt / state.pulseGate.durationMs;
    if (state.pulseGate.progress >= 1) {
      state.pulseGate = null;
      state.pulseCooldownMs = 8_000;
      events.push({ type: "pulse_expired" });
    }
  } else {
    state.pulseCooldownMs -= dt;
    if (state.pulseCooldownMs <= 0 && state.timeLeftMs > 4_000) {
      spawnPulseGate(state);
      events.push({ type: "pulse_spawned" });
    }
  }

  // Update floating texts & ripples
  state.floatingTexts = state.floatingTexts
    .map((f) => ({ ...f, ageMs: f.ageMs + dt, y: f.y - dt * 0.045 }))
    .filter((f) => f.ageMs < 750);
  state.ripples = state.ripples
    .map((r) => ({ ...r, ageMs: r.ageMs + dt }))
    .filter((r) => r.ageMs < 420);

  if (state.timeLeftMs <= 0) {
    state.status = "finished";
    state.targets = [];
    state.pulseGate = null;
    events.push({ type: "finished", score: state.score });
  }
  return events;
}

export function handlePointerHit(state, x, y) {
  if (state.status !== "running") return { hit: false, kind: "none", points: 0 };

  // Check newest target first (topmost drawn)
  for (let i = state.targets.length - 1; i >= 0; i--) {
    const t = state.targets[i];
    const dist = Math.hypot(t.x - x, t.y - y);
    if (dist <= t.radius + 8) {
      state.targets.splice(i, 1);
      if (t.kind === "decoy") {
        state.decoyHits += 1;
        state.combo = 0;
        const penalty = -150;
        state.score = Math.max(0, state.score + penalty);
        state.floatingTexts.push({ text: "DECOY -150", x: t.x, y: t.y, color: "#ff4d6d", ageMs: 0 });
        state.ripples.push({ x: t.x, y: t.y, color: "#ff4d6d", ageMs: 0 });
        return { hit: true, kind: "decoy", points: penalty };
      }

      const lifeRatio = Math.min(1, t.ageMs / t.ttlMs);
      const { grade, basePoints } = gradeHit(lifeRatio);
      state.hits += 1;
      state.reactionSumMs += t.ageMs;
      if (grade === "PERFECT") state.perfects += 1;
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;

      const mult = getComboMultiplier(state.combo);
      const bonusFactor = t.kind === "bonus" ? 1.6 : 1;
      const overdriveFactor = state.overdriveMs > 0 ? 1.25 : 1;
      const points = Math.round(basePoints * mult * bonusFactor * overdriveFactor);
      state.score += points;

      const label = `${grade} +${points}`;
      const color = t.kind === "bonus" ? "#ff318c" : grade === "PERFECT" ? "#00aeef" : "#7cf7ff";
      state.floatingTexts.push({ text: label, x: t.x, y: t.y, color, ageMs: 0 });
      state.ripples.push({ x: t.x, y: t.y, color, ageMs: 0 });
      return { hit: true, kind: t.kind, grade, points, mult };
    }
  }

  // Whiff click resets combo and logs miss
  state.misses += 1;
  state.combo = 0;
  state.floatingTexts.push({ text: "MISS", x, y, color: "#94a3b8", ageMs: 0 });
  return { hit: false, kind: "miss", points: 0 };
}

export function triggerPulseSync(state, centerX = 0, centerY = 0) {
  if (state.status !== "running" || !state.pulseGate || !state.pulseGate.active) {
    return { synced: false, points: 0 };
  }
  const p = state.pulseGate.progress;
  const inWindow = p >= state.pulseGate.syncMin && p <= state.pulseGate.syncMax;
  state.pulseGate = null;
  state.pulseCooldownMs = 8_500;

  if (inWindow) {
    state.pulseClears += 1;
    state.combo += 2;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    const mult = getComboMultiplier(state.combo);
    const points = 400 * mult;
    state.score += points;
    state.timeLeftMs = Math.min(GAME_DURATION_MS, state.timeLeftMs + OVERDRIVE_BONUS_MS);
    state.overdriveMs = 5_000;
    state.floatingTexts.push({
      text: `PULSE SYNC +${points} (+2s)`,
      x: centerX,
      y: centerY,
      color: "#00aeef",
      ageMs: 0,
    });
    state.ripples.push({ x: centerX, y: centerY, color: "#ff318c", ageMs: 0 });
    return { synced: true, points, bonusMs: OVERDRIVE_BONUS_MS };
  }

  state.combo = 0;
  state.floatingTexts.push({
    text: "EARLY / LATE",
    x: centerX,
    y: centerY,
    color: "#f59e0b",
    ageMs: 0,
  });
  return { synced: false, points: 0 };
}

export function getAccuracyPct(state) {
  const total = state.hits + state.misses + state.decoyHits;
  if (total === 0) return 100;
  return Math.round((state.hits / total) * 1000) / 10;
}

export function getAvgReactionMs(state) {
  if (state.hits === 0) return 0;
  return Math.round(state.reactionSumMs / state.hits);
}

export function updateLeaderboard(entries, entry, maxEntries = 10) {
  const next = [...entries, entry]
    .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy)
    .slice(0, maxEntries);
  return next;
}

export function leaderboardToCsv(entries) {
  const header = "rank,tag,mode,score,accuracy_pct,max_combo,avg_reaction_ms,seed,timestamp";
  const rows = entries.map((e, i) =>
    [
      i + 1,
      e.tag,
      e.mode,
      e.score,
      e.accuracy,
      e.maxCombo,
      e.avgReactionMs,
      e.seed,
      e.timestamp,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
