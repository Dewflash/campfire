# PLAN: Engine bug-fix batch (rank 3)

**Execution order:** independent of the other plans. If PLAN-instant-session-start has already landed, fix 2 and fix 3 below apply unchanged (they touch `AudioEngine`, which that plan does not modify).
**Effort:** ~half a day. **Files touched:** `src/renderer.tsx`, `src/main.ts`. Nothing else.

## Goal

Nine confirmed defects/inefficiencies, each small, fixed in one pass. Numbered so they can be verified independently. Do them in the order listed.

---

### Fix 1 — Esc while naming a preset closes the whole popover

**Where:** `src/renderer.tsx`, `PopoverApp`, the window `keydown` effect.

**Bug:** the handler's `INPUT` branch calls `window.close()` on Escape. So when the user presses Esc to cancel the preset-name input, the input's own handler cancels naming *and* the window handler hides the entire popover.

**Fix:** replace the current `INPUT` branch:

```ts
if (target?.tagName === 'INPUT') {
  if (event.key === 'Escape') {
    window.close();
  }
  return;
}
```

with:

```ts
if (target instanceof HTMLInputElement && target.type === 'text') {
  return; // text inputs (preset name) handle their own keys, including Escape
}
if (target?.tagName === 'INPUT' && event.key !== 'Escape') {
  return; // range sliders: let arrow keys adjust the slider, but Escape still closes the popover
}
```

(The generic Escape handler further down the function still runs and closes the popover for non-text targets.)

---

### Fix 2 — All 17 audio elements are created and preloaded on first play

**Where:** `src/renderer.tsx`, `AudioEngine`, `applyMix`.

**Bug:** the loop calls `ensureChannel(sound)` for **every** discovered sound, even ones at volume 0. Each `ensureChannel` creates an `<audio preload="auto">`, so first play spins up 17 decoders/buffers when typically 1–3 channels are audible. Slows first start and wastes memory.

**Fix:** at the top of the `for (const sound of freshManifest.sounds)` loop body, before `ensureChannel` is called:

```ts
const target = pausedRef.current ? 0 : mixValue(mix, sound.id) ** 2;
if (target === 0 && !channels.current.has(sound.id)) {
  continue;
}
const channel = ensureChannel(sound);
```

(The existing `target` computation moves up; keep the rest of the loop body as-is.)

Also in the same loop, change `await channel.audio.play().catch(console.warn);` to `void channel.audio.play().catch(console.warn);` — awaiting serializes the gain ramps of later channels behind each element's play latency.

---

### Fix 3 — Every slider tick runs `applyMix` twice (full manifest IPC + all-channel loop, ×2)

**Where:** `src/renderer.tsx`, `AudioEngine`, the subscriptions effect.

**Bug:** on each `mix:set`, main sends `audio:volume` **and** broadcasts `state:changed`; both handlers call `applyMix`, which does an IPC `getManifest` round-trip and re-ramps every channel. During a slider drag that's dozens of double-executions per second.

**Fix (two parts):**

**3a.** Replace the `onAudioVolume` handler with a single-channel fast path (no manifest fetch, no full loop):

```ts
const removeVolume = window.campfire.onAudioVolume(({ channelId, value }) => {
  mixRef.current = { ...mixRef.current, [channelId]: value };
  const { master } = ensureContext();
  if (channelId === MASTER_ID) {
    ramp(master.gain, clamp01(value, 1) ** 2, 0.15);
    return;
  }
  const sound = manifestRef.current.sounds.find((item) => item.id === channelId);
  if (!sound) {
    return; // e.g. scene-sound — routed to the session <video>, not this engine
  }
  const target = pausedRef.current ? 0 : clamp01(value) ** 2;
  let channel = channels.current.get(channelId);
  if (!channel) {
    if (target === 0) {
      return;
    }
    channel = ensureChannel(sound);
  }
  if (target > 0) {
    const pendingPause = pauseTimers.current.get(channelId);
    if (pendingPause) {
      window.clearTimeout(pendingPause);
      pauseTimers.current.delete(channelId);
    }
    void channel.audio.play().catch(console.warn);
  }
  ramp(channel.gain.gain, target, 0.15);
  if (target === 0) {
    pauseLater(channelId, channel.audio, 190);
  }
});
```

