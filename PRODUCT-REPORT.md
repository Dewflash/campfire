# Campfire Product And Industry Report

Generated: 2026-07-20

Evidence base: current repository source and docs, including `src/main.ts`, `src/renderer.tsx`, `src/types.ts`, `src/preload.ts`, `src/index.css`, `package.json`, `forge.config.ts`, `scripts/`, `AGENTS.md`, `CLAUDE.md`, `CODEX_INSTRUCTIONS.md`, and `PLAN-*.md`. Local media and release folders were inspected as filesystem evidence, but they are gitignored and not portable through Git.

## 1. Executive Summary

One-sentence description: Campfire is a macOS menu-bar ambience app that lets a user start a fullscreen looping scene and custom ambient sound mix from a small tray popover.

Elevator pitch: Campfire turns local 4K ambience loops and sound files into an instant mood switch: click the menu-bar icon, pick a scene, adjust a mix, and drop into a focused, cozy session.

Plain-English explanation: The app sits in the Mac menu bar. When opened, it shows scene thumbnails, sound sliders, presets, and two main actions: start a fullscreen video session or run the sounds only. The app is meant to feel calmer and faster than finding a YouTube ambience video or manually juggling separate sound apps.

Target users:

- Implemented/inferred: Mac users who want a quick ambient workspace, relaxation session, or background soundscape.
- Inferred: Students, writers, programmers, designers, and people using external monitors or focused work sessions.
- Not currently served: Windows/Linux users, mobile users, collaborative teams, streaming/cloud-first users, or people who want a marketplace of scenes.

Problem solved: Starting a pleasant ambience setup is usually fragmented: choose a video somewhere, choose separate sound, adjust volume, keep a tab or app open, and repeat later. Campfire compresses that into a menu-bar action and saved presets.

Main value proposition: fast local ambience with user-controlled visual and audio layers.

Strongest differentiator today: the combination of local high-resolution looping scene video, independent sound-channel mixing, and menu-bar session control in a small offline app.

Current stage and verdict: promising local v1 with a clear product feel, but not yet fully shipment-hardened in tracked source. The app works as a personal/distribution candidate when media exists locally; packaging, documentation, and quality gates need tightening for broader trust.

## 2. The Problem And Alternatives

The user pain is real but bounded. Many people use ambience to change the feeling of a room, soften concentration, mask noise, or create a work ritual. Existing substitutes include:

- YouTube ambience videos.
- Spotify/Apple Music ambience playlists.
- Browser sound mixers.
- Meditation or focus apps.
- Desktop wallpaper/video apps.
- Manual combinations of video player plus audio player.

What is insufficient about those alternatives:

- YouTube requires search, ads or distractions, internet, and tab/window management.
- Music apps usually do not combine user-controlled layered ambience with visual scenes.
- Browser mixers often lack fullscreen high-quality scene video.
- General video players do not provide quick presets and independent sound layers.
- Wallpaper apps can be heavier or more decorative than focused.

Evidence limits:

- Implemented evidence supports a functional local solution.
- Market size, willingness to pay, retention, and competitor positioning were not externally researched for this report.
- The urgency of the problem is inferred; the repository does not contain user research.

## 3. Users And Use Cases

### Focus Worker

Status: inferred from product behavior.

Goal: create a steady workspace atmosphere without fiddling.

Scenario: A developer opens Campfire from the menu bar, chooses "Rainy coast," lowers scene sound, adds rain and wind, starts fullscreen for a break, then switches to audio-only while coding.

Value: one repeatable ambience setup without keeping a browser tab open.

Why they return: saved presets and tray/global hotkey reduce setup friction.

Not for: task management, music discovery, productivity analytics, or Pomodoro timing in the current app.

### Relaxation Or Sleep-Adjacent User

Status: partial/inferred.

Goal: create a calm visual/audio setting.

Scenario: User starts a cozy cave/fireplace session fullscreen, dims video, hides overlay, and lets sound run.

Value: immersive environment with less UI.

Limitations: the sleep timer described in historical docs was removed from current code, so the product should not currently be marketed as a sleep-timer app.

### Ambient Display User

Status: implemented for fullscreen, planned for desktop wallpaper.

Goal: turn a Mac display into a mood screen.

Scenario: The user starts a fullscreen scene on the display where the cursor is located.

Value: turns an idle monitor into scenery.

Limitations: desktop-wallpaper mode is planned in `PLAN-desktop-ambience-mode.md`, but current `AppMode` only supports `stopped`, `video`, and `audioOnly`.

### Power User Or Tinkerer

Status: implemented.

