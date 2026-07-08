import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
  Tray,
} from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  MASTER_ID,
  SCENE_SOUND_ID,
  type AppMode,
  type AppStateSnapshot,
  type LastSession,
  type MediaManifest,
  type Mix,
  type PersistedState,
  type Preset,
  type SceneManifest,
  type Settings,
  type SoundIconName,
  type SoundManifest,
  type TimerMinutes,
  type TimerState,
} from './types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'campfire',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
}

const DEFAULT_SETTINGS: Settings = {
  dimOtherDisplays: true,
  showClock: false,
  videoDimmer: 0,
};

const POPOVER_WIDTH = 380;
const POPOVER_HEIGHT = 660;
const STOP_FADE_MS = 400;
const TIMER_FADE_MS = 10_000;
const TIMER_OPTIONS: TimerMinutes[] = [15, 30, 60, 90];

let tray: Tray | null = null;
let popoverWindow: BrowserWindow | null = null;
let sessionWindow: BrowserWindow | null = null;
let audioWindow: BrowserWindow | null = null;
let audioReady: Promise<void> | null = null;
let dimWindows: BrowserWindow[] = [];
let powerSaveBlockerId: number | null = null;
let isQuitting = false;
let playbackGeneration = 0;

let manifest: MediaManifest = { scenes: [], sounds: [] };
let presets: Preset[] = [];
let mode: AppMode = 'stopped';
let paused = false;
let currentSceneId: string | null = null;
let currentMix: Mix = { [MASTER_ID]: 1, [SCENE_SOUND_ID]: 0.7 };
let lastSession: LastSession | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };
let sleepTimer: TimerState | null = null;
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;
let presetsWriteTimer: ReturnType<typeof setTimeout> | null = null;
let stateWriteTimer: ReturnType<typeof setTimeout> | null = null;
let cachedMediaRoot: string | null = null;
let cachedBundledAssetsRoot: string | null = null;
let globalHotkeyRegistered = false;

function pathExists(filePath: string) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function directoryForCandidate(candidate: string) {
  const resolved = path.resolve(candidate);
  if (!pathExists(resolved)) {
    return resolved;
  }
  const stats = fs.statSync(resolved);
  return stats.isDirectory() ? resolved : path.dirname(resolved);
}

function ancestors(start: string) {
  const dirs: string[] = [path.resolve(start)];
  let current = directoryForCandidate(start);
  while (!dirs.includes(current)) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return dirs;
}

function rootCandidates() {
  const starts = [
    process.env.CAMPFIRE_MEDIA_ROOT,
    process.env.CAMPFIRE_ASSETS_ROOT,
    process.resourcesPath,
    app.getAppPath(),
    path.dirname(app.getPath('exe')),
    process.cwd(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const dirs = starts.flatMap((candidate) => ancestors(candidate));
  return [...new Set(dirs)];
}

function findRootContaining(requiredPaths: string[], fallback: string) {
  return (
    rootCandidates().find((candidate) =>
      requiredPaths.every((requiredPath) => pathExists(path.join(candidate, requiredPath))),
    ) ?? fallback
  );
}

function mediaRoot() {
  cachedMediaRoot ??= findRootContaining(['4k loops'], app.getAppPath());
  return cachedMediaRoot;
}

function bundledAssetsRoot() {
  cachedBundledAssetsRoot ??= findRootContaining(
    [path.join('assets', 'tray', 'icon-Template.png')],
    app.getAppPath(),
  );
  return cachedBundledAssetsRoot;
}

function presetsPath() {
  return path.join(app.getPath('userData'), 'presets.json');
}

function statePath() {
  return path.join(app.getPath('userData'), 'state.json');
}

function preloadPath() {
  return path.join(__dirname, 'preload.js');
}

function rendererHtmlPath() {
  return path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
}

function rendererRoute(window: BrowserWindow, route: string) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#${route}`);
  }
  return window.loadFile(rendererHtmlPath(), { hash: route });
}

