import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  createRng,
  getAccuracyPct,
  getAvgReactionMs,
  getComboMultiplier,
  getDailySeed,
  handlePointerHit,
  leaderboardToCsv,
  spawnPulseGate,
  spawnTarget,
  stepGame,
  triggerPulseSync,
  updateLeaderboard,
} from "../engine.mjs";

test("deterministic daily seed generates identical target sequences", () => {
  const seed = getDailySeed(new Date("2026-11-26T00:00:00Z"));
  assert.equal(seed, "SKYPULSE-2026-11-26");

  const r1 = createRng(seed);
  const r2 = createRng(seed);
  const s1 = createInitialState({ mode: "daily", seed });
  const s2 = createInitialState({ mode: "daily", seed });
  const t1 = spawnTarget(s1, r1, 800, 480);
  const t2 = spawnTarget(s2, r2, 800, 480);
  assert.deepEqual(t1, t2);
});

test("flick hits build combo multiplier and decoy hits deduct score", () => {
  const state = createInitialState({ mode: "arcade", seed: "TEST-1" });
  state.status = "running";
  state.targets.push({ id: 1, kind: "flick", x: 200, y: 200, radius: 30, ageMs: 180, ttlMs: 2000 });
  const res = handlePointerHit(state, 205, 198);
  assert.equal(res.hit, true);
  assert.equal(res.grade, "PERFECT");
  assert.equal(res.points, 250);
  assert.equal(state.combo, 1);
  assert.equal(getAvgReactionMs(state), 180);

  state.targets.push({ id: 2, kind: "decoy", x: 300, y: 200, radius: 24, ageMs: 100, ttlMs: 2000 });
  const decoyRes = handlePointerHit(state, 300, 200);
  assert.equal(decoyRes.kind, "decoy");
  assert.equal(state.score, 100);
  assert.equal(state.combo, 0);
  assert.equal(getAccuracyPct(state), 50);
});

test("pulse sync in window grants overdrive bonus time and points", () => {
  const state = createInitialState({ mode: "arcade", seed: "TEST-2" });
  state.status = "running";
  state.timeLeftMs = 30_000;
  spawnPulseGate(state);
  state.pulseGate.progress = 0.78;
  const res = triggerPulseSync(state, 400, 240);
  assert.equal(res.synced, true);
  assert.equal(state.timeLeftMs, 32_000);
  assert.equal(state.overdriveMs, 5_000);
  assert.equal(state.pulseClears, 1);
  assert.ok(res.points >= 400);
});

test("stepGame expires round at 0ms and leaderboard CSV formats cleanly", () => {
  const state = createInitialState({ mode: "arcade", seed: "TEST-3" });
  state.status = "running";
  state.timeLeftMs = 50;
  const rng = createRng("TEST-3");
  const events = stepGame(state, 60, rng, 800, 480);
  assert.equal(state.status, "finished");
  assert.ok(events.some((e) => e.type === "finished"));
  assert.equal(getComboMultiplier(28), 8);

  const lb = updateLeaderboard([], {
    tag: "C9X",
    mode: "arcade",
    score: 4850,
    accuracy: 94.2,
    maxCombo: 19,
    avgReactionMs: 312,
    seed: "TEST-3",
    timestamp: "2026-11-26T01:35:00Z",
  });
  const csv = leaderboardToCsv(lb);
  assert.ok(csv.includes("1,C9X,arcade,4850,94.2,19,312,TEST-3"));
});