Goal: control local media rather than depend on bundled hard-coded content.

Scenario: User drops new `.mp4` files and matching `pic <name>.png` thumbnails into `4k loops/`, or new sound loops into `sounds/`.

Value: extensible local library without app updates.

Limitations: no in-app media import UI, validation UI, license tracking, or broken-file recovery.

## 4. Product Experience

### Onboarding And First Value

Implemented behavior assumes media already exists. On launch, the popover appears by default unless env flags or smoke mode suppress it. If scene media exists, the user immediately sees thumbnails and can start a session.

The first value moment is selecting a scene and pressing "Start session." The current code also prewarms the session and audio windows after launch and uses poster-first rendering, which improves perceived speed.

Gap: there is no README or first-run in-app onboarding. If a fresh clone lacks media, the sounds folder can be fetched with `scripts/fetch-sounds.sh`, but videos are not fetched by the repo.

### Main Surfaces

Popover:

- Scene grid.
- Sound mix.
- Presets.
- Settings.
- Start session and audio-only actions.

Fullscreen session:

- Scene poster/video.
- Dimmer.
- Optional clock.
- Bottom overlay with playback and settings controls.

Hidden audio engine:

- User never sees it, but it owns Web Audio playback for non-scene sound channels.

Tray:

- Left-click toggles popover.
- Right-click menu offers resume, default preset, audio-only default, stop, dim other displays, launch at login, and quit.

### Loading, Empty, Error, Permission, And Recovery States

Implemented:

- "Warming up..." while state has not loaded.
- Empty sound-folder hint.
- Missing scene thumbnail falls back to a flame placeholder.
- Bad persisted JSON logs and falls back.
- Invalid media path traversal is blocked in protocol handler.

Partial/gaps:

- Empty scene folder currently shows an empty scene grid rather than an explicit instruction.
- Broken media files do not show user-facing recovery.
- Launch-at-login behavior exists, but login-specific popover suppression is planned as a bug fix, not implemented.
- No visible explanation of ad-hoc signing or Gatekeeper in tracked docs.

## 5. Product Capabilities

### Dynamic Scene Library

Status: implemented.

What it does: scans `4k loops/` for `.mp4` files and matching `pic <name>.png` thumbnails.

Who benefits: users who want to add or replace local ambience videos.

Limitations: only `.mp4` scenes are supported; `.mov` is ignored. There is no UI for importing, renaming, or validating videos.

### Fullscreen Video Session

Status: implemented.

What it does: starts a frameless fullscreen scene window on the display nearest the cursor, with poster-first rendering and video fade-in.

Who benefits: users wanting immersive ambience.

Limitations: no desktop-wallpaper mode in current source; no multi-scene shuffle.

### Sound Mixer

Status: implemented, with performance improvement planned.

What it does: scans local sound files, creates Web Audio channels, exposes sliders, and mixes them with master volume.

Who benefits: users who want rain, fire, train, wind, and similar layers independent from the scene.

Limitations: current audio engine can do redundant full-mix work on volume changes; roadmap documents the fix.

### Scene Sound

Status: implemented.

What it does: treats the video track's volume as a pinned "Scene sound" channel.

Who benefits: users who want embedded fireplace/rain/coast audio without extra files.

Limitations: disabled during audio-only because there is no video element.

### Presets

Status: implemented.

What it does: saves scene plus mix, lets users apply, overwrite, delete, and set default.

Who benefits: repeat users who want one-touch ambience.

Limitations: preset file is revealed in Finder for advanced access; there is no polished preset management screen.

### Pause/Resume And Media Keys

Status: partially implemented.

What it does: pause/resume IPC and MediaSession handlers exist; pause fades audio and video down.

Limitations: the bug-fix roadmap says `navigator.mediaSession.playbackState` is missing, which can make hardware media-key resume unreliable.

### Global Hotkey

Status: implemented.

What it does: `Alt+Command+C` starts the default preset when stopped and stops playback when active.

Limitations: not configurable.

### Settings

Status: implemented.

What it does: settings panel controls show clock, dim other displays, and video dimmer.

Limitations: no full preferences window, no reset-to-defaults UI.

### Sleep Timer

Status: not implemented in current source.

Historical docs mention it, but `src/types.ts`, `src/preload.ts`, `src/main.ts`, and `src/renderer.tsx` do not currently expose timer state or `timer:set`. It was removed in recent app work.

### Desktop Wallpaper Mode

Status: planned.

`PLAN-desktop-ambience-mode.md` describes it, but current `AppMode` does not include `desktop`, and `startSession` has no `kind` parameter.