function clamp01(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeMix(mix: Mix | undefined | null): Mix {
  const normalized: Mix = {};
  for (const [channelId, value] of Object.entries(mix ?? {})) {
    normalized[channelId] = clamp01(value);
  }
  normalized[MASTER_ID] = clamp01(normalized[MASTER_ID], 1);
  return normalized;
}

function sliderFor(mix: Mix, channelId: string) {
  if (channelId === MASTER_ID) {
    return clamp01(mix[channelId], 1);
  }
  return clamp01(mix[channelId], 0);
}

function videoVolumeForMix(mix: Mix) {
  return sliderFor(mix, SCENE_SOUND_ID) ** 2 * sliderFor(mix, MASTER_ID) ** 2;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function displayNameFromFileBase(baseName: string) {
  const stripped = baseName.replace(/^ai\s+/i, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function mediaUrl(...segments: string[]) {
  return `campfire://media/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function cacheUrl(fileName: string) {
  return `campfire://cache/${encodeURIComponent(fileName)}`;
}

function thumbnailCacheRoot() {
  return path.join(app.getPath('userData'), 'thumbnail-cache');
}

function cachedThumbnailUrl(sceneBaseName: string, thumbnailPath: string) {
  try {
    const stats = fs.statSync(thumbnailPath);
    const cacheName = `${slugify(sceneBaseName)}-${Math.round(stats.mtimeMs)}-${stats.size}.png`;
    const cachePath = path.join(thumbnailCacheRoot(), cacheName);
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      const image = nativeImage.createFromPath(thumbnailPath);
      if (!image.isEmpty()) {
        const resized = image.resize({ width: 420, quality: 'good' });
        fs.writeFileSync(cachePath, resized.toPNG());
      }
    }
    return fs.existsSync(cachePath) ? cacheUrl(cacheName) : mediaUrl('4k loops', path.basename(thumbnailPath));
  } catch (error) {
    console.warn(`Unable to cache thumbnail ${thumbnailPath}`, error);
    return mediaUrl('4k loops', path.basename(thumbnailPath));
  }
}

function iconForSound(fileName: string): SoundIconName {
  const lower = fileName.toLowerCase();
  const mappings: Array<[string[], SoundIconName]> = [
    [['rain'], 'cloud-rain'],
    [['thunder', 'storm'], 'cloud-lightning'],
    [['fire', 'crackle'], 'flame'],
    [['bird'], 'bird'],
    [['cricket'], 'bug'],
    [['chime'], 'bell'],
    [['wind'], 'wind'],
    [['leaves', 'rustle'], 'leaf'],
    [['stream', 'river', 'water'], 'waves'],
    [['wave', 'ocean', 'sea'], 'waves'],
    [['street', 'city'], 'buildings'],
    [['train'], 'train'],
    [['snow'], 'snowflake'],
    [['night'], 'moon'],
    [['cafe', 'people'], 'coffee'],
  ];
  return mappings.find(([keywords]) => keywords.some((keyword) => lower.includes(keyword)))?.[1] ?? 'audio-waveform';
}

function scanManifest(): MediaManifest {
  const root = mediaRoot();
  const videoDir = path.join(root, '4k loops');
  const soundDir = path.join(root, 'sounds');
  const scenes: SceneManifest[] = fs.existsSync(videoDir)
    ? fs
        .readdirSync(videoDir)
        .filter((fileName) => path.extname(fileName).toLowerCase() === '.mp4')
        .sort((a, b) => a.localeCompare(b))
        .map((fileName) => {
          const baseName = path.basename(fileName, '.mp4');
          const thumbnailName = `pic ${baseName}.png`;
          const hasThumbnail = fs.existsSync(path.join(videoDir, thumbnailName));
          return {
            id: slugify(baseName),
            name: displayNameFromFileBase(baseName),
            fileName,
            videoUrl: mediaUrl('4k loops', fileName),
            thumbnailUrl: hasThumbnail ? cachedThumbnailUrl(baseName, path.join(videoDir, thumbnailName)) : null,
          };
        })
    : [];

  const soundExtensions = new Set(['.mp3', '.m4a', '.wav', '.ogg']);
  const sounds: SoundManifest[] = fs.existsSync(soundDir)
    ? fs
        .readdirSync(soundDir)
        .filter((fileName) => soundExtensions.has(path.extname(fileName).toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
        .map((fileName) => {
          const baseName = path.basename(fileName, path.extname(fileName));
          return {
            id: slugify(baseName),
            name: displayNameFromFileBase(baseName),
            fileName,
            url: mediaUrl('sounds', fileName),
            icon: iconForSound(fileName),
          };
        })
    : [];

  manifest = { scenes, sounds };
  if (currentSceneId && !manifest.scenes.some((scene) => scene.id === currentSceneId)) {
    currentSceneId = manifest.scenes[0]?.id ?? null;
  }
  return manifest;
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    console.warn(`Unable to read ${filePath}`, error);
    return null;
  }
}

function writeJsonAtomic(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function schedulePresetsWrite() {
  if (presetsWriteTimer) {
    clearTimeout(presetsWriteTimer);
  }
  presetsWriteTimer = setTimeout(() => writeJsonAtomic(presetsPath(), presets), 500);
}

function scheduleStateWrite() {
  if (stateWriteTimer) {
    clearTimeout(stateWriteTimer);
  }
  stateWriteTimer = setTimeout(() => {
    writeJsonAtomic(statePath(), { lastSession, settings } satisfies PersistedState);
  }, 500);
}

function loadPersistence() {
  const persistedPresets = readJson<Preset[]>(presetsPath());
  presets = Array.isArray(persistedPresets)
    ? persistedPresets.map((preset) => ({ ...preset, mix: normalizeMix(preset.mix) }))
    : [];

  if (presets.length === 0 && manifest.scenes.some((scene) => scene.id === 'fireplace')) {
    presets = [
      {
        id: randomUUID(),
        name: 'Cozy cabin',
        sceneId: 'fireplace',
        mix: { [SCENE_SOUND_ID]: 0.7 },
        isDefault: true,
      },
    ];
    writeJsonAtomic(presetsPath(), presets);
  }

  const persistedState = readJson<Partial<PersistedState>>(statePath());
  lastSession = persistedState?.lastSession ?? null;
  settings = {
    ...DEFAULT_SETTINGS,
    ...(persistedState?.settings ?? {}),
    videoDimmer: clamp01(persistedState?.settings?.videoDimmer, DEFAULT_SETTINGS.videoDimmer),
  };

  const defaultPreset = getDefaultPreset();
  const restored = lastSession && manifest.scenes.some((scene) => scene.id === lastSession?.sceneId) ? lastSession : null;
  currentSceneId = restored?.sceneId ?? defaultPreset?.sceneId ?? manifest.scenes[0]?.id ?? null;
  currentMix = normalizeMix(restored?.mix ?? defaultPreset?.mix ?? { [MASTER_ID]: 1, [SCENE_SOUND_ID]: 0.7 });
}

function getDefaultPreset() {
  return presets.find((preset) => preset.isDefault) ?? presets[0] ?? null;
}

function mixValueForComparison(mix: Mix, channelId: string) {
  return channelId === MASTER_ID ? sliderFor(mix, channelId) : sliderFor(mix, channelId);
}

function mixesEqual(a: Mix, b: Mix) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b), MASTER_ID]);
  for (const key of keys) {
    if (Math.abs(mixValueForComparison(a, key) - mixValueForComparison(b, key)) > 0.001) {
      return false;
    }
  }
  return true;
}

function findActivePresetId() {
  return (
    presets.find((preset) => preset.sceneId === currentSceneId && mixesEqual(normalizeMix(preset.mix), currentMix))?.id ??
    null
  );
}

function snapshot(fadeOutMs: number | null = null): AppStateSnapshot {
  return {
    mode,
    paused,
    currentSceneId,
    mix: { ...currentMix },
    presets: presets.map((preset) => ({ ...preset, mix: { ...preset.mix } })),
    activePresetId: findActivePresetId(),
    defaultPresetId: getDefaultPreset()?.id ?? null,
    lastSession: lastSession ? { ...lastSession, mix: { ...lastSession.mix } } : null,
    settings: { ...settings },
    timer: sleepTimer ? { ...sleepTimer } : null,
    fadeOutMs,
  };
}

function liveWindows() {
  return [popoverWindow, sessionWindow, audioWindow].filter(
    (window): window is BrowserWindow => Boolean(window && !window.isDestroyed()),
  );
}

function broadcastState(fadeOutMs: number | null = null) {
  const state = snapshot(fadeOutMs);
  for (const window of liveWindows()) {
    window.webContents.send('state:changed', state);
  }
  updateTray();
  return state;
}

function sendVideoVolume() {
  if (sessionWindow && !sessionWindow.isDestroyed()) {
    sessionWindow.webContents.send('video:volume', { value: mode === 'video' && !paused ? videoVolumeForMix(currentMix) : 0 });
  }
}

function clearSleepTimer() {
  if (sleepTimerHandle) {
    clearTimeout(sleepTimerHandle);
    sleepTimerHandle = null;
  }
  sleepTimer = null;
}

function setSleepTimer(minutes: TimerMinutes | null) {
  clearSleepTimer();
  if (minutes) {
    const endsAt = Date.now() + minutes * 60_000;
    sleepTimer = { minutes, endsAt };
    sleepTimerHandle = setTimeout(() => {
      void stopPlayback(TIMER_FADE_MS);
    }, minutes * 60_000);
  }
  return broadcastState();
}

function loadTrayImage(active: boolean) {
  const iconPath = path.join(
    bundledAssetsRoot(),
    'assets',
    'tray',
    active ? 'icon-active-Template.png' : 'icon-Template.png',
  );
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromBuffer(fs.readFileSync(iconPath))
    : nativeImage.createEmpty();
  image.setTemplateImage(true);
  return image;
}

function buildTrayMenu(): Menu {
  const defaultPreset = getDefaultPreset();
  const canResume = Boolean(lastSession?.sceneId);
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Resume last session',
      enabled: canResume,
      click: () => {
        if (lastSession) {
          void startVideoSession(lastSession.sceneId, lastSession.mix);
        }
      },
    },
    {
      label: 'Start default preset',
      enabled: Boolean(defaultPreset),
      click: () => {
        if (defaultPreset) {
          void startVideoSession(defaultPreset.sceneId, defaultPreset.mix);
        }
      },
    },
    {
      label: 'Audio only (default preset)',
      enabled: Boolean(defaultPreset),
      click: () => {
        if (defaultPreset) {
          void startAudioOnly(defaultPreset.mix, defaultPreset.sceneId);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Stop',
      enabled: mode !== 'stopped',
      click: () => {
        void stopPlayback();
      },
    },
    { type: 'separator' },
    {
      label: 'Dim other displays',
      type: 'checkbox',
      checked: settings.dimOtherDisplays,
      click: (menuItem) => {
        settings.dimOtherDisplays = menuItem.checked;
        if (mode === 'video') {
          refreshDimWindows();
        }
        scheduleStateWrite();
        broadcastState();
      },
    },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Campfire',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];
  return Menu.buildFromTemplate(template);
}

function updateTray() {
  if (!tray) {
    return;
  }
  tray.setImage(loadTrayImage(mode !== 'stopped'));
  tray.setToolTip(mode === 'stopped' ? 'Campfire' : paused ? 'Campfire paused' : 'Campfire playing');
}

function createTray() {
  tray = new Tray(loadTrayImage(false));
  tray.setToolTip('Campfire');
  tray.on('click', () => {
    void togglePopover();
  });
  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu());
  });
}

