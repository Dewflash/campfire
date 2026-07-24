# Campfire Repository Learning Report

Generated: 2026-07-20

Evidence base: `AGENTS.md`, `CLAUDE.md`, `CODEX_INSTRUCTIONS.md`, `PLAN-*.md`, `package.json`, `forge.config.ts`, Vite/TypeScript config, `src/main.ts`, `src/preload.ts`, `src/renderer.tsx`, `src/types.ts`, `src/icons.tsx`, `src/index.css`, and scripts under `scripts/`. Runtime media folders were inspected from the local filesystem, but are gitignored by design.

## 1. Executive Overview

Campfire is an implemented macOS menu-bar ambience app built with Electron Forge, React 18, TypeScript, Vite, and Tailwind CSS. It lets a user open a tray popover, choose a looping video scene, adjust an ambient sound mix, and start either a fullscreen video session or audio-only ambience. The app is local/offline after assets exist on disk: videos come from `4k loops/`, sounds come from `sounds/`, and media is served through a local custom `campfire://` protocol.

Implemented product flows:

- Tray icon opens a compact popover.
- Popover discovers scenes and sounds dynamically from local folders.
- User selects a scene, changes sound sliders, starts/stops fullscreen video or audio-only mode.
- Presets can be saved, applied, overwritten, deleted, and marked default.
- Fullscreen session supports pause/resume, Esc stop, video dimmer, optional clock, and a hover overlay that fades after inactivity.
- Main process persists presets and last state in JSON files under Electron `userData`.

Current maturity: functional local macOS app with useful smoke-test and package scripts, but not yet a polished distributable according to its own roadmap. Release hardening items such as tracked app icon generation, package launch-proofing, and script-level signing are planned in `PLAN-release-hardening.md` but are not implemented in the tracked source.

Architecture style: main-process-owned state with dumb renderers. The main process is the source of truth for playback mode, selected scene, mix, presets, settings, and persistence. Renderers consume snapshots and send typed intents through a preload bridge.

## 2. Repository Map

Important tracked files:

- `src/main.ts`: Electron main process, window lifecycle, tray, media discovery, state machine, persistence, IPC, custom protocol, smoke checks.
- `src/renderer.tsx`: one React renderer bundle for popover, hidden audio engine, and fullscreen session view. Routing is by `window.location.hash`.
- `src/preload.ts`: context-isolated IPC bridge exposing `window.campfire`.
- `src/types.ts`: shared TypeScript contracts for modes, manifest items, presets, settings, state snapshots, and API shape.
- `src/icons.tsx`: inline SVG icon components and sound-icon lookup.
- `src/index.css`: Tailwind import plus global/range-slider styling.
- `forge.config.ts`: Electron Forge makers, Vite plugin entries, and Electron fuse configuration.
- `vite.*.config.ts`: build configs for main, preload, and renderer. Renderer config enables React and Tailwind.
- `scripts/fetch-sounds.sh`: idempotent starter sound downloader.
- `scripts/generate-tray-icons.mjs`: dependency-free tray PNG generator.
- `scripts/package-release.sh`: packages the Electron app, stages media/resources, creates and verifies a DMG.
- `AGENTS.md`: operating rules and hard gates for planned implementation work.
- `CLAUDE.md`: compact architecture and trap summary.
- `CODEX_INSTRUCTIONS.md`: historical v1 build spec. It is evidence of intent, not proof of current behavior.
- `PLAN-*.md`: roadmap plans with acceptance criteria.

Important untracked or ignored local material:

- `4k loops/`: local video scenes and thumbnails, ignored because the media is large. Local inspection found 10 `.mp4` scene files, 10 thumbnail PNG files, and one ignored `.mov` duplicate.
- `sounds/`: starter audio loops, ignored except `.gitkeep`. Local inspection found 17 `.mp3` files.
- `release/`: ignored release artifacts. Local inspection found `Campfire-1.0.0.dmg`, `Campfire-1.0.0.zip`, `release/stage/Campfire.app`, and `release/stage/install.txt`.
- `out/`, `.vite/`, `dist/`, `node_modules/`: build/dependency output.

Not present in the tracked repo:

- No `README.md`.
- No `Tests/` directory or test source files.
- No `.xcodeproj`; this is not a native Swift/Xcode app.

## 3. System Architecture

### 3.1 Runtime Processes And Windows

Implemented in `src/main.ts` and `src/renderer.tsx`.