### Packaging

Status: partial.

The tracked package script creates and verifies a DMG with staged media. Local ignored release artifacts include a DMG, ZIP, staged `.app`, and install text. The tracked source does not yet make ZIP creation, install-text inclusion, ad-hoc signing, app icon generation, or packaged launch proof repeatable.

## 6. Product And Technical Architecture

Technology stack:

- Electron 43.
- Electron Forge 7.
- React 18.
- TypeScript 5.
- Vite 8.
- Tailwind CSS 4.
- Web Audio API.

Platform:

- macOS-oriented menu-bar app.
- Docs mention latest macOS and Apple Silicon.
- Forge config includes makers for other platforms, but product behavior is designed around macOS APIs.

Architecture:

- Main process owns state and side effects.
- One renderer bundle serves three roles by hash route.
- Preload exposes a typed API under `window.campfire`.
- Local filesystem is the media source.
- `campfire://` protocol streams media and cached thumbnails.
- Persistence is local JSON in Electron `userData`.

Privacy:

- Implemented app can run offline once media is present.
- No analytics, accounts, cloud sync, or remote backend exists.
- `scripts/fetch-sounds.sh` downloads starter sounds during setup only.

Reliability:

- App stops playback on system suspend.
- Fullscreen mode prevents display sleep while active.
- State writes are atomic.
- Smoke tests exercise key runtime paths.

Scalability:

- The app is local-first, so cloud scalability is not a concern.
- Main concerns are local disk size, memory/CPU use for large videos, and audio channel overhead.
- Large media is kept out of Git and copied into release packages.

## 7. Differentiation And Positioning

Comparable workflows:

- YouTube ambience.
- Spotify/Apple Music ambience.
- Browser sound mixers.
- Desktop video wallpaper apps.
- Meditation/focus apps.

Current meaningful differences:

- Local video and audio library rather than streaming content.
- Menu-bar popover as primary control.
- Independent sound channel mixing.
- Preset-based return loop.
- Poster-first fullscreen start.

Easy-to-copy elements:

- Dark popover UI.
- Basic sliders and presets.
- Tray menu controls.

More defensible elements if developed:

- A polished local media pipeline.
- Excellent performance with huge 4K loops.
- Reliable macOS behavior across Spaces, full screen, media keys, sleep/wake, and Gatekeeper.
- Curated scene/sound packs with clear licensing.

Positioning should stay humble: "local ambience command center for Mac" is supportable. Claims like "best focus app," "meditation app," or "desktop wallpaper engine" are not currently evidenced.

## 8. Maturity, Quality, And Trust

What genuinely works from repository evidence:

- Main app state machine.
- Dynamic media discovery.
- Popover UI.
- Fullscreen sessions.
- Audio-only mode.
- Presets.
- Settings for dimmer/clock/dim other displays.
- Custom media protocol.
- Smoke and launch-proof routines in code.

Prototype or fragile areas:

- No README.
- No automated unit tests.
- Audio engine performance bugs remain documented.
- Packaging script is not fully shipment-grade.
- Roadmap docs contain stale features relative to current code.
- Empty scene state is weak.
- Launch-at-login popover behavior has a documented bug.

Trust risks:

- Broken local media has no friendly explanation.
- Unsigned or unnotarized app distribution creates Gatekeeper friction.
- Users may misunderstand why large media makes ZIP/DMG slow.
- If docs mention removed timer/desktop features, users will lose confidence.

## 9. Feasibility And Longevity

Technical feasibility: high. The product is already functional and uses well-supported desktop APIs.

Dependency risk: moderate. Electron is heavy but appropriate for rapid UI/media work. Tailwind is build-time styling, not an online requirement. No runtime dependency sprawl exists.

Vendor/API risk: low for core use because no backend or cloud API is required. macOS-specific window behavior and media-key behavior are the meaningful platform risks.

Data quality risk: moderate. User-supplied media can be missing, oversized, incompatible, badly looped, or unlicensed.

Operating cost: near zero for a local-only app, unless the product later hosts/downloads media.

Licensing risk: important. Starter sounds come from Moodist URLs per the setup script, and bundled videos/sounds need clear distribution rights before any public/commercial shipment.

Privacy risk: low in the current architecture, provided no analytics or remote fetching is added beyond optional setup scripts.

Maintenance burden: manageable if the large files stay out of Git and packaging is made repeatable.

Likely failure modes:

- App launches without media.
- Gatekeeper blocks downloaded builds.
- Fullscreen or Spaces behavior differs across macOS versions.
- Hidden audio playback is throttled if window settings regress.
- Large media makes release artifacts slow to build and move.