function createPopoverWindow() {
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    return popoverWindow;
  }
  popoverWindow = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popoverWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popoverWindow.on('blur', () => {
    if (popoverWindow && !popoverWindow.webContents.isDevToolsOpened()) {
      popoverWindow.hide();
    }
  });
  popoverWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      popoverWindow?.hide();
    }
  });
  popoverWindow.on('closed', () => {
    popoverWindow = null;
  });
  void rendererRoute(popoverWindow, '/popover');
  return popoverWindow;
}

function positionPopover(window: BrowserWindow) {
  if (!tray) {
    return;
  }
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + Math.round(trayBounds.width / 2),
    y: trayBounds.y + Math.round(trayBounds.height / 2),
  });
  const workArea = display.workArea;
  const x = Math.max(
    workArea.x + 8,
    Math.min(trayBounds.x + Math.round(trayBounds.width / 2) - Math.round(POPOVER_WIDTH / 2), workArea.x + workArea.width - POPOVER_WIDTH - 8),
  );
  const y = trayBounds.y + trayBounds.height + 6;
  window.setBounds({ x, y, width: POPOVER_WIDTH, height: POPOVER_HEIGHT });
}

async function togglePopover() {
  scanManifest();
  const window = createPopoverWindow();
  positionPopover(window);
  if (window.isVisible()) {
    window.hide();
    return;
  }
  window.show();
  window.focus();
  broadcastState();
}

