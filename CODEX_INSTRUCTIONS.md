# Campfire — Build instructions (one-shot handover)

You are building **Campfire**, a macOS menu bar ambience app, from scratch to a fully working state in this repository (`https://github.com/Dewflash/campfire.git`, repo root = this folder). Follow this document exactly. Where this document specifies an approach, use that approach — do not substitute alternatives. Anything not specified is yours to decide sensibly.

## 1. What the app is

Campfire lives in the macOS menu bar. Clicking its tray icon opens a small dark popover where the user:

1. Picks a **scene** (a looping 4K video, shown as a thumbnail tile),
2. Adjusts a **sound mix** (independent looping ambience channels with volume sliders),
3. Hits **Start session** (fullscreen looping video + the sound mix) or **Audio only** (sound mix with no video, runs in background while they work).

Presets store scene + mix so a chill session is reachable in one click. The whole point: user clicks the icon and is instantly inside a cozy session.

Target: **latest macOS, Apple Silicon**. Dev-run quality is the goal for v1 (`npm start`); packaging/signing/DMG is explicitly **out of scope** for now.

## 2. Assets (already present in this repo — do not move, rename, or commit them)

### Videos: `4k loops/`

Every scene is auto-discovered, never hard-coded. A scene = a file `4k loops/<name>.mp4` plus its thumbnail `4k loops/pic <name>.png`. Current contents (all H.264, verified playable in Chromium):

| File | Thumbnail | Notes |
|---|---|---|
| `fireplace.mp4` | `pic fireplace.png` | 4K, 661 MB, has embedded crackle audio |
| `kinkakuji snow.mp4` | `pic kinkakuji snow.png` | 4K, has audio |
| `kiyomizudera bridge.mp4` | `pic kiyomizudera bridge.png` | 1440p, has audio |
| `sakura canal.mp4` | `pic sakura canal.png` | 1440p, has audio |
| `rainy coast.mp4` | `pic rainy coast.png` | 4K, has audio (ignore `rainy coast.mov` — same content, old container) |
| `mini waterfall.mp4` | `pic mini waterfall.png` | 4K, has audio |
| `train loop.mp4` | `pic train loop.png` | 1440p |
| `beach shore blue.mp4` | `pic beach shore blue.png` | 1440p |
| `ai cozy tent.mp4` | `pic ai cozy tent.png` | 1080p |
| `ai cozy cave.mp4` | `pic ai cozy cave.png` | 1080p |