## 10. Roadmap And Priorities

Minimum credible release:

1. Add a factual `README.md`.
2. Make package script repeatable for DMG, ZIP, install text, media staging, ad-hoc signing, and launch proof.
3. Keep docs consistent with current code, especially removing timer claims unless the timer returns.
4. Fix documented engine bugs that affect daily use.
5. Add explicit empty scene state.

Highest-value user-facing work:

- One-click play affordances on tiles and tray scene submenu.
- Better first-run media guidance.
- Import/reveal media folder controls.
- Clean package/install instructions.

Technical foundations:

- Split `src/main.ts` into media, persistence, window, and playback modules.
- Split `src/renderer.tsx` into popover, session, and audio modules.
- Add unit tests around manifest and state utilities.
- Add deterministic package validation.

Work to defer:

- Cloud sync.
- In-app store or media marketplace.
- Windows/Linux support.
- Custom hotkey editor.
- Desktop wallpaper mode until the macOS `type: 'desktop'` feasibility probe is repeated.

Evidence that would show progress:

- `npm run verify` green at HEAD.
- Package script produces signed/verifiable DMG and ZIP from a fresh checkout plus media folders.
- README accurately guides a new user from install to first session.
- Manual QA record or automated launch proof confirms packaged app can see bundled media.

## 11. Communication Pack

### Website Introduction

Campfire is a Mac menu-bar ambience app for local video scenes and layered sound. Pick a looping scene, mix sounds like rain, fire, waves, and wind, then start a fullscreen session or keep the audio running while you work.

### User-Facing Product Explanation

Campfire lives in your menu bar. Open it, choose a scene, adjust the sound sliders, and start. You can save favorite combinations as presets, dim the video for late-night use, pause/resume, or stop everything from the tray.

### Technical Explanation For Peers

Campfire is an Electron Forge app with a main-process state machine and three renderer routes: popover UI, fullscreen session, and hidden Web Audio mixer. Media is discovered from local folders, served through a secure custom `campfire://` stream protocol, and persisted through debounced atomic JSON writes in Electron `userData`.

### 30-Second Pitch

Campfire replaces the little ritual of searching for ambience videos, opening tabs, and juggling audio. It gives Mac users a local menu-bar control panel for scene loops, sound mixing, and saved presets, so a calm visual/audio environment is always one click away.

### User Stories

- As a remote worker, I want to start my favorite rain-and-fire mix quickly so my workspace feels consistent every morning.
- As a writer, I want fullscreen scenery and separate sound sliders so I can create the mood without distracting UI.
- As a tinkerer, I want to drop my own video and audio files into folders so the app reflects my own ambience library.

### FAQ

Does Campfire require the internet?

No for normal use once media files are on disk. The starter sound script downloads files during setup.

Can I add my own scenes?

Yes. Add `.mp4` files to `4k loops/` and matching thumbnails named `pic <name>.png`.

Can I add sounds?

Yes. Add `.mp3`, `.m4a`, `.wav`, or `.ogg` files to `sounds/`.

Does it support desktop wallpaper video?

Not in the current source. It is planned in a roadmap file.

Does it include a sleep timer?

No, not in the current source.

Is the app notarized?

Not evidenced in the tracked repository. The current tracked package script does not notarize.

### Why This Matters

Small context switches add up. If ambience helps someone focus, rest, or make a workspace feel more humane, the setup should not become another task. Campfire's best idea is making atmosphere feel close at hand.

### Honest Current Limitations

- macOS-focused.
- Requires local media files.
- No README in current repo before this report.
- No public licensing audit for bundled media in the repo.
- No cloud library, account, sync, or updater.
- Packaging automation is partial.
- Desktop wallpaper and sleep timer should not be advertised as current features.

## 12. Final Assessment

Strongest case: Campfire has a coherent product center. The implemented architecture directly supports the experience: local media, menu-bar control, independent sound mixing, presets, and fast fullscreen entry.

Strongest criticism: the repository currently mixes finished product behavior, historical spec, and future roadmap in a way that can mislead maintainers and users unless documentation is cleaned up.

Biggest unresolved risk: shipment trust. For personal use, the app is compelling. For broader distribution, packaging, signing/notarization expectations, media licensing, and reproducible release checks need to be settled.

Highest-value next step: make the shipped app reproducible from source: README, package script with DMG/ZIP/install text/signature/launch proof, and a QA record that matches the current feature set.

Verdict: promising and usable as a local macOS ambience app, but premature to position as a polished public release until release hardening and documentation catch up with the product.

