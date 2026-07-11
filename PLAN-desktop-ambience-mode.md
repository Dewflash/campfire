# PLAN: Desktop ambience mode (rank 4)

**Execution order:** run AFTER PLAN-instant-session-start (this plan builds on its `createSessionWindow` / `sessionWindowIdle` / `activateSessionWindow` structure and its `posterUrl` field). Do not attempt it against the pre-plan-1 codebase.
**Effort:** ~1 day. **Files touched:** `src/types.ts`, `src/main.ts`, `src/renderer.tsx`, `src/icons.tsx`. Nothing else.

## Goal

A third way to run a session: the scene video plays as a **desktop wallpaper** — behind all app windows and behind the desktop icons — while the user works, with the sound mix running as usual. This completes the product story: fullscreen for full immersion, desktop mode for ambient-while-working, audio-only for sound-only. (The spec calls this out as the planned v2 flagship: "desktop-wallpaper mode — session window behind desktop icons".)

Mechanics: a new `AppMode` value `'desktop'`; the session window for this mode is created with Electron's macOS `type: 'desktop'`, which places it at desktop level (below icons, below every normal window), is non-focusable, and receives no mouse/keyboard input. Control happens from the popover, tray menu, media keys, or the ⌥⌘C hotkey.

## Step 0 — feasibility gate (do this before writing the feature)

`type: 'desktop'` behavior varies across macOS versions. Verify it first with a throwaway check: in `app.whenReady`, temporarily create

```ts
const probe = new BrowserWindow({ type: 'desktop', frame: false, backgroundColor: '#ff0000', x: 0, y: 0, width: 600, height: 400, show: true });
```

run `npm start`, and confirm a red rectangle is visible **on the desktop, under a Finder window you drag over it, with desktop icons above it**. Delete the probe code afterwards.

**If the red rectangle is not visible at all: STOP. Do not improvise alternative window levels. Report "type: 'desktop' not visible on this macOS version" and end the task.** Everything below assumes the probe passed.

## Step-by-step

### Step 1 — `src/types.ts`

1. `export type AppMode = 'stopped' | 'video' | 'audioOnly' | 'desktop';`
2. Add and export a helper used by both processes:

```ts
export function isVideoMode(mode: AppMode): boolean {
  return mode === 'video' || mode === 'desktop';
}
```

3. In `CampfireApi`, change `startSession` payload to `{ sceneId: string; mix: Mix; kind?: 'fullscreen' | 'desktop' }`. Mirror the same payload type in `src/preload.ts`'s `startSession`.

### Step 2 — `src/main.ts`: mode plumbing

Import `isVideoMode` from `./types`.

1. Add module state: `let sessionWindowKind: 'fullscreen' | 'desktop' = 'fullscreen';`
2. `startVideoSession` gains a third parameter:

```ts
async function startVideoSession(sceneId: string, mix: Mix, kind: 'fullscreen' | 'desktop' = 'fullscreen') {
```

Inside it, replace `mode = 'video';` with `mode = kind === 'desktop' ? 'desktop' : 'video';` and pass `kind` through to `ensureSessionWindow(scene, kind)`.

3. The `session:start` IPC handler passes it through: `startVideoSession(payload.sceneId, payload.mix, payload.kind ?? 'fullscreen')`.

### Step 3 — `src/main.ts`: window creation per kind

1. Give `createSessionWindow` a `kind: 'fullscreen' | 'desktop'` parameter. For `'desktop'`, the options differ:

```ts
const window = new BrowserWindow({
  ...(kind === 'desktop' ? { type: 'desktop' as const, focusable: false } : {}),
  x: 0, y: 0, width: 800, height: 600,
  show: false,
  frame: false,
  fullscreen: false,
  backgroundColor: '#000000',
  skipTaskbar: true,
  webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
});
if (kind === 'desktop') {
  window.setIgnoreMouseEvents(true);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
}
```

Set `sessionWindowKind = kind;` right after creation. Keep the existing `close`/`closed` handlers and `sessionReady` assignment, but the `close` handler's guard becomes `if (!isQuitting && isVideoMode(mode))`.

2. `prewarmSessionWindow()` always pre-warms `'fullscreen'` kind (`createSessionWindow('fullscreen')`). Desktop windows are never pre-warmed — `type` cannot be changed after construction.

3. `activateSessionWindow(scene)` branches on `sessionWindowKind`:
   - `'fullscreen'`: exactly as today (setBounds → sendVideoSwitch → show → `setSimpleFullScreen(true)` → `startPowerSaveBlocker()` → `refreshDimWindows(...)`).
   - `'desktop'`: setBounds to `targetDisplayForSession().bounds` → sendVideoSwitch → `showInactive()` — then STOP. **No `setSimpleFullScreen` (breaks desktop level), no power-save blocker (the user is working; normal display sleep must stay in effect), no dim windows.**

4. `ensureSessionWindow(scene, kind)` logic:

```ts
async function ensureSessionWindow(scene: SceneManifest, kind: 'fullscreen' | 'desktop') {
  const liveActive = sessionWindow && !sessionWindow.isDestroyed() && !sessionWindowIdle;
  if (liveActive && sessionWindowKind === kind) {
    sendVideoSwitch(scene);
    sendVideoVolume();
    return sessionWindow;
  }
  if (sessionWindow && !sessionWindow.isDestroyed() && (liveActive || kind === 'desktop')) {
    sessionWindow.destroy(); // wrong kind (or idle window unusable for desktop): hard-cut replace
  }
  if (!sessionWindow || sessionWindow.isDestroyed()) {
    sessionWindow = createSessionWindow(kind);
    sessionWindowIdle = true;
  }
  await activateSessionWindow(scene);
  return sessionWindow;
}
```

(Switching fullscreen↔desktop mid-session is a hard cut with continuous audio — accepted behavior; do not build a crossfade between windows.)

### Step 4 — `src/main.ts`: audit every `mode === 'video'` site

Go through **all** of these and apply exactly this table. This audit is the core of the plan — missing one produces subtle bugs:

| Location | Change |
|---|---|
| `sendVideoVolume()` condition | `mode === 'video'` → `isVideoMode(mode)` |
| `setMixValue` video check | `mode === 'video'` → `isVideoMode(mode)` |
| `selectScene` live-switch check | `mode === 'video'` → `isVideoMode(mode)` |
| `applyPreset` video branch | `if (mode === 'video' && currentSceneId)` → `if (isVideoMode(mode) && currentSceneId)` and call `startVideoSession(currentSceneId, currentMix, mode === 'desktop' ? 'desktop' : 'fullscreen')` |
| session window `close` handler | `mode === 'video'` → `isVideoMode(mode)` (done in step 3.1) |
| `destroySessionWindowAfter` skip-guard | `mode === 'video'` → `isVideoMode(mode)` |
| `refreshDimWindows` guard | **keep** `mode !== 'video'` (desktop mode must never dim other displays) |
| tray `'Resume last session'` click | `startVideoSession(lastSession.sceneId, lastSession.mix, lastSession.mode === 'desktop' ? 'desktop' : 'fullscreen')` |
| `buildTrayMenu` `'Stop'` enabled | already `mode !== 'stopped'` — no change |
| `updateTray` active icon | already `mode !== 'stopped'` — no change |
| global hotkey | no change (stopped → default preset fullscreen; anything playing → stop) |
| `startAudioOnly` | no change (its `destroySessionWindowAfter` already tears down whatever session window exists) |
| `runSmokeTest` `videoModeWorks` | no change (fullscreen path) — desktop gets its own check, step 7 |

### Step 5 — `src/icons.tsx`: MonitorIcon

Add, following the exact pattern of the existing icons (same `IconProps`/stroke conventions in that file):

```tsx
export function MonitorIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
      <rect height="14" rx="2" width="20" x="2" y="3" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
```

(Open `src/icons.tsx` first and match its actual prop type/name — if the file uses a different shared props shape, follow the file, not this snippet.)

### Step 6 — `src/renderer.tsx`: UI

Import `isVideoMode` from `./types` and `MonitorIcon` from `./icons`.

1. **Action row** in `PopoverApp`: change the footer grid from `grid-cols-2` to `grid-cols-[1fr_auto_1fr]` and insert a desktop button between the two existing buttons:

```tsx
<button
  className={`flex h-10 w-11 items-center justify-center rounded-xl text-[13px] transition-all duration-200 active:scale-[0.98] ${
    state.mode === 'desktop'
      ? 'bg-amber-400/15 text-amber-300'
      : 'border border-stone-600 text-stone-300 hover:border-stone-500 hover:bg-white/5'
  }`}
  disabled={!selectedScene}
  title={state.mode === 'desktop' ? 'Stop desktop session' : 'Play on desktop (behind your windows)'}
  type="button"
  onClick={() =>
    state.mode === 'desktop'
      ? void window.campfire.stopSession().then(setState)
      : selectedScene &&
        void window.campfire.startSession({ sceneId: selectedScene.id, mix: currentMix, kind: 'desktop' }).then(setState)
  }
>
  <MonitorIcon size={16} />
</button>
```

2. **Start session button**: when `state.mode === 'desktop'`, its label becomes `'Fullscreen'` and clicking it starts the same scene fullscreen (`startSession` without `kind`), which hard-switches the window while audio continues. Exact ternary for the label: `state.mode === 'video' ? 'Stop session' : state.mode === 'desktop' ? 'Fullscreen' : 'Start session'`. The onClick: `state.mode === 'video'` → stop; otherwise → start (this already does the right thing for desktop→fullscreen).

3. **Scene tile playing dot** (and the hover stop-glyph if PLAN-one-touch-play landed): condition becomes `isVideoMode(state.mode) && state.currentSceneId === scene.id`.

