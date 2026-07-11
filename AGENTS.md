# Campfire — agent operating manual

You are working on **Campfire**, a macOS menu-bar ambience app (Electron Forge + React 18 + Tailwind v4). The v1 build spec is `CODEX_INSTRUCTIONS.md` (historical — v1 is complete; do not re-execute or modify it). The current roadmap is the `PLAN-*.md` files at repo root. There is no human reviewer between plans: **the gates below are the review.** Follow them exactly.

## Step 0 (first session only)

If the `PLAN-*.md` files, `AGENTS.md`, or other docs are untracked, commit them first: `docs: add execution roadmap`.

## Execution order

One plan per work session. Complete a plan fully — including its acceptance criteria — and commit before starting the next.

1. `PLAN-instant-session-start.md`
2. `PLAN-one-touch-play.md`
3. `PLAN-engine-bugfix-batch.md`
4. `PLAN-desktop-ambience-mode.md` — **depends on plan 1; never attempt before it**
5. `PLAN-release-hardening.md`
6. `PLAN-final-polish.md` — always last; produces the release QA record

Plans 2, 3, 5 are independent of each other; if one is blocked, record the blocker (see failure protocol) and continue with the next independent plan. Plan 6 requires all unblocked plans done.

## Hard gates (after EVERY plan, no exceptions)

```bash
npm run verify
```

This runs `typecheck` + `lint` + the deep smoke test and must exit 0. Notes:

- The smoke test launches the real GUI (windows appear, a video plays briefly). It needs a logged-in macOS session with a display. Never run it headless; never mark it "skipped".
- The smoke prints `CAMPFIRE_SMOKE_RESULT {...json...}` — every field must be `true`. If a plan legitimately changes smoke semantics, the plan says exactly which assertion to change; do not weaken assertions on your own.
- Then run the plan's own **Acceptance criteria** section, every item, manually.
- Commit with the plan's suggested commit message. Never `git add` media (`4k loops/`, `sounds/`, `release/` are gitignored — keep it that way).

## Failure protocol

If a gate fails and the fix is not clearly within the current plan's scope:

1. `git checkout .` / revert to the last green commit — never leave a half-landed plan.
2. Append the blocker to a `BLOCKERS.md` at repo root: plan name, exact failing command, full error output, what you tried.
3. Move on only to a plan that does not depend on the blocked one.

Plan 4 additionally has a Step 0 feasibility probe with an explicit STOP condition — obey it literally.

## House rules

- **No new runtime dependencies.** React + react-dom only. No howler, no zustand, no electron-store, no icon packages (icons are inline SVG in `src/icons.tsx`).
- Main process owns all state; renderers are dumb views (existing architecture — keep it).
- Every audio/video volume change ramps; never snap a gain or opacity instantly.
- All media URLs go through the `campfire://` protocol; every filename contains spaces — `encodeURIComponent` per path segment, always.
- IPC channel names are a stable contract (`src/preload.ts` / `src/types.ts`); extend payloads, don't rename channels.
- Styling: Tailwind stone palette + amber-400 accent, generous rounding, `transition-all duration-200`. Match what's already in `src/renderer.tsx`.
- TypeScript must stay warning-free under the existing eslint config; match the file's existing code style exactly.
- Useful env switches (already implemented in `src/main.ts`): `CAMPFIRE_SMOKE_TEST=1`, `CAMPFIRE_DEEP_SMOKE=1`, `CAMPFIRE_LAUNCH_PROOF=1`, `CAMPFIRE_SHOW_POPOVER=1`, `CAMPFIRE_HIDE_POPOVER_ON_LAUNCH=1`, `CAMPFIRE_SCREENSHOT_PATH=<path>`.

## Definition of done (whole engagement)

- Plans 1–6 committed, `npm run verify` green at HEAD.
- `RELEASE-QA.md` (produced by plan 6) committed with every item PASS, or a FAIL explicitly explained in `BLOCKERS.md`.
- `release/Campfire-<version>.dmg` built by `scripts/package-release.sh` from the final commit, install-tested per plan 6.
- Git tag `v<version>` on the final commit.