async function ensureAudioWindow() {
  if (audioWindow && !audioWindow.isDestroyed()) {
    await audioReady;
    return audioWindow;
  }
  audioWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  audioWindow.on('closed', () => {
    audioWindow = null;
    audioReady = null;
  });
  audioReady = rendererRoute(audioWindow, '/audio').then((): void => undefined);
  await audioReady;
  return audioWindow;
}

function targetDisplayForSession() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

async function ensureSessionWindow(scene: SceneManifest) {
  if (sessionWindow && !sessionWindow.isDestroyed()) {
    sessionWindow.webContents.send('video:switch', { videoUrl: scene.videoUrl });
    sendVideoVolume();
    return sessionWindow;
  }

  const targetDisplay = targetDisplayForSession();
  sessionWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    show: false,
    frame: false,
    fullscreen: false,
    simpleFullscreen: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  sessionWindow.on('close', (event) => {
    if (!isQuitting && mode === 'video') {
      event.preventDefault();
      void stopPlayback();
    }
  });
  sessionWindow.on('closed', () => {
    sessionWindow = null;
    stopPowerSaveBlocker();
  });
  await rendererRoute(sessionWindow, '/session');
  if (!sessionWindow.isDestroyed()) {
    sessionWindow.setBounds(targetDisplay.bounds);
    sessionWindow.show();
    sessionWindow.setSimpleFullScreen(true);
    startPowerSaveBlocker();
    refreshDimWindows(targetDisplay.id);
  }
  return sessionWindow;
}

