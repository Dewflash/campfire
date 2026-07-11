# PLAN: Final polish + self-verified release (rank 6 — always last)

**Execution order:** run only after every other unblocked plan is committed and green. This plan replaces the human vetting pass: its output is a committed QA record.
**Effort:** ~3 hours. **Files touched:** `src/main.ts`, `README.md` (new), `RELEASE-QA.md` (new), `package.json`. Nothing else.

## Goal

Four things: (1) fix the last known rough edge — quitting while playing cuts audio with an audible pop; (2) write the README the repo has never had; (3) bump the version and cut a release DMG; (4) run a full manual QA sweep and commit the results as `RELEASE-QA.md`, so the release is verified even though no reviewer will look at it afterwards.

## Step-by-step

### Step 1 — `src/main.ts`: fade out on quit

Quitting from the tray while anything plays currently hard-kills the audio window mid-waveform (audible pop). Replace the **entire** `before-quit` handler with the version below (this supersedes the handler from PLAN-engine-bugfix-batch fix 6 — it includes that fix's lastSession capture and unconditional writes):

```ts
let quitFadeDone = false;

app.on('before-quit', (event) => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (mode !== 'stopped' && currentSceneId) {
    lastSession = { sceneId: currentSceneId, mix: { ...currentMix }, mode };
  }
  if (presetsWriteTimer) {
    clearTimeout(presetsWriteTimer);
  }
  if (stateWriteTimer) {
    clearTimeout(stateWriteTimer);
  }
  writeJsonAtomic(presetsPath(), presets);
  writeJsonAtomic(statePath(), { lastSession, settings } satisfies PersistedState);

  if (!quitFadeDone && mode !== 'stopped' && audioWindow && !audioWindow.isDestroyed()) {
    quitFadeDone = true;
    event.preventDefault();
    audioWindow.webContents.send('audio:fadeOutAndStop', { durationMs: 150 });
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      sessionWindow.webContents.send('video:volume', { value: 0 });
    }
    setTimeout(() => app.quit(), 220);
  }
});
```

Declare `quitFadeDone` at module level next to `isQuitting` (not inside the handler).

**Traps:**
- `isQuitting = true` must stay the first line — window `close` handlers consult it to allow teardown.
- The re-entrant `app.quit()` fires `before-quit` again; `quitFadeDone` makes the second pass fall through to a real quit. The duplicate JSON writes on the second pass are atomic and harmless — do not "optimize" them away.
- If the audio window is already gone, the handler must not `preventDefault` (the `&& audioWindow && !audioWindow.isDestroyed()` guard) or the app can never quit.
- 220 ms > the 150 ms fade + one frame; do not raise it above ~400 ms or quitting feels broken.

### Step 2 — `README.md` (new, repo root)

Write it with exactly these sections, factual and terse (no marketing fluff, no badges, no screenshots):

1. **Campfire** — one paragraph: macOS menu-bar ambience app; tray popover → pick a looping 4K scene, mix ambient sound channels, start a fullscreen (or desktop-wallpaper, if plan 4 landed) session or audio-only. Apple Silicon, latest macOS.
2. **Requirements** — macOS on Apple Silicon, Node 20+, npm.
3. **Media setup** — videos go in `4k loops/` as `<name>.mp4` plus thumbnail `pic <name>.png` (auto-discovered, spaces fine, `.mov` ignored); sounds are fetched with `bash scripts/fetch-sounds.sh` or any `.mp3/.m4a/.wav/.ogg` dropped into `sounds/`. Media is gitignored by design (fireplace.mp4 is 661 MB).
4. **Develop** — `npm install`, `npm start`. Mention `⌥⌘C` global hotkey, media keys, tray right-click menu.
5. **Verify** — `npm run verify` (typecheck + lint + deep GUI smoke; opens real windows, needs a display). Individual pieces: `npm run typecheck`, `npm run lint`, `CAMPFIRE_DEEP_SMOKE=1 npm run smoke`.
6. **Release** — `bash scripts/package-release.sh` → `release/Campfire-<version>.dmg`; ad-hoc signed, not notarized, so first launch on another Mac needs right-click → Open.
7. **Architecture** — ≤10 lines: three renderer windows off one bundle routed by URL hash (`#/popover`, `#/session`, `#/audio`); main process owns all state and pushes `state:changed` snapshots; media served via the custom `campfire://` stream protocol; persistence = `presets.json` + `state.json` in `app.getPath('userData')`, written atomically and debounced.

Use the actual current behavior of the code you are shipping — if a feature from an earlier plan was blocked (see `BLOCKERS.md`), do not document it.

### Step 3 — version bump

In `package.json`, change `"version": "1.0.0"` to `"version": "1.1.0"`. (`scripts/package-release.sh` derives the DMG name from this — no other file mentions the version.)

### Step 4 — full QA sweep → `RELEASE-QA.md`

Build the release first: `bash scripts/package-release.sh` (must succeed, including its launch-proof gate if plan 5 landed).

Then create `RELEASE-QA.md` with the table below, run every check by hand against **(a)** `npm start` for the dev items and **(b)** the actual staged app `release/stage/Campfire.app` for the packaged items, and fill in `PASS` or `FAIL` plus a one-line note per row. Skip rows for features whose plan is listed in `BLOCKERS.md`, marking them `SKIPPED (blocked)`.

```markdown
# Release QA — Campfire v1.1.0
Date: <fill>  ·  Commit: <git rev-parse --short HEAD>  ·  Verdict: <SHIP / DO NOT SHIP>

| # | Check | Expected | Result | Note |
|---|---|---|---|---|
| 1 | npm run verify | exits 0, all smoke fields true | | |
| 2 | Launch → popover | popover appears by the tray, scenes with thumbnails, mixer, presets | | |
| 3 | Start session latency | scene imagery visible well under 1 s after click | | |
| 4 | Every scene plays | click through all ~10 scenes during a session: each switches with a fade, none black/broken | | |
| 5 | Scene sound + Master sliders | live volume change during video session, squared taper feels smooth | | |
| 6 | Audio-only mode | starts without video, keeps playing 10+ min with popover closed, no stutter | | |
| 7 | Hover-play on tile | one click on tile's play button starts that scene | | |
| 8 | Tray right-click | Resume last session / Start default preset / Start scene submenu / Stop all work | | |
| 9 | ⌥⌘C hotkey | stopped → default preset session; playing → stop | | |
| 10 | Media keys ⏯ | pause fades out; resume fades back; works 3× in a row | | |
| 11 | Pause visual | paused video session shows scene still (poster), not pure black | | |
| 12 | Sleep timer | arm 15 min: badge shows, cycles Off→15→30→60→90→Off; starting a session clears it | | |
| 13 | Session overlay | mouse move reveals pill (name, pause, timer, dimmer, clock, stop); auto-hides + cursor hides after 3 s | | |
| 14 | Dimmer + clock | dimmer darkens video and persists across restart; clock toggle persists | | |
| 15 | Presets CRUD | save, apply, right-click → set default / overwrite / delete; survive relaunch | | |
| 16 | Esc in preset name input | cancels naming, popover stays open | | |
| 17 | Desktop mode (plan 4) | wallpaper video behind windows and icons, click-through; switch to fullscreen and back without audio gap | | |
| 18 | Quit while playing | tray Quit: no audio pop; relaunch → Resume last session restores same scene+mix | | |
| 19 | Suspend | close lid / sleep during session → playback stopped gracefully on wake | | |
| 20 | Packaged app | mount release DMG, drag to /Applications, launch: popover with scenes+sounds; start a session; quit | | |
| 21 | Packaged signature (plan 5) | codesign --verify --deep --strict on the staged app exits 0; Finder shows flame icon | | |
| 22 | Idle footprint | app running 5 min, nothing playing: Campfire processes ≈0% CPU in Activity Monitor | | |
```

Verdict rule: `SHIP` only if every non-skipped row is PASS. Any FAIL → fix it if it is within this plan's scope (a regression from your own steps), otherwise log it in `BLOCKERS.md`, mark verdict `DO NOT SHIP`, and still commit the QA file — an honest failing record beats a green lie.

### Step 5 — tag

Only if the verdict is SHIP:

```bash
git add -A && git commit -m "chore: final polish, readme, and v1.1.0 release QA"
git tag v1.1.0
```

(Do not push unless the remote already has your previous plan commits; never force-push.)

## Edge cases a weaker model would miss

- The quit-fade handler is a **full replacement** — merging it line-by-line with the plan-3 version produces duplicate writes with different orderings. Replace the whole handler.
- Row 18 tests two things at once: the pop (listen with volume up) and lastSession persistence. Both must pass.
- Row 20 must use the app **from the mounted DMG copy in /Applications**, not `release/stage/` in place — path resolution (`mediaRoot()` ancestor walk) is exactly what differs.
- `RELEASE-QA.md` results must come from actually performing each check. Do not infer PASS from reading code. If a check cannot be performed (e.g. no second display for dim-displays), write `NOT TESTED (no hardware)` — never PASS.
- The README documents shipped behavior only; check `BLOCKERS.md` before writing feature claims.

## Acceptance criteria

1. `npm run verify` exits 0 at the final commit.
2. `README.md` exists with all seven sections and no claims about blocked features.
3. `RELEASE-QA.md` committed, every row filled with PASS / FAIL / SKIPPED (blocked) / NOT TESTED (reason), verdict line present.
4. `package.json` version is 1.1.0 and `release/Campfire-1.1.0.dmg` exists.
5. If verdict is SHIP: tag `v1.1.0` exists on the final commit.

Commit as: `chore: final polish, readme, and v1.1.0 release QA`
