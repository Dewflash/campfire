# PLAN: One-touch play affordances (rank 2)

**Execution order:** independent of the other plans; can be done before or after PLAN-instant-session-start.
**Effort:** ~2 hours. **Files touched:** `src/renderer.tsx`, `src/main.ts`. Nothing else.

## Goal

The product promise is one-touch access, but today starting a chosen scene takes three clicks: tray icon → scene tile → Start session. Add direct play affordances so the common paths are one click:

1. **Hover-play on scene tiles** — hovering a tile reveals a centered play button; clicking it starts a video session with that scene and the current mix immediately. If that scene's video session is already playing, the button shows a stop glyph and stops instead.
2. **Double-click a tile** — same as clicking its play button.
3. **Tray right-click → "Start scene" submenu** — start any scene as a full video session without ever opening the popover.
4. **Space bar in the popover** — toggles start/stop of the selected scene (Enter already starts; Space is the natural toggle).

## Step-by-step

### Step 1 — `src/renderer.tsx`: restructure `SceneTile`

The tile's root element is currently a `<button>`. A play button cannot be nested inside it (invalid HTML, React warns, click handling breaks). Restructure:

1. Change the root `<button ...>` of `SceneTile` to `<div role="button" ...>` with the same className plus `cursor-pointer`, keeping the existing `onClick={onSelect}`. Remove the `type="button"` attribute (invalid on div).
2. Add a new prop to `SceneTile`: `onPlay: () => void;`.
3. Add `onDoubleClick={onPlay}` to the root div.
4. The inner thumbnail wrapper div (the one with `aspect-[16/10] overflow-hidden rounded-2xl ...`) gets `relative` added to its className.
5. Inside that wrapper, after the `<img>`/placeholder, add the hover overlay:

```tsx
<div className="absolute inset-0 flex items-center justify-center bg-stone-950/0 opacity-0 transition-all duration-200 group-hover:bg-stone-950/25 group-hover:opacity-100">
  <button
    className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950/60 text-stone-50 backdrop-blur transition-all duration-200 hover:scale-105 hover:bg-stone-950/80 active:scale-95"
    title={playing ? 'Stop session' : 'Start session with this scene'}
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onPlay();
    }}
  >
    {playing ? <XIcon size={15} /> : <PlayIcon size={15} />}
  </button>
</div>
```

`PlayIcon` and `XIcon` already exist in `src/icons.tsx` — import `PlayIcon` and `XIcon` into the renderer's existing icon import list if not already there (`PlayIcon` and `XIcon` are already imported at the top of `renderer.tsx`; verify, don't duplicate).

**Trap:** the root already has the `group` class — keep it; the overlay depends on `group-hover:`. The `event.stopPropagation()` is required so the play click does not also fire the tile's `onSelect` (harmless but causes a redundant IPC round-trip and a visible double state update).

### Step 2 — `src/renderer.tsx`: wire `onPlay` in `PopoverApp`

Add a callback inside `PopoverApp` (after `setMix`):

```ts
const playScene = useCallback(
  (scene: SceneManifest) => {
    if (!state) {
      return;
    }
    if (state.mode === 'video' && state.currentSceneId === scene.id) {
      void window.campfire.stopSession().then(setState);
      return;
    }
    optimisticState((previous) => ({ ...previous, currentSceneId: scene.id }));
    void window.campfire.startSession({ sceneId: scene.id, mix: currentMix }).then(setState);
  },
  [currentMix, optimisticState, setState, state],
);
```

Pass it to each tile in the scene grid: `onPlay={() => playScene(scene)}`.

**Note:** `startSession` focuses the session window, which blurs the popover, which auto-hides it. That is the desired flow — one click and you're inside the session.

### Step 3 — `src/renderer.tsx`: Space-bar toggle

In `PopoverApp`'s window `keydown` effect, after the Enter handler block, add:

```ts
if (event.key === ' ') {
  event.preventDefault();
  if (state && state.mode !== 'stopped') {
    void window.campfire.stopSession().then(setState);
  } else if (selectedScene) {
    void window.campfire.startSession({ sceneId: selectedScene.id, mix: currentMix }).then(setState);
  }
}
```

Also add `state` to that effect's dependency array (it is not there today — check and extend it, the linter will flag it otherwise).

**Trap:** the early-return guard for `target?.tagName === 'INPUT'` at the top of the handler already prevents Space from firing while the user types a preset name or drags a focused slider. Do not remove that guard. (`stopSession` maps to `stopPlayback` in main, which stops audio-only mode too, so a single handler covers both modes.)

### Step 4 — `src/main.ts`: tray "Start scene" submenu

1. In `createTray()`, change the right-click handler so the menu is built from a fresh manifest:

```ts
tray.on('right-click', () => {
  scanManifest();
  tray?.popUpContextMenu(buildTrayMenu());
});
```

2. In `buildTrayMenu()`, insert a new item into `template` directly after the `'Audio only (default preset)'` item and before the first separator:

```ts
{
  label: 'Start scene',
  enabled: manifest.scenes.length > 0,
  submenu: manifest.scenes.map((scene) => ({
    label: scene.name,
    type: 'checkbox' as const,
    checked: mode === 'video' && currentSceneId === scene.id,
    click: () => {
      void startVideoSession(scene.id, currentMix);
    },
  })),
},
```

**Trap:** the `click` closure reads module-level `currentMix` at click time (correct — it must use whatever the mix is when clicked, and `startVideoSession` copies it via `normalizeMix`). Do not snapshot the mix at menu-build time into a local variable.

## Edge cases a weaker model would miss

- **Nested interactive elements:** the root must stop being a `<button>` (step 1.1) or React logs hydration/nesting warnings and Safari/Chromium click targets misbehave.
- **Double-click also fires two single clicks first** — `onSelect` runs twice, then `onPlay`. That is fine: `selectScene` is idempotent and `startVideoSession` sets the scene anyway. Do not add debounce logic.
- **Playing-tile stop semantics:** only a *video* session on *that* scene turns the button into stop. Audio-only mode must NOT show stop on tiles (mode check is `state.mode === 'video'`, matching the existing amber-dot logic).
- **Keyboard nav unaffected:** arrow keys/Enter operate at the window level and never focus tiles; converting the tile root to a div (removing it from tab order) is therefore safe. Do not add `tabIndex={0}` to tiles — Tab focus would fight the window-level key handling.
- **Empty scenes folder:** submenu item must render disabled (the `enabled` flag above), never an empty submenu that looks broken.
- **`type: 'checkbox' as const`** — without `as const`, TypeScript widens the string and `MenuItemConstructorOptions[]` rejects it.

## Acceptance criteria

1. `npm run typecheck` and `npm run lint` pass with zero errors.
2. `CAMPFIRE_DEEP_SMOKE=1 npm run smoke` exits 0.
3. `npm start`: hover a scene tile → play button appears; click it once → full video session starts with that scene; popover hides itself.
4. Open popover during that session; the playing tile shows a stop glyph on hover; clicking it stops the session with the normal fade.
5. Double-click a different tile while stopped → session starts with that scene.
6. Right-click the tray icon → "Start scene" lists every scene with the playing one checked; clicking any entry starts it full-screen without the popover ever opening.
7. Open popover, press Space → selected scene starts; press Space again (reopen popover) → stops.
8. With the popover open, click into the preset "+ save" name field and press Space → a space is typed, no session starts.

Commit as: `feat: one-touch play from tiles, tray menu, and space bar`