function startPowerSaveBlocker() {
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}

function stopPowerSaveBlocker() {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
  }
  powerSaveBlockerId = null;
}

function closeDimWindows() {
  for (const window of dimWindows) {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
  dimWindows = [];
}

function refreshDimWindows(targetDisplayId = targetDisplayForSession().id) {
  closeDimWindows();
  if (mode !== 'video' || !settings.dimOtherDisplays) {
    return;
  }
  for (const display of screen.getAllDisplays()) {
    if (display.id === targetDisplayId) {
      continue;
    }
    const window = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      fullscreen: false,
      simpleFullscreen: true,
      backgroundColor: '#000000',
      show: false,
      skipTaskbar: true,
    });
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) {
        window.show();
        window.setSimpleFullScreen(true);
      }
    });
    window.loadURL('data:text/html,<html><body style="margin:0;background:#000"></body></html>').catch(console.error);
    dimWindows.push(window);
  }
}

function destroySessionWindowAfter(fadeMs: number, generation: number) {
  setTimeout(() => {
    if (playbackGeneration !== generation || mode === 'video') {
      return;
    }
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      sessionWindow.destroy();
    }
    closeDimWindows();
    stopPowerSaveBlocker();
  }, fadeMs + 80);
}

async function applyAudioMix() {
  const window = await ensureAudioWindow();
  if (!window.isDestroyed()) {
    window.webContents.send('audio:apply', { mix: currentMix });
  }
}

function getScene(sceneId: string | null) {
  scanManifest();
  return manifest.scenes.find((scene) => scene.id === sceneId) ?? null;
}

async function startVideoSession(sceneId: string, mix: Mix) {
  const scene = getScene(sceneId);
  if (!scene) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }
  clearSleepTimer();
  playbackGeneration += 1;
  mode = 'video';
  paused = false;
  currentSceneId = scene.id;
  currentMix = normalizeMix(mix);
  await applyAudioMix();
  await ensureSessionWindow(scene);
  sendVideoVolume();
  broadcastState();
  return snapshot();
}

async function startAudioOnly(mix: Mix, sceneId = currentSceneId) {
  clearSleepTimer();
  const generation = ++playbackGeneration;
  currentSceneId = getScene(sceneId)?.id ?? currentSceneId;
  currentMix = normalizeMix(mix);
  paused = false;
  mode = 'audioOnly';
  await applyAudioMix();
  sendVideoVolume();
  broadcastState(STOP_FADE_MS);
  destroySessionWindowAfter(STOP_FADE_MS, generation);
  return snapshot();
}

