export const SCENE_SOUND_ID = 'scene-sound';
export const MASTER_ID = 'master';

export type AppMode = 'stopped' | 'video' | 'audioOnly';

export type TimerMinutes = 15 | 30 | 60 | 90;

export interface SceneManifest {
  id: string;
  name: string;
  fileName: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  posterUrl: string | null;
}

export interface SoundManifest {
  id: string;
  name: string;
  fileName: string;
  url: string;
  icon: SoundIconName;
}

export interface MediaManifest {
  scenes: SceneManifest[];
  sounds: SoundManifest[];
}

export type Mix = Record<string, number>;

export interface Preset {
  id: string;
  name: string;
  sceneId: string;
  mix: Mix;
  isDefault: boolean;
}

export interface LastSession {
  sceneId: string;
  mix: Mix;
  mode: AppMode;
}

export interface Settings {
  dimOtherDisplays: boolean;
  showClock: boolean;
  videoDimmer: number;
}

export interface TimerState {
  minutes: TimerMinutes;
  endsAt: number;
}

export interface AppStateSnapshot {
  mode: AppMode;
  paused: boolean;
  currentSceneId: string | null;
  mix: Mix;
  presets: Preset[];
  activePresetId: string | null;
  defaultPresetId: string | null;
  lastSession: LastSession | null;
  settings: Settings;
  timer: TimerState | null;
  fadeOutMs: number | null;
}

export interface PersistedState {
  lastSession: LastSession | null;
  settings: Settings;
}

export type SoundIconName =
  | 'audio-waveform'
  | 'bell'
  | 'bird'
  | 'bug'
  | 'buildings'
  | 'cloud-lightning'
  | 'cloud-rain'
  | 'coffee'
  | 'flame'
  | 'leaf'
  | 'moon'
  | 'snowflake'
  | 'train'
  | 'waves'
  | 'wind';

export interface CampfireApi {
  getManifest: () => Promise<MediaManifest>;
  getState: () => Promise<AppStateSnapshot>;
  startSession: (payload: { sceneId: string; mix: Mix }) => Promise<AppStateSnapshot>;
  stopSession: () => Promise<AppStateSnapshot>;
  startAudio: (payload: { mix: Mix }) => Promise<AppStateSnapshot>;
  stopAudio: () => Promise<AppStateSnapshot>;
  setMix: (payload: { channelId: string; value: number }) => Promise<AppStateSnapshot>;
  selectScene: (payload: { sceneId: string }) => Promise<AppStateSnapshot>;
  listPresets: () => Promise<Preset[]>;
  savePreset: (payload: { name: string; sceneId: string; mix: Mix }) => Promise<Preset[]>;
  deletePreset: (payload: { id: string }) => Promise<Preset[]>;
  setDefaultPreset: (payload: { id: string }) => Promise<Preset[]>;
  overwritePreset: (payload: { id: string }) => Promise<Preset[]>;
  applyPreset: (payload: { id: string }) => Promise<AppStateSnapshot>;
  openPresetsFile: () => Promise<void>;
  pausePlayer: () => Promise<AppStateSnapshot>;
  resumePlayer: () => Promise<AppStateSnapshot>;
  setTimer: (payload: { minutes: TimerMinutes | null }) => Promise<AppStateSnapshot>;
  setSetting: (payload: { key: keyof Settings; value: boolean | number }) => Promise<AppStateSnapshot>;
  onStateChanged: (callback: (state: AppStateSnapshot) => void) => () => void;
  onAudioApply: (callback: (payload: { mix: Mix }) => void) => () => void;
  onAudioVolume: (callback: (payload: { channelId: string; value: number }) => void) => () => void;
  onAudioFadeOutAndStop: (callback: (payload?: { durationMs?: number }) => void) => () => void;
  onVideoVolume: (callback: (payload: { value: number }) => void) => () => void;
  onVideoSwitch: (callback: (payload: { videoUrl: string; posterUrl: string | null }) => void) => () => void;
}

declare global {
  interface Window {
    campfire: CampfireApi;
  }
}