Campfire runs three Electron renderer surfaces from one renderer bundle:

- Popover route `#/popover`: visible tray control UI.
- Session route `#/session`: fullscreen video renderer.
- Audio route `#/audio`: hidden Web Audio engine.

The main process creates these as separate `BrowserWindow` instances:

- `createPopoverWindow()` builds a frameless transparent popover, positions it under the tray, hides on blur, and keeps it visible across workspaces.
- `createSessionWindow()` builds a hidden, frameless video window. It is prewarmed after launch and activated into `simpleFullScreen` when a video session starts.
- `ensureAudioWindow()` builds a hidden 1x1 audio renderer with `backgroundThrottling: false`, which is important because Chromium throttling can break hidden-window audio.

### 3.2 State Ownership

Implemented in `src/main.ts`.

Module-level state includes:

- `manifest`
- `presets`
- `mode`
- `paused`
- `currentSceneId`
- `currentMix`
- `lastSession`
- `settings`

The renderer does not own durable app state. It uses `getState`, listens to `state:changed`, renders a snapshot, and sends user intents back to main. This keeps state stable even when the popover hides or reloads.

### 3.3 Dependency Direction

The intended dependency direction is clean:

- `src/types.ts` defines shared contracts.
- `src/preload.ts` converts typed method calls into IPC calls.
- `src/main.ts` owns state and side effects.
- `src/renderer.tsx` owns UI presentation and Web Audio runtime.

The main coupling risk is that IPC channel names are duplicated as string literals across `src/main.ts` and `src/preload.ts`. The TypeScript API helps renderer callers, but it does not prevent a typo in a raw IPC channel name.

### 3.4 Security Boundary

Implemented choices:

- `contextIsolation: true` and `nodeIntegration: false` are used for visible and hidden renderers.
- Local media is served through a custom `campfire://` protocol rather than exposing raw `file://` paths to renderer code.
- The protocol handler resolves and checks paths against an allowed media/cache root before fetching from disk.
- Electron fuses disable several risky runtime behaviors in `forge.config.ts`, including `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments`.

Partial or unknown:

- The tracked package script does not sign the staged app. A previous local artifact may have been signed manually, but tracked source does not prove that as a repeatable build step.
- No updater, crash reporter, telemetry, or notarization is implemented.

## 4. Startup And Runtime Flows

### 4.1 App Boot

Startup happens in `app.whenReady()` in `src/main.ts`.

Flow:

1. Hide Dock icon.
2. Scan media manifest.
3. Load persisted presets and state.
4. Register the `campfire://` media protocol.
5. Register IPC handlers.
6. Create tray icon.
7. Register global hotkey `Alt+Command+C`.
8. After 1.5 seconds, prewarm the session window and hidden audio window.
9. Register system suspend handling.
10. Show popover on launch unless smoke or hide env flags suppress it.

The app also requests a single-instance lock early. If another instance is launched, the second exits.

### 4.2 Media Discovery

Implemented in `scanManifest()` in `src/main.ts`.

Scenes:

- Root is found by `mediaRoot()`, which searches candidate ancestor paths for `4k loops/`.
- Scene files are `.mp4` only.
- `.mov` files are ignored.
- Scene id is slugified filename base.
- Display name strips leading `ai ` and capitalizes the first letter.
- Thumbnail naming is `pic <base>.png`.
- `thumbnailUrl` uses cached resized PNGs for the popover.
- `posterUrl` uses the original PNG for fullscreen poster-first rendering.

Sounds:

- Sound files support `.mp3`, `.m4a`, `.wav`, and `.ogg`.
- Sound ids are slugified filename bases.
- Icon selection is keyword-based.

The app rescans on manifest requests and popover show, so adding files can be picked up without hard-coded lists.

### 4.3 Popover Flow

Implemented in `PopoverApp` in `src/renderer.tsx`.

On load, `useCampfireData()` fetches manifest and state concurrently. The popover renders:

- Header with Campfire mark and settings button.
- Scene grid.
- Sound mix rows: pinned `Scene sound`, discovered sounds, pinned `Master`.
- Presets chip row with save input.
- Start session and audio-only buttons.
- Footer hint.

State updates are optimistic for scene, mix, and setting changes. The renderer updates local state immediately, then resolves with the main-process snapshot.

Keyboard behavior:

- Arrow keys select scenes.
- Enter starts selected scene.
- Escape closes popover, except settings Escape first closes settings.
- Text/range input handling is present but has a known weakness: Escape inside any input currently calls `window.close()` in the window-level handler. `PLAN-engine-bugfix-batch.md` describes this as a defect.