4. **SessionView**: replace every `state.mode !== 'video'` / `state.mode === 'video'` with `!isVideoMode(state.mode)` / `isVideoMode(state.mode)` (there are three: the video-load mount effect from plan 1, the target-volume expression, and the fade-out branch; also the poster opacity style). Then gate the interactive chrome off in desktop mode — desktop windows receive no input, so showing UI there is dead weight:

```tsx
const isDesktop = state.mode === 'desktop';
```

- Skip rendering the clock div and the bottom overlay pill entirely when `isDesktop`.
- In `showOverlay`, return early when the current state ref says desktop (simplest: guard the `onMouseMove={showOverlay}` prop: `onMouseMove={isDesktop ? undefined : showOverlay}` and don't call `showOverlay()` from the mount effect when desktop — a stale overlay timer on a window that gets no mouse events is harmless but sloppy).
- Keep the Esc keydown listener as-is (it never fires — the window can't take focus — and removing it conditionally adds complexity for nothing).

### Step 7 — `src/main.ts`: deep-smoke coverage

In `runSmokeTest`, inside the `CAMPFIRE_DEEP_SMOKE === '1'` block, after the audio-only check and its `stopPlayback(100)`, add:

```ts
await startVideoSession(scene.id, { [MASTER_ID]: 1, [SCENE_SOUND_ID]: 0 }, 'desktop');
await new Promise((resolve) => setTimeout(resolve, 1200));
desktopModeWorks = mode === 'desktop' && Boolean(sessionWindow && !sessionWindow.isDestroyed() && sessionWindow.isVisible());
await stopPlayback(100);
await new Promise((resolve) => setTimeout(resolve, 250));
```

Declare `let desktopModeWorks = true;` next to the other flags, set it `false` in the no-scene `else` branch, add it to the `result` object and to the final `ok` conjunction.

## Edge cases a weaker model would miss

- **Desktop windows cannot be re-typed.** `type` is constructor-only. That is why: pre-warm is fullscreen-only, kind switches destroy+recreate, and `ensureSessionWindow` must compare `sessionWindowKind`.
- **`showInactive()`, not `show()`** for the desktop window — `show()` on a non-focusable window is mostly harmless but can flicker focus; `showInactive` is the correct call and also keeps the popover from losing focus mid-click.
- **No power-save blocker in desktop mode.** Holding `prevent-display-sleep` while the user "works with ambience" would stop their display from ever sleeping. Fullscreen keeps the blocker; desktop must not take it. (`stopPlayback` already stops the blocker unconditionally, so no leak either way.)
- **No dim windows in desktop mode** — `refreshDimWindows` keeps its strict `mode !== 'video'` early-return. Dimming other displays while the user is working would be actively hostile.
- **Pause in desktop mode**: with plan 1's poster layer, pausing shows the scene's still as wallpaper (video hides, poster stays). Confirm the poster opacity style was switched to `isVideoMode(state.mode)` or pause in desktop mode fades the wallpaper to black instead.
- **`lastSession.mode` can now be `'desktop'` on disk.** Old builds reading it are not a concern (forward-only), but `stopPlayback` stores `mode` as-is — verify tray "Resume last session" maps it via the table in step 4 or resume silently downgrades to fullscreen.
- **The idle pre-warmed window after a desktop session stops**: `destroySessionWindowAfter` destroys the desktop window and `prewarmSessionWindow()` replenishes a *fullscreen* idle window. That is correct — next desktop start destroys it again (cheap, hidden). Do not "optimize" by pre-warming desktop windows.
- **`focusable: false` + `skipTaskbar`** keep the desktop window out of Mission Control's window list and cmd-tab. Don't remove them.

## Acceptance criteria

1. Step 0 probe verified and its code removed (search the diff for `probe` — zero hits).
2. `npm run typecheck` and `npm run lint` pass; `CAMPFIRE_DEEP_SMOKE=1 npm run smoke` exits 0 including the new `desktopModeWorks` flag in the printed `CAMPFIRE_SMOKE_RESULT` line.
3. `npm start` → popover → select a scene → click the monitor button: video appears as the desktop wallpaper — **behind** a Finder window dragged across it and **behind** desktop icons; sound mix plays; the wallpaper video is click-through (clicking it hits the desktop).
4. Popover reopens showing the monitor button amber-active and the playing dot on the scene tile; sliders still change volume live; media-key pause shows a frozen poster wallpaper, resume brings the video back.
5. Clicking "Fullscreen" while desktop mode plays switches to a fullscreen session without an audio gap; Esc returns to stopped.
6. Clicking the monitor button while a fullscreen session plays switches to desktop mode without an audio gap.
7. Tray → Stop fades everything out; "Resume last session" after a desktop session resumes in desktop mode.
8. Display sleep still engages during a desktop session (System Settings → Lock Screen timing honored) — leave the machine idle and confirm, or verify `powerSaveBlockerId === null` via a temporary log line (removed before commit).

Commit as: `feat: desktop ambience mode (wallpaper sessions)`
