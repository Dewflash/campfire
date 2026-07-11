# Campfire — Claude context

macOS menu-bar ambience app (Electron Forge vite-ts + React 18 + Tailwind v4, Apple Silicon only). Tray popover → pick a looping 4K scene + mix ambient sound channels → fullscreen video session, desktop-wallpaper session, or audio-only. The product promise: one touch from the menu bar into a cozy session, instantly.

## Sources of truth

- `AGENTS.md` — execution rules, gates, failure protocol. Applies to ALL agents working here, Claude included.
- `PLAN-*.md` — the current ranked roadmap (execution order and dependency graph inside AGENTS.md).
- `CODEX_INSTRUCTIONS.md` — the historical v1 build spec. v1 is complete; never re-execute or edit it.
- Roles: Claude designs/specs/vets; Codex GPT 5.5 executes the plans. Don't implement plan content in a Claude session unless Kevin explicitly asks.

## Commands

- `npm start` — dev run (menu bar app; popover shows on launch).
- `npm run verify` — typecheck + lint + deep smoke. **Opens real windows and briefly plays fullscreen video** — needs a logged-in display; warn Kevin before running it.
- `npm run typecheck` / `npm run lint` — safe to run anytime.
- `bash scripts/fetch-sounds.sh` — idempotent starter-sound download.
- `bash scripts/package-release.sh` — package + stage media + DMG into `release/`.
- Env switches (implemented in `src/main.ts`): `CAMPFIRE_SMOKE_TEST=1`, `CAMPFIRE_DEEP_SMOKE=1`, `CAMPFIRE_LAUNCH_PROOF=1`, `CAMPFIRE_SHOW_POPOVER=1`, `CAMPFIRE_HIDE_POPOVER_ON_LAUNCH=1`, `CAMPFIRE_SCREENSHOT_PATH=<path>`.

## Architecture in six lines

Three renderer windows share one bundle, routed by URL hash: `#/popover` (control panel), `#/session` (fullscreen/desktop video), `#/audio` (hidden Web Audio mixer, `backgroundThrottling: false`). Main process (`src/main.ts`) owns ALL state and pushes `state:changed` snapshots; renderers are dumb views emitting intents over the typed `window.campfire` preload API. Media is served via the custom `campfire://` stream protocol from auto-discovered folders `4k loops/` and `sounds/`. Persistence: `presets.json` + `state.json` in `userData`, debounced atomic writes.

## Traps (each has sunk a change before)

- Every media filename contains spaces — `encodeURIComponent` per path segment when building `campfire://` URLs, always.
- Never `git add` media: `4k loops/`, `sounds/*`, `release/` are gitignored by design (fireplace.mp4 is 661 MB).
- All gain/opacity changes ramp (`linearRampToValueAtTime` / CSS transitions) — an instant snap is a bug here, not a simplification.
- No new runtime dependencies (React + react-dom only); icons are hand-inlined SVGs in `src/icons.tsx`.
- `simpleFullScreen` (not `fullscreen`) for session windows; `autoplay-policy` switch and the protocol's `stream: true` are load-bearing — see §8 of CODEX_INSTRUCTIONS.md for the full trap list.
- IPC channel names are a stable contract (`src/types.ts` / `src/preload.ts`): extend payloads, never rename channels.
