import { contextBridge, ipcRenderer } from 'electron';
import type { AppStateSnapshot, CampfireApi, MediaManifest, Mix, Preset, Settings } from './types';

function onChannel<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: CampfireApi = {
  getManifest: () => ipcRenderer.invoke('manifest:get') as Promise<MediaManifest>,
  getState: () => ipcRenderer.invoke('state:get') as Promise<AppStateSnapshot>,
  startSession: (payload: { sceneId: string; mix: Mix }) =>
    ipcRenderer.invoke('session:start', payload) as Promise<AppStateSnapshot>,
  stopSession: () => ipcRenderer.invoke('session:stop') as Promise<AppStateSnapshot>,
  startAudio: (payload: { mix: Mix }) => ipcRenderer.invoke('audio:start', payload) as Promise<AppStateSnapshot>,
  stopAudio: () => ipcRenderer.invoke('audio:stop') as Promise<AppStateSnapshot>,
  setMix: (payload: { channelId: string; value: number }) =>
    ipcRenderer.invoke('mix:set', payload) as Promise<AppStateSnapshot>,
  selectScene: (payload: { sceneId: string }) =>
    ipcRenderer.invoke('scene:select', payload) as Promise<AppStateSnapshot>,
  listPresets: () => ipcRenderer.invoke('presets:list') as Promise<Preset[]>,
  savePreset: (payload: { name: string; sceneId: string; mix: Mix }) =>
    ipcRenderer.invoke('presets:save', payload) as Promise<Preset[]>,
  deletePreset: (payload: { id: string }) => ipcRenderer.invoke('presets:delete', payload) as Promise<Preset[]>,
  setDefaultPreset: (payload: { id: string }) =>
    ipcRenderer.invoke('presets:setDefault', payload) as Promise<Preset[]>,
  overwritePreset: (payload: { id: string }) => ipcRenderer.invoke('presets:overwrite', payload) as Promise<Preset[]>,
  applyPreset: (payload: { id: string }) =>
    ipcRenderer.invoke('presets:apply', payload) as Promise<AppStateSnapshot>,
  openPresetsFile: () => ipcRenderer.invoke('presets:openFile') as Promise<void>,
  pausePlayer: () => ipcRenderer.invoke('player:pause') as Promise<AppStateSnapshot>,
  resumePlayer: () => ipcRenderer.invoke('player:resume') as Promise<AppStateSnapshot>,
  setSetting: (payload: { key: keyof Settings; value: boolean | number }) =>
    ipcRenderer.invoke('settings:set', payload) as Promise<AppStateSnapshot>,
  onStateChanged: (callback: (state: AppStateSnapshot) => void) => onChannel('state:changed', callback),
  onAudioApply: (callback: (payload: { mix: Mix }) => void) => onChannel('audio:apply', callback),
  onAudioVolume: (callback: (payload: { channelId: string; value: number }) => void) =>
    onChannel('audio:volume', callback),
  onAudioFadeOutAndStop: (callback: (payload?: { durationMs?: number }) => void) =>
    onChannel('audio:fadeOutAndStop', callback),
  onVideoVolume: (callback: (payload: { value: number }) => void) => onChannel('video:volume', callback),
  onVideoSwitch: (callback: (payload: { videoUrl: string; posterUrl: string | null }) => void) =>
    onChannel('video:switch', callback),
};

contextBridge.exposeInMainWorld('campfire', api);
