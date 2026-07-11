# PLAN: Instant session start (rank 1 — highest leverage)

**Execution order:** run this plan first. It is independent of the other plans.
**Effort:** ~half a day. **Files touched:** `src/main.ts`, `src/renderer.tsx`, `src/types.ts`. Nothing else.

## Goal

Clicking **Start session** must feel instant. Today the flow is: create a BrowserWindow → load the renderer bundle → fetch state → load a 4K video (up to 661 MB) → fade in. That is 1–3 seconds of black screen, which contradicts the entire product promise ("click the icon and be instantly inside a cozy session").

Fix with three mechanisms:

1. **Pre-warmed session window** — a hidden, already-loaded session window always exists while the app is idle, so starting a session is "set bounds → send video URL → show", not "create window → load bundle".
2. **Poster-first rendering** — the moment the session window shows, it displays the scene's full-resolution thumbnail PNG full-screen; the video crossfades in on top once it actually renders frames. The user sees the cozy scene in <300 ms even while the 4K video is still buffering.
3. **Pre-warmed audio window** — created at launch instead of on first play (it creates zero `<audio>` elements until told to play, so this is cheap).

After a session stops, the old window is destroyed (as today) and a **fresh** pre-warmed window is created immediately, so the *next* start is also instant.

## Step-by-step

### Step 1 — `src/types.ts`: add poster URL

1. In `SceneManifest`, add field: `posterUrl: string | null;` (place it after `thumbnailUrl`).
2. In `CampfireApi`, change the `onVideoSwitch` callback payload type from `{ videoUrl: string }` to `{ videoUrl: string; posterUrl: string | null }`.

`src/preload.ts` needs the same payload-type change on its `onVideoSwitch` line (the implementation is generic; only the TypeScript type changes).

### Step 2 — `src/main.ts`: emit poster URLs

In `scanManifest()`, in the scenes `.map(...)`, add to the returned object:

```ts
posterUrl: hasThumbnail ? mediaUrl('4k loops', thumbnailName) : null,
```

**Trap:** do NOT reuse `thumbnailUrl` for the poster. `thumbnailUrl` points at the 420-px-wide cached resize (`campfire://cache/...`) which looks blurry full-screen. The poster must be the **original** PNG via `campfire://media/...`.

### Step 3 — `src/main.ts`: session-window lifecycle refactor

Add module-level state next to the existing window variables:

```ts
let sessionWindowIdle = false;
let sessionReady: Promise<void> | null = null;
```

Add a helper used by every place that sends `video:switch`:

```ts
function sendVideoSwitch(scene: SceneManifest) {
  if (sessionWindow && !sessionWindow.isDestroyed()) {
    sessionWindow.webContents.send('video:switch', { videoUrl: scene.videoUrl, posterUrl: scene.posterUrl });
  }
}
```

Extract window creation from `ensureSessionWindow` into:

```ts
function createSessionWindow() {
  const window = new BrowserWindow({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    show: false,
    frame: false,
    fullscreen: false,
    backgroundColor: '#000000',
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.on('close', (event) => {
    if (!isQuitting && mode === 'video') {
      event.preventDefault();
      void stopPlayback();
    }
  });
  window.on('closed', () => {
    sessionWindow = null;
    sessionWindowIdle = false;
    sessionReady = null;
    stopPowerSaveBlocker();
  });
  sessionReady = rendererRoute(window, '/session').then((): void => undefined);
  return window;
}
```

**Trap:** the old constructor options included `simpleFullscreen: true`. Do NOT include it here — a hidden pre-warmed window must not hold fullscreen presentation state (it can hide the menu bar while idle). Simple fullscreen is entered only at activation time via `setSimpleFullScreen(true)` (as the current code already does post-show).

Add:

```ts
function prewarmSessionWindow() {
  if (isQuitting || (sessionWindow && !sessionWindow.isDestroyed())) {
    return;
  }
  sessionWindow = createSessionWindow();
  sessionWindowIdle = true;
}

async function activateSessionWindow(scene: SceneManifest) {
  await sessionReady;
  if (!sessionWindow || sessionWindow.isDestroyed()) {
    sessionWindow = createSessionWindow();
    sessionWindowIdle = true;
    await sessionReady;
    if (!sessionWindow || sessionWindow.isDestroyed()) {
      return;
    }
  }
  const targetDisplay = targetDisplayForSession();
  sessionWindow.setBounds(targetDisplay.bounds);
  sendVideoSwitch(scene);
  sessionWindow.show();
  sessionWindow.setSimpleFullScreen(true);
  sessionWindowIdle = false;
  startPowerSaveBlocker();
  refreshDimWindows(targetDisplay.id);
}
```