Discovery rules:
- Scan `4k loops/` for `*.mp4` (only `.mp4`; ignore `.mov` and everything else).
- Scene id = filename without extension, slugified (`kinkakuji snow` → `kinkakuji-snow`).
- Display name = filename without extension, with a leading `ai ` stripped and first letter capitalized (`ai cozy tent` → `Cozy tent`, `kinkakuji snow` → `Kinkakuji snow`).
- Thumbnail = `pic <original filename>.png` if it exists, else render the tile with a neutral placeholder (no crash).
- The user will drop new `.mp4` + `pic *.png` pairs into this folder over time. Rescan on every popover open (it's a cheap readdir).

### Sounds: `sounds/`

Create a `sounds/` folder at repo root with a `.gitkeep`, then **source the starter sound set yourself** by downloading these CC-sourced ambience loops from the open-source Moodist project (base URL `https://raw.githubusercontent.com/remvze/moodist/main/public/sounds/`). Download each with curl, saving to `sounds/` under the new name (the filename becomes the channel name in the UI, so the names matter):

| Save as | Moodist path |
|---|---|
| `rain.mp3` | `rain/light-rain.mp3` |
| `heavy rain.mp3` | `rain/heavy-rain.mp3` |
| `rain on window.mp3` | `rain/rain-on-window.mp3` |
| `thunder.mp3` | `rain/thunder.mp3` |
| `fire.mp3` | `nature/campfire.mp3` |
| `birds.mp3` | `animals/birds.mp3` |
| `crickets.mp3` | `animals/crickets.mp3` |
| `wind chimes.mp3` | `things/wind-chimes.mp3` |
| `leaves.mp3` | `nature/wind-in-trees.mp3` |
| `wind.mp3` | `nature/wind.mp3` |
| `stream.mp3` | `nature/river.mp3` |
| `waterfall.mp3` | `nature/waterfall.mp3` |
| `waves.mp3` | `nature/waves.mp3` |
| `street.mp3` | `urban/busy-street.mp3` |
| `night village.mp3` | `places/night-village.mp3` |
| `train.mp3` | `transport/inside-a-train.mp3` |
| `temple.mp3` | `places/temple.mp3` |

Write this as a small idempotent script at `scripts/fetch-sounds.sh` (skip files that already exist, fail loudly on HTTP errors) and run it during setup. After downloading, verify each file is nonempty and starts playing (a quick `afplay -t 1` per file is fine). These downloads are for the personal-use build; licensing for a sold product is handled later and is not your concern.

Even with the starter set downloaded, the app must **never hard-code these names** — discovery stays dynamic:
- Scan for `*.mp3`, `*.m4a`, `*.wav`, `*.ogg`.
- Channel id = slugified filename; display name = filename without extension, capitalized.
- Icon: match filename keywords to an icon (mapping table in §6.3); unknown → generic waveform icon.
- If the folder is empty, the mixer section shows a soft hint: "Drop .mp3 loops into the sounds folder" — never an error.

### Git hygiene (do this first)

`fireplace.mp4` is 661 MB — GitHub rejects files over 100 MB. Before anything else, create `.gitignore` containing at minimum:

```
node_modules/
out/
.vite/
dist/
4k loops/
sounds/*
!sounds/.gitkeep
.DS_Store
```

(The `sounds/*` + `!sounds/.gitkeep` pair keeps the empty folder tracked while ignoring every sound file in it.) Never `git add` the media files. Commit in sensible increments as you complete each build step (§9) with clear messages.

## 3. Tech stack (exact)

- **Electron** (latest stable) via **Electron Forge** with the **vite-typescript** template
- **React 18** + **TypeScript** in the renderer
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin
- **No other runtime dependencies.** No electron-store, no redux/zustand, no router library, no UI kit, no howler. State is React hooks + IPC; routing is `window.location.hash`; persistence is plain JSON files.
- Icons: inline SVG (Lucide-style outline paths, copy the paths you need into a local `icons.tsx`) — no icon font, no icon package.

Scaffold (run at repo root; the repo already contains `4k loops/` and this file — scaffold *around* them, don't wipe anything):

```bash
npx create-electron-app@latest campfire-tmp --template=vite-typescript
# move the scaffolded files into repo root (everything except its .git), then delete campfire-tmp
npm install react react-dom
npm install -D @types/react @types/react-dom @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

Wire React + Tailwind into the renderer vite config (`vite.renderer.config.ts`): add `@vitejs/plugin-react` and `@tailwindcss/vite` plugins; add `@import "tailwindcss";` at the top of the renderer CSS entry. Verify with a colored div before building further.

## 4. Process & window architecture

Three renderer windows, one shared renderer bundle, route chosen by URL hash:

| Window | Hash | Visible | Purpose |
|---|---|---|---|
| `popoverWindow` | `#/popover` | on tray click | The control panel UI |
| `sessionWindow` | `#/session` | during video sessions | Fullscreen looping video |
| `audioWindow` | `#/audio` | **never** | Persistent sound-mix engine |

**Main process owns all state** (current mode, scene, mix, presets). Renderers are dumb views that reflect state pushed to them and emit intents. This matters because the popover is destroyed/hidden constantly and must always reopen showing the live state.

### 4.1 Popover window

- Frameless, transparent, non-resizable, `alwaysOnTop: true`, no traffic lights, `show: false` initially, width **380**, height **~640** (grows with content; you may use a fixed 660 and internal scroll for the scene grid beyond 12 tiles).
- Position it directly under the tray icon: on tray `click`, get `tray.getBounds()`, center the window horizontally on the tray icon, y = menu bar bottom + 6px. Toggle visibility on repeated clicks.
- Hide on `blur`. **Trap:** while devtools are open, blur fires constantly — guard with `if (!popover.webContents.isDevToolsOpened())`.
- `visibleOnAllWorkspaces: true` so it opens on whatever Space the user is in.

### 4.2 Session window (video)

- Created on demand, one at a time. `fullscreen: false` + `simpleFullScreen: true` (kiosk-style fullscreen without the macOS Space-switching animation — instant on, instant off, which fits the "instantly chillax" goal), frameless, black `backgroundColor`.
- Place on the display where the cursor currently is (`screen.getCursorScreenPoint()` → `screen.getDisplayNearestPoint()`), sized to its bounds.
- Contains a single `<video>` filling the screen: `autoplay loop`, `object-fit: cover`, `object-position: center`. Fade it in from black over ~600 ms (CSS opacity transition) — the session should *breathe* in, not pop.
- The video's **own audio track** is the "Scene sound" mixer channel: set `video.volume` from the mix (see §5). Do not set `muted`.
- **Esc** closes the session (keydown listener in renderer → IPC `session:stop`). Also close on `sessionWindow` receiving a system close.
- Hide the cursor after 3 s idle over the window (CSS `cursor: none` toggled by a mousemove timer).
- While a session window exists, hold a `powerSaveBlocker.start('prevent-display-sleep')`; stop it when the session ends.
- Stopping a session: fade video opacity + audio gains to 0 over ~400 ms, then destroy the window / stop channels.

### 4.3 Audio window (hidden mixer engine)

- Created lazily on first play, never shown, never destroyed while audio is playing.
- **Critical:** `webPreferences: { backgroundThrottling: false }` — otherwise Chromium throttles the hidden window and audio stutters.
- Runs the Web Audio engine (§5). Receives the full mix on start and per-channel volume changes live.

### 4.4 Main process essentials

- `app.dock?.hide()` — menu bar app, no Dock icon.
- `app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` **before** `app.whenReady()` — without this, `<video autoplay>` and `AudioContext` are blocked and the whole app silently fails.
- App does not quit when windows close (`window-all-closed` → no-op on darwin). Quit only from the tray menu.
- Single-instance lock.

### 4.5 Serving local media — custom protocol (do it exactly like this)

Do **not** use raw `file://` URLs in the renderer and do not disable `webSecurity`. Register a custom stream-capable protocol:

```ts
// before app ready:
protocol.registerSchemesAsPrivileged([
  { scheme: 'campfire', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// after app ready:
protocol.handle('campfire', (request) => {
  const url = new URL(request.url);            // campfire://media/<encoded relative path>
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
  const abs = path.join(ASSETS_ROOT, rel);
  if (!abs.startsWith(ASSETS_ROOT)) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(abs).toString());
});
```

`ASSETS_ROOT` = repo root in dev: `app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()`. **Trap:** every filename here contains spaces — always `encodeURIComponent` each path segment when building `campfire://` URLs in the manifest, and `decodeURIComponent` in the handler. `stream: true` is required or the 661 MB fireplace video won't seek/play.

## 5. Audio engine (in the audio window renderer)

One `AudioContext`. Per channel:

```
<audio src loop crossOrigin> → MediaElementAudioSourceNode → GainNode → masterGain → destination
```

- Use `<audio>` elements (streaming from disk), **not** decoded `AudioBuffer`s — ambience files can be long and decoding them into memory is wasteful.
- Volume changes ramp with `gain.linearRampToValueAtTime(v, ctx.currentTime + 0.15)` — never snap instantly (clicks/pops are the opposite of chill).
- Starting a mix: fade each active channel from 0 to its target over ~400 ms. Stopping: ramp all gains to 0 over 400 ms, then pause the elements.
- A channel with volume 0 should have its `<audio>` paused (don't keep 12 decoders running at zero gain). Resume + ramp on first nonzero volume.
- Master volume channel multiplies everything.
- Perceptual taper: apply `gain = slider^2` so the slider feels linear to the ear.
- The "Scene sound" channel is **not** in this engine — it's the session window's `<video>` volume (also `volume = slider^2`). In audio-only mode, show the Scene sound slider disabled with reduced opacity.

## 6. Popover UI spec (React + Tailwind)

### 6.1 Look & feel — soft, warm, dark

This app must feel like a warm lamp in a dark room, not a settings panel. Global rules:

- Panel: `bg-stone-900/[0.97]`, `rounded-[22px]`, `border border-white/[0.08]`, padding 18px. Body is transparent (the window itself is transparent; the rounded panel floats with a soft `shadow-2xl`).
- Text: headings `text-stone-50`, labels `text-stone-300`, secondary `text-stone-400`, hints `text-stone-500`. Font: `font-[system-ui]` (SF Pro).
- Accent: amber — `amber-400` for the active/ember color, `amber-400/15` for tinted fills, selected ring `ring-2 ring-amber-400`.
- Everything rounded generously: tiles `rounded-2xl`, buttons `rounded-xl`, chips `rounded-full`.
- Every interactive element gets `transition-all duration-200`; tiles `hover:scale-[1.02]`, buttons `active:scale-[0.98]`. Soft, never snappy.
- Section labels: 11px, `tracking-wide`, `text-stone-500`, e.g. `SCENES`, `SOUND MIX`, `PRESETS`.

### 6.2 Layout, top to bottom

1. **Header** — flame mark + "Campfire" (15px, medium) left; a subtle gear icon right (v1: opens the presets JSON in Finder via `shell.showItemInFolder` — that's the whole settings UI for now).
2. **Scene grid** — 3 columns, gap 10px. Each tile: the scene's `pic *.png` as a `rounded-2xl` image (`aspect-[16/10] object-cover`), scene name beneath (11px). Selected tile: amber ring + name brightens to `text-stone-200`. If a session is playing, the playing scene shows a tiny amber dot next to its name.
3. **Sound mix** — one row per discovered channel + "Scene sound" pinned first + "Master" pinned last. Row: 14px icon, label (12px, fixed 88px width), slider filling the rest. Slider: custom-styled `input[type=range]` — 5px track `bg-stone-700` with the filled portion amber (use a CSS gradient background sized by value, update on input), 15px `bg-stone-50` round thumb, no native appearance. Show more than 6 channels behind a "more channels" disclosure (chevron, expands in place).
4. **Presets** — horizontal chip row, wrap. Active preset chip: `bg-amber-400/15 text-amber-300`; others `border border-stone-700 text-stone-400`. Last chip is `+ save` — saves current scene+mix; a tiny inline text input appears in place for the name (Enter confirms, Esc cancels). Right-click a chip → small custom context menu: *Set as default*, *Overwrite with current*, *Delete*. Default preset shows a tiny filled star.
5. **Action row** — two equal buttons: **Start session** (`bg-amber-400 text-amber-950 font-medium`, becomes **Stop session** with a `bg-stone-700` style while video session is active) and **Audio only** (`border border-stone-600 text-stone-300`, becomes **Stop audio** while audio-only is active).
6. **Footer hint** — 11px `text-stone-500`, centered: "Right-click the menu bar icon to resume instantly".

### 6.3 Sound channel icon mapping

Match the first keyword found in the filename (case-insensitive): rain→cloud-rain, thunder/storm→cloud-lightning, fire/crackle→flame, bird→bird/feather, cricket→bug, chime→bell, wind→wind, leaves/rustle→leaf, stream/river/water→waves, wave/ocean/sea→waves, street/city→buildings, train→train, snow→snowflake, night→moon, cafe/people→coffee. Fallback: audio-waveform.

## 7. Behavior spec

### 7.1 Tray

- Template (monochrome) 16×16 icon — a simple flame/campfire glyph you generate as PNG (`icon-Template.png` + `@2x`) so it adapts to light/dark menu bars. While anything is playing, swap to a subtly filled variant.
- **Left-click**: toggle popover.
- **Right-click**: native context menu: "Resume last session" (starts the last-used preset/scene+mix as a full video session; disabled if none yet), "Start default preset", "Audio only (default preset)", separator, "Stop", separator, "Quit Campfire".

### 7.2 Modes & state machine (in main)

`mode: 'stopped' | 'video' | 'audioOnly'`, plus `currentSceneId`, `mix: Record<channelId, number>`, `lastSession` (persisted). Rules:

- **Start session** (from popover or tray): opens session window with selected scene, starts audio mix, mode=video. If already in audioOnly, the audio keeps playing seamlessly — do not restart channels, just open the video.
- **Audio only**: starts mix without video, mode=audioOnly. If in video mode, closing into audio-only keeps audio running and closes the window.
- **Stop**: fades everything out, mode=stopped, persists `lastSession`.
- Changing the selected scene while a video session is live switches the session window's video in place (fade through black, ~300 ms).
- Any volume slider change while playing applies live (IPC → audio window / session window) *and* updates the in-memory mix.
- All state changes push a full `state` snapshot to the popover (if open) so UI never drifts.
- On system sleep (`powerMonitor` 'suspend'): stop playback gracefully.

### 7.3 Persistence

Two JSON files in `app.getPath('userData')`, read on launch, written debounced (500 ms) on change, always written atomically (write temp + rename):

- `presets.json`: `[{ id, name, sceneId, mix, isDefault }]`
- `state.json`: `{ lastSession: { sceneId, mix, mode } | null, settings: { dimOtherDisplays: boolean, showClock: boolean, videoDimmer: number } }` (defaults: `true`, `false`, `0`)

Seed on first run with one preset: `{ name: "Cozy cabin", sceneId: "fireplace", mix: { "scene-sound": 0.7 }, isDefault: true }` (guard: only if `fireplace` exists in the manifest).

### 7.4 IPC contract (exact channel names)

Renderer → main (invoke): `manifest:get` → `{ scenes, sounds }` · `state:get` → full state snapshot · `session:start {sceneId, mix}` · `session:stop` · `audio:start {mix}` · `audio:stop` · `mix:set {channelId, value}` · `scene:select {sceneId}` · `presets:*` (list/save/delete/setDefault/apply) · `player:pause` / `player:resume` · `timer:set {minutes | null}` · `settings:set {key, value}`.
Main → renderer (send): `state:changed {state}` (popover) · `audio:apply {mix} / audio:volume {channelId, value} / audio:fadeOutAndStop` (audio window) · `video:volume {value} / video:switch {videoUrl}` (session window).

Preload exposes a typed `window.campfire` API wrapping these; `contextIsolation: true`, `nodeIntegration: false` everywhere.

### 7.5 UX niceties (all required, not optional)

1. **Global hotkey** — `globalShortcut.register('Alt+Cmd+C')`: if stopped → start the default preset as a video session; if playing → stop (with the usual fade). One key from anywhere on the system into a session and back. Unregister on quit. If registration fails (conflict), log and continue — never crash.
2. **Pause/resume + media keys** — a `paused: boolean` orthogonal to `mode`. Pausing fades gains to 0 over 200 ms then pauses all `<audio>` elements and the session `<video>`; resuming plays and ramps back. Wire it to the Mac media keys via the MediaSession API in the audio window: set `navigator.mediaSession.metadata` to `"Campfire — <scene name>"` with the scene thumbnail as artwork, and register `play`/`pause` action handlers that call `player:resume`/`player:pause`. The keyboard ⏯ key then controls Campfire like a music app. (Trap: at least one `<audio>` element must be actively playing for macOS to route media keys — that's already true whenever a mix is live.)
3. **Sleep timer** — `timer:set` with 15/30/60/90 minutes. Main holds a single timeout; when it fires, fade everything out over **10 s** (not the usual 400 ms — this is the fall-asleep path) and stop. UI: a moon-timer icon button in the popover header that cycles Off → 15 → 30 → 60 → 90 → Off, showing the remaining minutes as a tiny amber label when armed; also available in the session overlay. Starting/stopping a session clears the timer.
4. **Session hover overlay** — in the fullscreen session, moving the mouse reveals a minimal pill, bottom-center (`bg-stone-900/70 backdrop-blur rounded-full`, fades in/out 200 ms, auto-hides with the cursor after 3 s): scene name · pause/play · sleep-timer button · dimmer slider · clock toggle · stop (X). Everything reachable without leaving immersion; Esc still exits directly.
5. **Video dimmer** — a full-screen black overlay div in the session window, opacity 0–0.6 driven by the overlay's dimmer slider (`settings.videoDimmer`, persisted). Late-night sessions shouldn't require squinting at a bright 4K video.
6. **Clock** — optional minimal clock in the session view, top-right: `HH:MM`, 20px, `text-stone-200/70`, thin weight. Toggled from the overlay, persisted as `settings.showClock`. The point: user never leaves the session to check the time.
7. **Dim other displays** — when a session starts and `settings.dimOtherDisplays` is true (default), cover every *other* display with a plain black frameless fullscreen window (click-through not required; they close with the session). Toggle lives in the tray right-click menu ("Dim other displays" checkbox). Single-display users are unaffected.
8. **Launch at login** — checkbox item in the tray right-click menu using `app.setLoginItemSettings({ openAtLogin })` / read via `getLoginItemSettings()`. No custom persistence — the OS is the source of truth.
9. **Popover keyboard navigation** — while the popover is open: arrow keys move scene selection through the grid, Enter starts a video session with the selection, Esc closes the popover. Focus ring = the same amber ring as click-selection.

## 8. Traps checklist (each of these will sink the app if ignored)

1. `autoplay-policy` switch (§4.4) — without it: black video, silent audio, no errors.
2. `backgroundThrottling: false` on the audio window (§4.3) — without it: stuttering when popover closes.
3. `stream: true` + `net.fetch(pathToFileURL(...))` in the protocol (§4.5) — without it: large videos never load/seek.
4. Spaces in every asset filename — encode/decode URI components religiously.
5. Popover blur-hide vs devtools (§4.1).
6. Never `git add` media folders (§2).
7. Gain ramps everywhere, never instant volume snaps (§5).
8. `simpleFullScreen`, not `fullscreen` (§4.2) — the macOS fullscreen-Space animation kills the "instant" feel.
9. Ignore `rainy coast.mov`; scan only `.mp4`.
10. Dock hidden, app keeps running with zero windows open.

## 9. Build order & self-verification

Build in this order and verify each step yourself before moving on (run `npm start`, check the listed behavior):

1. **Scaffold** — Forge vite-ts + React + Tailwind render a styled div. Commit.
2. **Tray + popover shell** — icon appears, click toggles a positioned rounded dark panel, blur hides it. Commit.
3. **Manifest + scene grid** — real thumbnails render in the grid via `campfire://`, selection works. Commit.
4. **Session window** — Start session plays the selected 4K video fullscreen, loops seamlessly, Esc exits, cursor hides, display never sleeps. Scene sound slider controls video volume live. Commit.
5. **Audio engine** — run `scripts/fetch-sounds.sh` (§2), then: all 17 starter channels appear with correct icons, play, loop, respond to sliders live; also verify the graceful empty state by temporarily pointing at an empty folder. Audio-only mode survives popover close and long background periods. Commit.
6. **State machine + tray menu + presets + persistence** — full §7 behavior, relaunch restores presets, right-click → Resume works end-to-end. Commit.
7. **UX niceties (§7.5)** — global hotkey, pause/resume + media keys, sleep timer with 10 s fade, session hover overlay with dimmer/clock, dim other displays, launch at login, popover keyboard nav. Commit.
8. **Polish pass** — fades (video in/out, audio in/out, scene switch), hover/active transitions, empty states, the amber "playing" dot, tray icon active state. Commit.

Definition of done: every behavior in §7 works; every trap in §8 is handled; `npm start` from a fresh `npm install` reaches a working app with zero console errors in all three windows.

## 10. Out of scope for v1 (do not build)

Packaging/signing/notarization/DMG · auto-update · onboarding · analytics · preferences window · downloading assets from a CDN · Windows/Linux · desktop-wallpaper mode (planned v2: session window behind desktop icons) · custom/remappable hotkeys (v1 ships the single fixed `⌥⌘C`) · scene auto-rotation/shuffle (v2 candidate).