async function stopPlayback(fadeMs = STOP_FADE_MS) {
  if (mode === 'stopped') {
    clearSleepTimer();
    return broadcastState();
  }

  const generation = ++playbackGeneration;
  const stoppedMode = mode;
  if (currentSceneId) {
    lastSession = { sceneId: currentSceneId, mix: { ...currentMix }, mode: stoppedMode };
  }
  clearSleepTimer();
  paused = false;
  mode = 'stopped';
  scheduleStateWrite();

  if (audioWindow && !audioWindow.isDestroyed()) {
    audioWindow.webContents.send('audio:fadeOutAndStop', { durationMs: fadeMs });
  }
  sendVideoVolume();
  const state = broadcastState(fadeMs);
  destroySessionWindowAfter(fadeMs, generation);
  return state;
}

async function selectScene(sceneId: string) {
  const scene = getScene(sceneId);
  if (!scene) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }
  currentSceneId = scene.id;
  if (mode === 'video' && sessionWindow && !sessionWindow.isDestroyed()) {
    sessionWindow.webContents.send('video:switch', { videoUrl: scene.videoUrl });
    sendVideoVolume();
  }
  if (mode !== 'stopped') {
    await applyAudioMix();
  }
  return broadcastState();
}

async function setMixValue(channelId: string, value: number) {
  currentMix = normalizeMix({ ...currentMix, [channelId]: value });
  if (mode !== 'stopped' && audioWindow && !audioWindow.isDestroyed()) {
    audioWindow.webContents.send('audio:volume', { channelId, value: sliderFor(currentMix, channelId) });
    if (channelId === MASTER_ID) {
      audioWindow.webContents.send('audio:volume', { channelId: MASTER_ID, value: sliderFor(currentMix, MASTER_ID) });
    }
  }
  if (mode === 'video' && (channelId === SCENE_SOUND_ID || channelId === MASTER_ID)) {
    sendVideoVolume();
  }
  return broadcastState();
}

async function pausePlayer() {
  if (mode === 'stopped' || paused) {
    return snapshot();
  }
  paused = true;
  sendVideoVolume();
  return broadcastState();
}

async function resumePlayer() {
  if (mode === 'stopped' || !paused) {
    return snapshot();
  }
  paused = false;
  await applyAudioMix();
  sendVideoVolume();
  return broadcastState();
}

async function applyPreset(presetId: string) {
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }
  currentSceneId = getScene(preset.sceneId)?.id ?? currentSceneId;
  currentMix = normalizeMix(preset.mix);
  if (mode === 'video' && currentSceneId) {
    await startVideoSession(currentSceneId, currentMix);
  } else if (mode === 'audioOnly') {
    await startAudioOnly(currentMix, currentSceneId);
  } else {
    broadcastState();
  }
  return snapshot();
}

function savePreset(name: string, sceneId: string, mix: Mix) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Preset name is required');
  }
  const preset: Preset = {
    id: randomUUID(),
    name: trimmedName,
    sceneId,
    mix: normalizeMix(mix),
    isDefault: presets.length === 0,
  };
  presets = [...presets, preset];
  schedulePresetsWrite();
  broadcastState();
  return presets;
}

function overwritePreset(id: string) {
  presets = presets.map((preset) =>
    preset.id === id ? { ...preset, sceneId: currentSceneId ?? preset.sceneId, mix: { ...currentMix } } : preset,
  );
  schedulePresetsWrite();
  broadcastState();
  return presets;
}

function deletePreset(id: string) {
  const deletedDefault = presets.find((preset) => preset.id === id)?.isDefault ?? false;
  presets = presets.filter((preset) => preset.id !== id);
  if (deletedDefault && presets[0]) {
    presets[0] = { ...presets[0], isDefault: true };
  }
  schedulePresetsWrite();
  broadcastState();
  return presets;
}

function setDefaultPreset(id: string) {
  presets = presets.map((preset) => ({ ...preset, isDefault: preset.id === id }));
  schedulePresetsWrite();
  broadcastState();
  return presets;
}

function handleSettingsSet(key: keyof Settings, value: boolean | number) {
  if (key === 'videoDimmer') {
    settings.videoDimmer = clamp01(value, settings.videoDimmer);
  } else if (key === 'dimOtherDisplays') {
    settings.dimOtherDisplays = Boolean(value);
    if (mode === 'video') {
      refreshDimWindows();
    }
  } else if (key === 'showClock') {
    settings.showClock = Boolean(value);
  }
  scheduleStateWrite();
  return broadcastState();
}