**3b.** Make the `onStateChanged` handler skip redundant full applies. Add a helper above `AudioEngine`:

```ts
function mixesShallowEqual(a: Mix, b: Mix) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Math.abs(mixValue(a, key) - mixValue(b, key)) > 0.0005) {
      return false;
    }
  }
  return true;
}
```

Replace the `onStateChanged` handler body with:

```ts
const removeState = window.campfire.onStateChanged((state) => {
  const wasPaused = pausedRef.current;
  pausedRef.current = state.paused;
  if (state.mode === 'stopped') {
    fadeOutAndStop(state.fadeOutMs ?? 400);
    return;
  }
  if (state.paused) {
    fadeOutAndStop(200);
    return;
  }
  if (wasPaused || !mixesShallowEqual(state.mix, mixRef.current)) {
    void applyMix(state.mix, 200);
  } else {
    mixRef.current = { ...state.mix };
  }
});
```

**Why this is safe:** `audio:volume` always arrives *before* the matching `state:changed` (main sends it first in `setMixValue`), so by the time the broadcast lands, `mixRef` already equals the new mix and the heavy path is skipped. Any state change that did *not* come through the fast path (preset apply, session start) differs from `mixRef` and still triggers a full `applyMix`.

---

### Fix 4 — Media-key resume is unreliable after pause

**Where:** `src/renderer.tsx`, `AudioEngine`.

**Bug:** `navigator.mediaSession.playbackState` is never set. When pause silences and pauses all `<audio>` elements, macOS can drop or misroute the ⏯ key because Chromium reports no coherent playback state, so resuming from the keyboard sometimes stops working.

**Fix:** add a small helper inside `AudioEngine`:

```ts
const setPlaybackState = useCallback((value: MediaSessionPlaybackState) => {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = value;
  }
}, []);
```

Call it from the `onStateChanged` handler (fix 3b): `setPlaybackState('none')` in the `stopped` branch, `setPlaybackState('paused')` in the paused branch, and `setPlaybackState('playing')` after those two branches (before the shallow-equal check). Also call `setPlaybackState('playing')` at the end of `applyMix` (after `void updateMediaSession()`), covering the `audio:apply` path. Add `setPlaybackState` to the dependency arrays of `applyMix` and the effect.

---

### Fix 5 — Sleep-timer badge shows a stale minute count

**Where:** `src/renderer.tsx`, `TimerButton`.

**Bug:** the remaining-minutes label is computed from `Date.now()` at render time, but nothing re-renders the component while the timer counts down, so it can display "30" for 25 minutes.

**Fix:** re-render on an interval while armed:

```ts
const [, setTick] = useState(0);
useEffect(() => {
  if (!state.timer) {
    return;
  }
  const interval = window.setInterval(() => setTick((value) => value + 1), 30_000);
  return () => window.clearInterval(interval);
}, [state.timer]);
```

(Place at the top of `TimerButton`. `useEffect`/`useState` are already imported in the file.)

---

### Fix 6 — Quitting while playing loses the session ("Resume last session" resumes the wrong thing)

**Where:** `src/main.ts`, the `before-quit` handler.

**Bug:** `lastSession` is only captured in `stopPlayback`. Quit from the tray while playing → the current scene/mix is never recorded, and the debounced state write is only flushed if a timer happens to be pending.

**Fix:** replace the `before-quit` handler body with:

```ts
app.on('before-quit', () => {
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
});
```

(Note both files are now written unconditionally on quit — atomic writes of two tiny JSON files, negligible.)

---

### Fix 7 — Popover pops up on every login when "Launch at login" is enabled

**Where:** `src/main.ts`, `app.whenReady()`.

**Bug:** the popover intentionally shows on manual launch (commit bf51608), but with launch-at-login enabled it also pops over whatever the user is doing at login.

**Fix:** in the `shouldShowPopoverOnLaunch` computation, add a login check:

```ts
const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
const shouldShowPopoverOnLaunch =
  process.env.CAMPFIRE_SHOW_POPOVER === '1' ||
  (!openedAtLogin &&
    process.env.CAMPFIRE_SMOKE_TEST !== '1' &&
    process.env.CAMPFIRE_HIDE_POPOVER_ON_LAUNCH !== '1');
```

**Known limitation (accept it, do not chase it):** on some macOS 13+ setups `wasOpenedAtLogin` is always `false`, in which case behavior is unchanged from today (popover shows). This fix is best-effort by design; do not add heuristics like uptime checks.

---

### Fix 8 — Empty scenes folder shows a bare empty grid

**Where:** `src/renderer.tsx`, `PopoverApp`, scenes section.

**Fix:** mirror the existing sounds empty-state. Wrap the grid:

```tsx
{manifest.scenes.length === 0 ? (
  <div className="rounded-xl border border-white/[0.06] px-3 py-2 text-[12px] text-stone-500">
    Drop .mp4 loops (with matching &quot;pic &lt;name&gt;.png&quot;) into the 4k loops folder
  </div>
) : (
  <div className="grid grid-cols-3 gap-[10px]">…existing tiles…</div>
)}
```

---

### Fix 9 — Dead code

**Where:** `src/main.ts`.

`mixValueForComparison` is a ternary whose two branches are identical. Delete the function and call `sliderFor(mix, key)` directly inside `mixesEqual`.

---

## Edge cases a weaker model would miss

- **Fix 1:** `input[type=range]` sliders are also `INPUT` — the old branch swallowed *their* Escape too (inconsistently) and the naive fix (`return` for all inputs) would make Esc dead while a slider has focus. The two-branch guard above keeps: text input → input handles keys; slider → arrows work natively AND Esc still closes the popover.
- **Fix 2:** `fadeOutAndStop` iterates only `channels.current`, so never-created channels are naturally skipped — no change needed there. Do not "optimize" `ensureChannel` itself; it must still exist for the fast path in fix 3a to create late channels.
- **Fix 3a:** the `!sound` early-return is what keeps the `scene-sound` channel out of the Web Audio engine (it's the `<video>`'s own track). Removing it double-plays scene audio.
- **Fix 3a:** the "channel doesn't exist and target is 0" early-return must come *before* `ensureChannel`, or the lazy-creation win from fix 2 is silently undone by slider drags.
- **Fix 3b:** the `wasPaused` check is required — on resume, the mix is unchanged (shallow-equal) but channels are paused; skipping `applyMix` would leave the app silent.
- **Fix 4:** guard every `mediaSession` access with `'mediaSession' in navigator` — the audio window is Chromium so it exists today, but the guard costs nothing and the existing code already follows this pattern.
- **Fix 6:** keep `isQuitting = true` as the **first** line — window `close` handlers check it to decide whether to allow destruction during quit.

## Acceptance criteria

1. `npm run typecheck` and `npm run lint` pass with zero errors.
2. `CAMPFIRE_DEEP_SMOKE=1 npm run smoke` exits 0.
3. **Fix 1:** popover → "+ save" → type a letter → press Esc: input cancels, popover **stays open**. Press Esc again (no input focused): popover hides.
4. **Fix 2:** `npm start`, start audio-only with exactly one channel raised, then in the audio window devtools (`document.querySelectorAll('audio').length`) count is 1–2, not 17. (Alternative check: start plays noticeably faster than before on first play.)
5. **Fix 3:** drag a sound slider through its whole range while playing: audio tracks the slider smoothly with no stutters; no console warnings in the audio window.
6. **Fix 4:** start audio-only → press keyboard ⏯ to pause → wait 10 s → press ⏯ again: audio resumes every time (repeat 3×).
7. **Fix 5:** arm a 30-minute timer, wait 2+ minutes: the badge number decreases without touching the popover state.
8. **Fix 6:** start a session, quit Campfire from the tray, relaunch, tray right-click → "Resume last session": the same scene and mix come back.
9. **Fix 8:** temporarily rename the `4k loops` folder, `npm start`: popover shows the hint text, no crash; rename back.

Commit as: `fix: popover esc handling, lazy audio channels, media session state, and persistence on quit`