### 4.4 Fullscreen Video Session Flow

Implemented in `startVideoSession()`, `ensureSessionWindow()`, and `SessionView`.

Start flow:

1. Main resolves the scene from manifest.
2. Main increments `playbackGeneration`, sets `mode = 'video'`, clears `paused`, stores current scene and normalized mix.
3. Main tells the audio engine to apply the current mix.
4. Main activates the prewarmed or newly created session window.
5. Main sends `video:switch` with `videoUrl` and `posterUrl`.
6. Main sends squared scene-volume value to session renderer.
7. Main broadcasts full state to all live windows.

Session renderer behavior:

- Loads the original thumbnail poster first.
- Loads the video URL into a full-screen `<video>`.
- Fades video in after `onPlaying`.
- Uses `object-cover` and centered positioning.
- Keeps poster visible when paused or while video is not ready.
- Esc sends `session:stop`.
- Pointer movement reveals bottom overlay, resets cursor visibility, and hides overlay/cursor after 3 seconds.

### 4.5 Audio-Only Flow

Implemented in `startAudioOnly()` and `AudioEngine`.

Main sets `mode = 'audioOnly'`, applies the current mix to the hidden audio window, fades any visible video window out, and destroys the session window after the fade if generation still matches.

The scene sound slider is disabled in the popover during audio-only mode because scene sound is the video track, not part of the hidden Web Audio engine.

### 4.6 Stop, Pause, Resume

Stop:

- `stopPlayback()` captures `lastSession` if a scene exists.
- Sets `mode = 'stopped'`.
- Schedules persisted state write.
- Sends `audio:fadeOutAndStop`.
- Sends video volume 0.
- Broadcasts state with fade duration.
- Destroys the session window after fade.
- Shows popover again unless quitting.

Pause:

- `pausePlayer()` sets `paused = true`, sends video volume 0, broadcasts state.
- Audio renderer sees paused state and fades channels out.

Resume:

- `resumePlayer()` clears paused, reapplies audio mix, sends video volume, broadcasts state.

Partial concern:

- The audio engine still performs heavy full-mix work on volume changes and state changes. `PLAN-engine-bugfix-batch.md` identifies this as a performance bug.

### 4.7 Persistence

Implemented in `src/main.ts`.

Files:

- `presets.json` in `app.getPath('userData')`
- `state.json` in `app.getPath('userData')`

Writes:

- Debounced by 500 ms.
- Atomic through temp file plus rename.

Startup:

- Reads presets and normalizes mixes.
- Seeds a "Cozy cabin" preset only if no presets exist and a `fireplace` scene is present.
- Reads last session and settings, clamps `videoDimmer`, then chooses current scene/mix from last session, default preset, or first scene.

## 5. Module And File Guide

### `src/types.ts`

Defines shared contracts. Important types:

- `AppMode = 'stopped' | 'video' | 'audioOnly'`
- `SceneManifest`
- `SoundManifest`
- `Preset`
- `Settings`
- `AppStateSnapshot`
- `CampfireApi`

Maintainability note: this file is the correct place to extend the IPC-facing data model. Current absence of `'desktop'` and timer fields is evidence those roadmap features are not implemented in the current source.

### `src/preload.ts`

Bridges renderer to main with `contextBridge.exposeInMainWorld('campfire', api)`. It uses `ipcRenderer.invoke` for request-response commands and a helper `onChannel` for subscriptions.

Maintainability note: channel strings are stable public contracts inside the app. Renames must touch main, preload, and renderer together.

### `src/main.ts`

Largest and most important file. Responsibilities:

- App lifecycle.
- Single-instance handling.
- Window creation and positioning.
- Tray menu.
- Media root discovery.
- Manifest scanning.
- Protocol registration.
- State machine.
- Preset/state persistence.
- IPC handler registration.
- Smoke and launch-proof helpers.

Maintainability concern: many concerns live in one module. This keeps the v1 app simple, but future changes to playback modes, packaging checks, or persistence will be easier after extracting small focused modules.

### `src/renderer.tsx`

Contains all three renderer roles:

- `PopoverApp`
- `AudioEngine`
- `SessionView`

It uses hash routing in `App()` rather than a routing library. This is consistent with the no-new-runtime-dependencies constraint.

Maintainability concern: the file mixes UI, audio engine, and session playback. The boundaries are conceptually clear, but physically co-located.