function registerIpcHandlers() {
  ipcMain.handle('manifest:get', () => scanManifest());
  ipcMain.handle('state:get', () => snapshot());
  ipcMain.handle('session:start', (_event, payload: { sceneId: string; mix: Mix }) =>
    startVideoSession(payload.sceneId, payload.mix),
  );
  ipcMain.handle('session:stop', () => stopPlayback());
  ipcMain.handle('audio:start', (_event, payload: { mix: Mix }) => startAudioOnly(payload.mix));
  ipcMain.handle('audio:stop', () => stopPlayback());
  ipcMain.handle('mix:set', (_event, payload: { channelId: string; value: number }) =>
    setMixValue(payload.channelId, payload.value),
  );
  ipcMain.handle('scene:select', (_event, payload: { sceneId: string }) => selectScene(payload.sceneId));
  ipcMain.handle('presets:list', () => presets);
  ipcMain.handle('presets:save', (_event, payload: { name: string; sceneId: string; mix: Mix }) =>
    savePreset(payload.name, payload.sceneId, payload.mix),
  );
  ipcMain.handle('presets:delete', (_event, payload: { id: string }) => deletePreset(payload.id));
  ipcMain.handle('presets:setDefault', (_event, payload: { id: string }) => setDefaultPreset(payload.id));
  ipcMain.handle('presets:apply', (_event, payload: { id: string }) => applyPreset(payload.id));
  ipcMain.handle('presets:overwrite', (_event, payload: { id: string }) => overwritePreset(payload.id));
  ipcMain.handle('presets:openFile', () => {
    writeJsonAtomic(presetsPath(), presets);
    shell.showItemInFolder(presetsPath());
  });
  ipcMain.handle('player:pause', () => pausePlayer());
  ipcMain.handle('player:resume', () => resumePlayer());
  ipcMain.handle('timer:set', (_event, payload: { minutes: TimerMinutes | null }) => {
    const minutes = payload.minutes && TIMER_OPTIONS.includes(payload.minutes) ? payload.minutes : null;
    return setSleepTimer(minutes);
  });
  ipcMain.handle('settings:set', (_event, payload: { key: keyof Settings; value: boolean | number }) =>
    handleSettingsSet(payload.key, payload.value),
  );
}

function registerMediaProtocol() {
  protocol.handle('campfire', (request) => {
    const url = new URL(request.url);
    const root = path.resolve(url.host === 'cache' ? thumbnailCacheRoot() : mediaRoot());
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
    const abs = path.resolve(path.join(root, rel));
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(abs).toString());
  });
}