Replace the body of `ensureSessionWindow(scene)` with:

```ts
async function ensureSessionWindow(scene: SceneManifest) {
  if (sessionWindow && !sessionWindow.isDestroyed() && !sessionWindowIdle) {
    sendVideoSwitch(scene);
    sendVideoVolume();
    return sessionWindow;
  }
  if (!sessionWindow || sessionWindow.isDestroyed()) {
    sessionWindow = createSessionWindow();
    sessionWindowIdle = true;
  }
  await activateSessionWindow(scene);
  return sessionWindow;
}
```

In `selectScene()`, replace the manual `sessionWindow.webContents.send('video:switch', ...)` with `sendVideoSwitch(scene)` (keep the surrounding `mode === 'video'` guard and the `sendVideoVolume()` call).

In `destroySessionWindowAfter(fadeMs, generation)`, after the existing destroy/cleanup lines inside the timeout, add re-warm:

```ts
closeDimWindows();
stopPowerSaveBlocker();
prewarmSessionWindow();   // ← new line, last in the timeout callback
```

(`prewarmSessionWindow` self-guards against `isQuitting` and an existing window, so no extra conditions are needed.)

In `app.whenReady().then(...)`, after `registerGlobalHotkey();`, add:

```ts
setTimeout(() => {
  prewarmSessionWindow();
  void ensureAudioWindow();
}, 1500);
```

(1.5 s delay so tray + popover appear first; do not pre-warm synchronously at launch.)

### Step 4 — `src/main.ts`: fix the smoke test assertions

The deep smoke test currently asserts windows are **destroyed**; with pre-warming, hidden idle windows legitimately exist. Update `runSmokeTest()`:

- `stoppedSelectKeepsPlaybackClosed` becomes:

```ts
stoppedSelectKeepsPlaybackClosed =
  mode === 'stopped' &&
  Boolean(!sessionWindow || sessionWindow.isDestroyed() || !sessionWindow.isVisible());
```

(drop the `audioWindow` clause entirely — the audio window may exist pre-warmed; `mode === 'stopped'` is the real invariant.)

- `videoModeWorks` becomes:

```ts
videoModeWorks = mode === 'video' && Boolean(sessionWindow && !sessionWindow.isDestroyed() && sessionWindow.isVisible());
```

- Both `stopWorks` assignments: replace `Boolean(!sessionWindow || sessionWindow.isDestroyed())` with `Boolean(!sessionWindow || sessionWindow.isDestroyed() || !sessionWindow.isVisible())`.

**Trap:** always check `isDestroyed()` **before** calling `isVisible()` — calling `isVisible()` on a destroyed window throws. The `||` short-circuit order above is load-bearing.

### Step 5 — `src/renderer.tsx`: poster-first SessionView

All changes inside `SessionView`.

1. New state/refs:

```ts
const [posterUrl, setPosterUrl] = useState<string | null>(null);
const [videoReady, setVideoReady] = useState(false);
const videoUrlRef = useRef<string | null>(null);
```

Keep `videoUrlRef` in sync: everywhere `setVideoUrl(x)` is called, also set `videoUrlRef.current = x` on the line before.

2. Replace the initial-mount effect (the one that does `if (scene?.videoUrl && !videoUrl)`) with a mode-guarded version — **this is critical**: without the mode guard, the pre-warmed idle window would autoplay a hidden 4K video forever, burning CPU/battery:

```ts
useEffect(() => {
  if (state?.mode === 'video' && scene?.videoUrl && !videoUrl) {
    setPosterUrl(scene.posterUrl);
    setVideoReady(false);
    videoUrlRef.current = scene.videoUrl;
    setVideoUrl(scene.videoUrl);
    window.setTimeout(() => setVideoVisible(true), 80);
  }
}, [scene, state?.mode, videoUrl]);
```

3. Replace `switchVideo` with:

```ts
const switchVideo = useCallback((nextUrl: string, nextPoster: string | null) => {
  setPosterUrl(nextPoster);
  if (nextUrl === videoUrlRef.current) {
    setVideoVisible(true);
    return;
  }
  setFadeDuration(300);
  setVideoVisible(false);
  setVideoReady(false);
  window.setTimeout(() => {
    videoUrlRef.current = nextUrl;
    setVideoUrl(nextUrl);
    window.requestAnimationFrame(() => {
      setFadeDuration(300);
      setVideoVisible(true);
    });
  }, 300);
}, []);
```

Update the subscription: `window.campfire.onVideoSwitch(({ videoUrl: nextUrl, posterUrl: nextPoster }) => switchVideo(nextUrl, nextPoster))`.

4. Render the poster **under** the video. Explicit z-index on every layer (required — today the layers rely on DOM order, and mixing positioned/unpositioned layers with the new poster breaks paint order):

```tsx
{posterUrl && (
  <img
    alt=""
    draggable={false}
    src={posterUrl}
    className="absolute inset-0 z-0 h-full w-full object-cover object-center transition-opacity ease-out"
    style={{ opacity: state.mode === 'video' ? 1 : 0, transitionDuration: `${fadeDuration}ms` }}
  />
)}
```

Place it immediately before the `<video>`. Then:

- `<video>`: add `relative z-10` to its className, and change the opacity condition to `videoVisible && videoReady && !state.paused ? 'opacity-100' : 'opacity-0'`, and add prop `onPlaying={() => setVideoReady(true)}`.
- Dimmer overlay div: add `z-20` to its className.
- Clock div: add `z-30`.
- Bottom overlay pill div: add `z-30`.

**Why `videoReady`:** fading the video in before it renders frames shows black over the poster. `onPlaying` fires when frames are actually being presented, so the crossfade always goes poster → real footage.

**Why poster fades on `state.mode`:** on stop, mode flips away from `'video'` in the same broadcast that fades the video out, so the poster fades to black over `fadeOutMs` together with it. On **pause**, mode stays `'video'`, so the video hides but the poster remains — pausing now shows a still of the scene instead of a black screen (intentional improvement).

## Edge cases a weaker model would miss

- **Idle window must never autoplay** — the mode guard in step 5.2 is the fix; verify with Activity Monitor (idle Campfire renderer ~0% CPU).
- **Lost `video:switch` race:** `activateSessionWindow` sends `video:switch` right after `sessionReady` resolves; React effects may not have subscribed yet. This is tolerated by design: the mount effect (step 5.2) redundantly loads the video from state (`mode === 'video'` by then, `broadcastState()` at the end of `startVideoSession` re-triggers it). Do not "fix" the race by adding delays.
- **`isVisible()` on destroyed windows throws** — short-circuit order in smoke assertions (step 4).
- **`simpleFullscreen` must not be a constructor option** on the pre-warmed window (step 3 trap).
- **Re-warm after stop must go through `destroySessionWindowAfter`'s generation guard** — do not pre-warm inside `stopPlayback` directly, or a start issued during the fade will race the fresh window.
- **`posterUrl` must be the original PNG**, not the 420-px cache (step 2 trap).
- **Scenes without thumbnails** (`posterUrl: null`): everything must still work — poster layer simply not rendered, black-to-video as today.
- **Do not await `channel`/media readiness in `activateSessionWindow` beyond `sessionReady`** — showing the window with the poster before the video is ready is the entire point.

## Acceptance criteria

1. `npm run typecheck` and `npm run lint` pass with zero errors.
2. `CAMPFIRE_DEEP_SMOKE=1 npm run smoke` exits 0 (echo `$?` to prove it).
3. `npm start`, wait 3 s, click **Start session**: scene imagery (poster) is visible in well under half a second; video crossfades in with no black flash between poster and video.
4. Press Esc, immediately click **Start session** again: still instant (fresh pre-warmed window).
5. While a session plays, click a different scene tile in the popover: transition shows the new scene's poster, then its video — no black flash.
6. Pause (media key or overlay button): screen shows the scene's still poster, not black. Resume: video fades back.
7. `npm start`, do NOT start a session, wait 30 s: Activity Monitor shows Campfire renderer processes near 0% CPU (idle window is not decoding video).
8. Quit from the tray menu while a session plays: app exits, no orphan Campfire processes (`pgrep -f Campfire` after quit).

Commit as: `feat: prewarm session window and poster-first start`