### `src/icons.tsx`

Inline SVG components. The sound icon mapping uses `SoundIconName` values from `src/types.ts`. This avoids adding a runtime icon dependency.

### `src/index.css`

Imports Tailwind and defines app-global basics plus custom slider styles. Tailwind is used heavily in `src/renderer.tsx`; removing it would be a rewrite, not a cleanup.

### `scripts/fetch-sounds.sh`

Downloads starter sounds from Moodist URLs into `sounds/`, skipping nonempty existing files and failing on HTTP errors. It does not verify playback, but does verify nonempty downloads.

### `scripts/generate-tray-icons.mjs`

Generates template tray PNGs without external dependencies. This is a self-contained rasterizer and PNG encoder.

### `scripts/package-release.sh`

Packages via Electron Forge, stages the app into `release/stage`, copies `assets`, `4k loops`, and `sounds` into app resources, adds an Applications symlink, creates a compressed DMG, and verifies the DMG.

Partial: the tracked script does not create a ZIP, install text, app icon, ad-hoc signature, or launch-proof check.

## 6. Language And Framework Education

### Electron

Electron gives Campfire native-ish macOS behavior while keeping UI in React.

Key Electron APIs used:

- `Tray` for menu-bar presence.
- `BrowserWindow` for popover, fullscreen session, hidden audio, and dim windows.
- `protocol.handle` and `net.fetch` for secure local media serving.
- `powerSaveBlocker` for fullscreen sessions.
- `powerMonitor.on('suspend')` to stop playback on sleep.
- `globalShortcut.register` for `Alt+Command+C`.
- `shell.showItemInFolder` for revealing the presets file.

### React

React is used as a stateful renderer, not as the app's source of truth. The main patterns are:

- `useState` for local UI details: expanded sound list, settings panel, save input, overlay visibility.
- `useEffect` for subscriptions and lifecycle cleanup.
- `useCallback` to stabilize callbacks used by effects and props.
- `useMemo` to derive the selected scene from manifest and state.

### TypeScript

TypeScript protects cross-window data shapes. `CampfireApi` in `src/types.ts` is especially important: renderers call `window.campfire` with typed payloads and receive typed snapshots.

### Web Audio

`AudioEngine` uses one `AudioContext`, one master gain, and one `HTMLAudioElement -> MediaElementAudioSourceNode -> GainNode -> master -> destination` chain per active sound. Volumes use squared taper in both audio and scene video, which makes slider movement feel more natural to human hearing.

### Tailwind CSS

Tailwind classes encode the app's visual system directly in JSX: stone palette, amber accent, rounded controls, transitions, spacing, and typography. Tailwind is not needed because the app is online or offline; it is a build-time styling tool. In this repo it is currently part of the implementation, not a network dependency.

## 7. Data Architecture

Core entities:

- Scene: discovered from `.mp4` file plus optional thumbnail.
- Sound: discovered from audio file extensions.
- Mix: map of channel id to slider value.
- Preset: saved scene plus mix.
- Settings: `dimOtherDisplays`, `showClock`, `videoDimmer`.
- Last session: scene, mix, and previous mode.

Sources of truth:

- Filesystem media folders are source of truth for manifest.
- Main process memory is source of truth for runtime state.
- JSON files in `userData` are source of truth across launches.
- Renderer local state is temporary and replaceable.

Transformations:

- Filenames become ids through slugification.
- Filenames become display names by stripping leading `ai ` and capitalizing.
- Slider values become audio/video gain through squaring.
- Thumbnails become cached 420-pixel PNGs for popover performance.

Recovery:

- Missing media folders produce empty manifests rather than crash.
- Missing selected scene falls back to first scene or null.
- JSON parse/read errors are caught and logged, then defaults are used.

## 8. UI And Product Structure

Popover:

- Dark rounded panel.
- Scene grid with selectable thumbnails.
- Sound mixer with sliders.
- Settings panel replacing main content when open.
- Preset chips with custom context menu.
- Start and audio-only action buttons.

Session:

- Fullscreen black base.
- Poster image layer.
- Video layer.
- Dimmer overlay.
- Optional clock.
- Bottom overlay with scene name, pause/resume, dimmer slider, clock toggle, and stop.

Accessibility notes:

- Sliders have `aria-label`.
- Icon buttons use `title`.
- Scene images are decorative with empty `alt`.
- Scene tiles are actual buttons.

Gaps:

- No first-run onboarding.
- No visible error state for a broken video/audio file.
- Empty scene folder currently renders an empty grid; the roadmap identifies this as a bug to fix.

## 9. Testing And Reliability

Implemented checks:

- `npm run typecheck`
- `npm run lint`
- `npm run smoke`
- `npm run verify` = typecheck, lint, and deep GUI smoke.

Smoke coverage in `runSmokeTest()` checks:

- Tray icon loaded.
- Scenes/sounds/presets exist.
- Popover body includes key text.
- Settings panel includes settings text.
- Video mode can start.
- Audio-only mode can start.
- Stop returns to stopped and no visible playback window remains.
- Selecting while stopped does not open playback.

Launch proof in `runLaunchProof()` checks:

- Tray exists.
- Popover becomes visible.
- Popover contains key text.

Gaps:

- No unit tests.
- No deterministic renderer component tests.
- No automated packaging script signature validation in tracked script.
- No automated ZIP validation in tracked script.
- GUI smoke can optionally capture screenshots if `CAMPFIRE_SCREENSHOT_PATH` is set, but this was not used for this report.

## 10. Build And Deployment

Development:

- `npm install`
- `npm start`

Verification:

- `npm run typecheck`
- `npm run lint`
- `npm run verify`

Packaging:

- `scripts/package-release.sh`
- Produces `release/Campfire-<version>.dmg` from `package.json` version.

Environment switches implemented in `src/main.ts`:

- `CAMPFIRE_SMOKE_TEST=1`
- `CAMPFIRE_DEEP_SMOKE=1`
- `CAMPFIRE_LAUNCH_PROOF=1`
- `CAMPFIRE_SHOW_POPOVER=1`
- `CAMPFIRE_HIDE_POPOVER_ON_LAUNCH=1`
- `CAMPFIRE_SCREENSHOT_PATH=<path>`
- `CAMPFIRE_LAUNCH_PROOF_SCREENSHOT_PATH=<path>`
- `CAMPFIRE_MEDIA_ROOT=<path>`
- `CAMPFIRE_ASSETS_ROOT=<path>`

Release limitation:

- The tracked script creates and verifies a DMG, but does not code-sign or notarize. User-created local artifacts may have additional manual steps, but the repo does not make them reproducible.

## 11. Architectural Critique

Strengths:

- Main-owned state is the right choice for a tray app with ephemeral windows.
- Custom protocol avoids `file://` exposure and handles large streamed media.
- Prewarmed session window and poster-first rendering directly support the product promise of quick start.
- Hidden audio window with `backgroundThrottling: false` matches the operational reality of background audio in Electron.
- No runtime state library or UI kit keeps the app compact.

Weaknesses and risks:

- `src/main.ts` and `src/renderer.tsx` are large multipurpose files.
- IPC channels are stringly typed at registration/subscription boundaries.
- AudioEngine still creates and updates more channels than necessary on some paths, as documented in `PLAN-engine-bugfix-batch.md`.
- Some roadmap docs are stale relative to current code, especially sleep timer and desktop mode.
- Packaging automation is incomplete relative to shipment expectations.
- No README means new contributors must read internal plan files to understand normal use.
- No automated tests beyond lint/typecheck/smoke, and smoke opens GUI windows.

Prioritized improvements:

1. Add `README.md` that reflects current implemented behavior.
2. Finish or explicitly retire the roadmap plans so docs stop contradicting code.
3. Extract media discovery/persistence/state-machine helpers from `src/main.ts`.
4. Optimize `AudioEngine` volume-change paths.
5. Make packaging repeatable: app icon, ad-hoc signing, launch proof, ZIP/DMG validation, install text.
6. Add small unit tests for slugification, manifest discovery, persistence fallback, and mix normalization.

## 12. Learning Summary

The shortest mental model:

Campfire is a main-process state machine wrapped in three Electron windows. The popover is the remote control, the fullscreen renderer is the video surface, and the hidden audio renderer is the mixer. Local files are discovered into a manifest, converted to `campfire://` URLs, and rendered by React. Main owns the truth; renderers display snapshots and emit commands.

For a new developer, the safest first change is documentation or a narrow UI copy/layout fix in `src/renderer.tsx`. For behavior changes, start in `src/types.ts` if the IPC contract changes, then wire `src/preload.ts`, then implement in `src/main.ts`, then update `src/renderer.tsx`. Always verify with typecheck/lint at minimum; full `npm run verify` opens real windows.