async function runSmokeTest() {
  const image = loadTrayImage(false);
  const window = createPopoverWindow();
  await new Promise<void>((resolve) => {
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', () => resolve());
    } else {
      resolve();
    }
  });
  window.show();
  await new Promise((resolve) => setTimeout(resolve, 750));
  await window.webContents
    .executeJavaScript(`
      Promise.race([
        Promise.all(Array.from(document.images).map((img) => {
          if (img.complete && img.naturalWidth > 0) return true;
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        })),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ])
    `)
    .catch(console.warn);
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (process.env.CAMPFIRE_SCREENSHOT_PATH) {
    const image = await window.webContents.capturePage();
    fs.writeFileSync(process.env.CAMPFIRE_SCREENSHOT_PATH, image.toPNG());
  }
  const bodyText = (await window.webContents.executeJavaScript('document.body.innerText')) as string;
  let videoModeWorks = true;
  let audioOnlyWorks = true;
  let stopWorks = true;
  let stoppedSelectKeepsPlaybackClosed = true;
  if (process.env.CAMPFIRE_DEEP_SMOKE === '1') {
    const scene = manifest.scenes[0];
    if (scene) {
      const stoppedMix: Mix = { [MASTER_ID]: 1 };
      const sound = manifest.sounds[0];
      if (sound) {
        stoppedMix[sound.id] = 0.35;
      }
      currentMix = normalizeMix(stoppedMix);
      await selectScene((manifest.scenes[1] ?? scene).id);
      await new Promise((resolve) => setTimeout(resolve, 250));
      stoppedSelectKeepsPlaybackClosed =
        mode === 'stopped' &&
        Boolean(!sessionWindow || sessionWindow.isDestroyed()) &&
        Boolean(!audioWindow || audioWindow.isDestroyed());

      await startVideoSession(scene.id, { [MASTER_ID]: 1, [SCENE_SOUND_ID]: 0 });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      videoModeWorks = mode === 'video' && Boolean(sessionWindow && !sessionWindow.isDestroyed());
      await stopPlayback(100);
      await new Promise((resolve) => setTimeout(resolve, 250));
      stopWorks = mode === 'stopped' && Boolean(!sessionWindow || sessionWindow.isDestroyed());
      const audioOnlyMix: Mix = { [MASTER_ID]: 1 };
      if (sound) {
        audioOnlyMix[sound.id] = 0.35;
      }
      await startAudioOnly(audioOnlyMix, scene.id);
      await new Promise((resolve) => setTimeout(resolve, 700));
      audioOnlyWorks = mode === 'audioOnly' && Boolean(audioWindow && !audioWindow.isDestroyed());
      await stopPlayback(100);
      await new Promise((resolve) => setTimeout(resolve, 250));
      stopWorks = stopWorks && mode === 'stopped';
    } else {
      videoModeWorks = false;
      audioOnlyWorks = false;
      stopWorks = false;
      stoppedSelectKeepsPlaybackClosed = false;
    }
  }
  const result = {
    bundledAssetsRoot: bundledAssetsRoot(),
    mediaRoot: mediaRoot(),
    globalHotkeyRegistered,
    trayIconLoaded: !image.isEmpty(),
    scenes: manifest.scenes.length,
    sounds: manifest.sounds.length,
    presets: presets.length,
    currentSceneId,
    popoverHasCampfire: bodyText.includes('Campfire'),
    popoverHasStartSession: bodyText.includes('Start session'),
    popoverHasAudioOnly: bodyText.includes('Audio only'),
    popoverHasScene: manifest.scenes.some((scene) => bodyText.includes(scene.name)),
    videoModeWorks,
    audioOnlyWorks,
    stopWorks,
    stoppedSelectKeepsPlaybackClosed,
  };
  console.log(`CAMPFIRE_SMOKE_RESULT ${JSON.stringify(result)}`);
  const ok =
    result.trayIconLoaded &&
    result.scenes > 0 &&
    result.sounds > 0 &&
    result.presets > 0 &&
    result.popoverHasCampfire &&
    result.popoverHasStartSession &&
    result.popoverHasAudioOnly &&
    result.popoverHasScene &&
    result.videoModeWorks &&
    result.audioOnlyWorks &&
    result.stopWorks &&
    result.stoppedSelectKeepsPlaybackClosed;
  app.exit(ok ? 0 : 1);
}

function registerGlobalHotkey() {
  globalHotkeyRegistered = globalShortcut.register('Alt+Command+C', () => {
    if (mode === 'stopped') {
      const preset = getDefaultPreset();
      if (preset) {
        void startVideoSession(preset.sceneId, preset.mix);
      }
    } else {
      void stopPlayback();
    }
  });
  if (!globalHotkeyRegistered) {
    console.warn('Unable to register Alt+Command+C global shortcut.');
  }
}

app.whenReady().then(() => {
  app.dock?.hide();
  scanManifest();
  loadPersistence();
  registerMediaProtocol();
  registerIpcHandlers();
  createTray();
  registerGlobalHotkey();
  powerMonitor.on('suspend', () => {
    void stopPlayback();
  });
  if (process.env.CAMPFIRE_SHOW_POPOVER === '1') {
    setTimeout(() => {
      void togglePopover();
    }, 300);
  }
  if (process.env.CAMPFIRE_SMOKE_TEST === '1') {
    void runSmokeTest();
  }
});

app.on('second-instance', () => {
  void togglePopover();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (presetsWriteTimer) {
    clearTimeout(presetsWriteTimer);
    writeJsonAtomic(presetsPath(), presets);
  }
  if (stateWriteTimer) {
    clearTimeout(stateWriteTimer);
    writeJsonAtomic(statePath(), { lastSession, settings } satisfies PersistedState);
  }
});
