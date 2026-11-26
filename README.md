# SkyPulse Relay

A zero-dependency, 60-second esports reflex & tactical rhythm booth mini-game built for **Cloud9 x JetBrains: Sky's The Limit Hackathon 2026** (Category 3: Event Mini-Game).

## Live Playable Demo

Play directly in any desktop, tablet, or convention booth kiosk browser (zero install, zero external runtime dependencies):

- **Live URL**: `https://devbox-zero-ops.github.io/skypulse-relay/`

## Why SkyPulse Relay Fits Live Booth Events

1. **Instant 60-Second Booth Rounds**: Zero onboarding friction — fans tap **Start 60s Round** (or press `Enter`), compete immediately, and post a 3-letter arcade tag to the persisted Top 10 booth leaderboard.
2. **Three Escalating Esports Mechanics**:
   - **Flick Nodes**: Precision aim targets with contracting timing rings (`PERFECT +250`, `GREAT +150`, `HIT +80`, combo multiplier up to `×8`).
   - **Pulse Sync Gates**: Press `Space` (or tap the **Pulse Sync** button) when the expanding cyber-wave enters the cyan sync band for `+400 × combo`, `+2s` bonus time, and a 5-second `1.25×` Overdrive boost.
   - **Decoy Hazards**: Red glitch orbs that punish careless clicking (`-150`, resets combo) to reward trigger discipline.
3. **Three Booth Play Modes**:
   - **Arcade 60s**: Fresh randomized run for walk-up booth fans.
   - **Daily Seed**: Deterministic UTC date seed (`SKYPULSE-YYYY-MM-DD`) so every visitor on a convention day plays the exact same spawn sequence for fair daily prizes.
   - **2P Hot-Seat**: Back-to-back 2-player head-to-head challenge on a single kiosk screen.
4. **Offline-Ready & Zero-Asset Audio**: Procedural Web Audio API sound effects (with instant mute toggle) and pure HTML5 Canvas + ES Modules ensure instant `<50ms` load times even on crowded convention Wi-Fi.
5. **Booth Operator Tools**: One-click **Export CSV** of the local Top 10 leaderboard for tournament giveaways.

## Local Development & Verification

```bash
# Run deterministic engine unit tests (Node.js 20+)
node --test test/engine.test.mjs

# Serve locally
npx serve .
```

## Architecture

- `engine.mjs` — Pure deterministic simulation, Mulberry32 PRNG, hit grading, combo/overdrive math, and CSV export.
- `app.mjs` — High-DPI HTML5 Canvas renderer, pointer/keyboard/touch controller, Web Audio synth, and booth leaderboard persistence.
- `index.html` & `styles.css` — Accessible dark cyber-arena UI (`<dialog closedby="any">`, ARIA live stats, `prefers-reduced-motion` support).
- `test/engine.test.mjs` — Automated Node.js unit tests.

## License

MIT
