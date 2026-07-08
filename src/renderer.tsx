import './index.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  ChevronDownIcon,
  ClockIcon,
  FlameIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SoundIcon,
  StarIcon,
  XIcon,
} from './icons';
import {
  MASTER_ID,
  SCENE_SOUND_ID,
  type AppStateSnapshot,
  type MediaManifest,
  type Mix,
  type Preset,
  type SceneManifest,
  type SoundManifest,
  type TimerMinutes,
} from './types';

const TIMER_CYCLE: Array<TimerMinutes | null> = [null, 15, 30, 60, 90];
const DEFAULT_MIX: Mix = { [MASTER_ID]: 1, [SCENE_SOUND_ID]: 0.7 };

function clamp01(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function mixValue(mix: Mix, channelId: string) {
  if (channelId === MASTER_ID) {
    return clamp01(mix[channelId] ?? 1, 1);
  }
  return clamp01(mix[channelId] ?? 0, 0);
}

function nextTimer(current: TimerMinutes | null) {
  const index = TIMER_CYCLE.indexOf(current);
  return TIMER_CYCLE[(index + 1) % TIMER_CYCLE.length];
}

function useCampfireData() {
  const [manifest, setManifest] = useState<MediaManifest>({ scenes: [], sounds: [] });
  const [state, setState] = useState<AppStateSnapshot | null>(null);

  const refresh = useCallback(async () => {
    const [freshManifest, freshState] = await Promise.all([window.campfire.getManifest(), window.campfire.getState()]);
    setManifest(freshManifest);
    setState(freshState);
  }, []);

  useEffect(() => {
    void refresh();
    return window.campfire.onStateChanged(setState);
  }, [refresh]);

  useEffect(() => {
    const onFocus = (): void => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return (): void => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { manifest, state, setState, refresh };
}

function Slider({
  value,
  disabled = false,
  onChange,
  title,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  title: string;
}) {
  const percent = `${Math.round(value * 100)}%`;
  const style: CSSProperties = {
    background: `linear-gradient(to right, rgb(251 191 36) 0%, rgb(251 191 36) ${percent}, rgb(68 64 60) ${percent}, rgb(68 64 60) 100%)`,
  };
  return (
    <input
      aria-label={title}
      className="campfire-range h-[15px] flex-1 transition-all duration-200 disabled:opacity-40"
      disabled={disabled}
      max="1"
      min="0"
      step="0.01"
      style={style}
      type="range"
      value={value}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  );
}

function IconButton({
  title,
  className = '',
  children,
  onClick,
}: {
  title: string;
  className?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-all duration-200 hover:bg-white/10 hover:text-stone-100 active:scale-[0.98] ${className}`}
      title={title}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone-500">{children}</div>;
}

function TimerButton({ state }: { state: AppStateSnapshot }) {
  const minutes = state.timer?.minutes ?? null;
  const label = state.timer ? `${Math.max(1, Math.ceil((state.timer.endsAt - Date.now()) / 60_000))}` : null;
  return (
    <button
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-[0.98] ${
        minutes ? 'bg-amber-400/15 text-amber-300' : 'text-stone-400 hover:bg-white/10 hover:text-stone-100'
      }`}
      title="Sleep timer"
      type="button"
      onClick={() => void window.campfire.setTimer({ minutes: nextTimer(minutes) })}
    >
      <MoonIcon size={15} />
      {label && <span className="absolute -right-1 -top-1 text-[9px] font-semibold text-amber-300">{label}</span>}
    </button>
  );
}

function SceneTile({
  scene,
  selected,
  playing,
  onSelect,
}: {
  scene: SceneManifest;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="group min-w-0 text-left transition-all duration-200 hover:scale-[1.02] focus:outline-none"
      type="button"
      onClick={onSelect}
    >
      <div
        className={`aspect-[16/10] overflow-hidden rounded-2xl bg-stone-800 transition-all duration-200 ${
          selected ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/[0.06]'
        }`}
      >
        {scene.thumbnailUrl ? (
          <img alt="" className="h-full w-full object-cover" draggable={false} src={scene.thumbnailUrl} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-stone-800 text-stone-600">
            <FlameIcon size={18} />
          </div>
        )}
      </div>
      <div
        className={`mt-1 flex min-h-[18px] items-center gap-1 truncate text-[11px] transition-all duration-200 ${
          selected ? 'text-stone-200' : 'text-stone-500 group-hover:text-stone-300'
        }`}
      >
        {playing && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
        <span className="truncate">{scene.name}</span>
      </div>
    </button>
  );
}

function SoundRow({
  channelId,
  label,
  icon,
  value,
  disabled = false,
  onChange,
}: {
  channelId: string;
  label: string;
  icon: ReactNode;
  value: number;
  disabled?: boolean;
  onChange: (channelId: string, value: number) => void;
}) {
  return (
    <div className={`flex h-8 items-center gap-2 transition-all duration-200 ${disabled ? 'opacity-45' : ''}`}>
      <div className="flex h-4 w-4 shrink-0 items-center justify-center text-stone-500">{icon}</div>
      <div className="w-[88px] shrink-0 truncate text-[12px] text-stone-300">{label}</div>
      <Slider disabled={disabled} title={label} value={value} onChange={(nextValue) => onChange(channelId, nextValue)} />
    </div>
  );
}

function PresetContextMenu({
  x,
  y,
  preset,
  onClose,
  onSetDefault,
  onOverwrite,
  onDelete,
}: {
  x: number;
  y: number;
  preset: Preset;
  onClose: () => void;
  onSetDefault: () => void;
  onOverwrite: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [onClose]);

  const itemClass =
    'block w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-stone-300 transition-all duration-200 hover:bg-white/10 hover:text-stone-50';

  return (
    <div
      className="fixed z-50 w-44 rounded-xl border border-white/[0.08] bg-stone-900/95 p-1 shadow-2xl backdrop-blur"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button className={itemClass} type="button" onClick={onSetDefault}>
        {preset.isDefault ? 'Default preset' : 'Set as default'}
      </button>
      <button className={itemClass} type="button" onClick={onOverwrite}>
        Overwrite with current
      </button>
      <button className={`${itemClass} text-red-300 hover:text-red-200`} type="button" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function PopoverApp() {
  const { manifest, state, setState } = useCampfireData();
  const [expandedSounds, setExpandedSounds] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; preset: Preset } | null>(null);

  const selectedSceneId = state?.currentSceneId ?? manifest.scenes[0]?.id ?? null;
  const selectedScene = manifest.scenes.find((scene) => scene.id === selectedSceneId) ?? manifest.scenes[0] ?? null;
  const currentMix = state?.mix ?? DEFAULT_MIX;
  const visibleSounds = expandedSounds ? manifest.sounds : manifest.sounds.slice(0, 6);

  const optimisticState = useCallback(
    (updater: (state: AppStateSnapshot) => AppStateSnapshot) => {
      setState((previous) => (previous ? updater(previous) : previous));
    },
    [setState],
  );

  const selectScene = useCallback(
    (sceneId: string) => {
      optimisticState((previous) => ({ ...previous, currentSceneId: sceneId }));
      void window.campfire.selectScene({ sceneId }).then(setState);
    },
    [optimisticState, setState],
  );

  const setMix = useCallback(
    (channelId: string, value: number) => {
      optimisticState((previous) => ({ ...previous, mix: { ...previous.mix, [channelId]: value } }));
      void window.campfire.setMix({ channelId, value }).then(setState);
    },
    [optimisticState, setState],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') {
        if (event.key === 'Escape') {
          window.close();
        }
        return;
      }
      const currentIndex = manifest.scenes.findIndex((scene) => scene.id === selectedSceneId);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && manifest.scenes.length > 0) {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -3 : 3;
        const nextIndex = (Math.max(0, currentIndex) + delta + manifest.scenes.length) % manifest.scenes.length;
        selectScene(manifest.scenes[nextIndex].id);
      }
      if (event.key === 'Enter' && selectedScene) {
        event.preventDefault();
        void window.campfire.startSession({ sceneId: selectedScene.id, mix: currentMix }).then(setState);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        window.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMix, manifest.scenes, selectScene, selectedScene, selectedSceneId, setState]);

  if (!state) {
    return (
      <main className="flex h-screen items-center justify-center bg-transparent p-[10px] font-[system-ui]">
        <div className="h-full w-full rounded-[22px] border border-white/[0.08] bg-stone-900/[0.97] p-[18px] text-stone-500 shadow-2xl">
          Warming up...
        </div>
      </main>
    );
  }

  const saveCurrentPreset = async () => {
    if (!selectedScene || !saveName.trim()) {
      return;
    }
    await window.campfire.savePreset({ name: saveName, sceneId: selectedScene.id, mix: currentMix });
    setSaveName('');
    setSaving(false);
  };

  const handlePresetKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void saveCurrentPreset();
    }
    if (event.key === 'Escape') {
      setSaveName('');
      setSaving(false);
    }
  };

  const sceneSoundDisabled = state.mode === 'audioOnly';

  return (
    <main className="h-screen overflow-hidden bg-transparent p-[10px] font-[system-ui]">
      <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-stone-900/[0.97] p-[18px] text-stone-50 shadow-2xl">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
              <FlameIcon size={15} />
            </div>
            <div className="text-[15px] font-medium text-stone-50">Campfire</div>
          </div>
          <div className="flex items-center gap-1">
            <TimerButton state={state} />
            <IconButton title="Open presets JSON" onClick={() => void window.campfire.openPresetsFile()}>
              <SettingsIcon size={15} />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <section>
            <SectionLabel>Scenes</SectionLabel>
            <div className="grid grid-cols-3 gap-[10px]">
              {manifest.scenes.map((scene) => (
                <SceneTile
                  key={scene.id}
                  playing={state.mode === 'video' && state.currentSceneId === scene.id}
                  scene={scene}
                  selected={selectedSceneId === scene.id}
                  onSelect={() => selectScene(scene.id)}
                />
              ))}
            </div>
          </section>

          <section className="mt-4">
            <SectionLabel>Sound mix</SectionLabel>
            <div className="space-y-1">
              <SoundRow
                channelId={SCENE_SOUND_ID}
                disabled={sceneSoundDisabled}
                icon={<FlameIcon size={14} />}
                label="Scene sound"
                value={mixValue(currentMix, SCENE_SOUND_ID)}
                onChange={setMix}
              />

              {manifest.sounds.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] px-3 py-2 text-[12px] text-stone-500">
                  Drop .mp3 loops into the sounds folder
                </div>
              ) : (
                visibleSounds.map((sound) => (
                  <SoundRow
                    key={sound.id}
                    channelId={sound.id}
                    icon={<SoundIcon name={sound.icon} size={14} />}
                    label={sound.name}
                    value={mixValue(currentMix, sound.id)}
                    onChange={setMix}
                  />
                ))
              )}

              {manifest.sounds.length > 6 && (
                <button
                  className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-stone-500 transition-all duration-200 hover:bg-white/5 hover:text-stone-300"
                  type="button"
                  onClick={() => setExpandedSounds((value) => !value)}
                >
                  <ChevronDownIcon className={expandedSounds ? 'rotate-180 transition-all duration-200' : 'transition-all duration-200'} size={13} />
                  {expandedSounds ? 'fewer channels' : `${manifest.sounds.length - 6} more channels`}
                </button>
              )}

              <SoundRow
                channelId={MASTER_ID}
                icon={<SoundIcon name="audio-waveform" size={14} />}
                label="Master"
                value={mixValue(currentMix, MASTER_ID)}
                onChange={setMix}
              />
            </div>
          </section>

          <section className="mt-4">
            <SectionLabel>Presets</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {state.presets.map((preset) => (
                <button
                  key={preset.id}
                  className={`flex max-w-[160px] items-center gap-1 rounded-full px-3 py-1.5 text-[12px] transition-all duration-200 active:scale-[0.98] ${
                    preset.id === state.activePresetId
                      ? 'bg-amber-400/15 text-amber-300'
                      : 'border border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
                  }`}
                  type="button"
                  onClick={() => void window.campfire.applyPreset({ id: preset.id }).then(setState)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, preset });
                  }}
                >
                  {preset.isDefault && <StarIcon size={10} />}
                  <span className="truncate">{preset.name}</span>
                </button>
              ))}

              {saving ? (
                <input
                  autoFocus
                  className="h-[28px] w-28 rounded-full border border-amber-400/30 bg-stone-950 px-3 text-[12px] text-stone-200 outline-none ring-1 ring-amber-400/30"
                  placeholder="Name"
                  value={saveName}
                  onBlur={() => {
                    if (!saveName.trim()) {
                      setSaving(false);
                    }
                  }}
                  onChange={(event) => setSaveName(event.currentTarget.value)}
                  onKeyDown={handlePresetKey}
                />
              ) : (
                <button
                  className="rounded-full border border-stone-700 px-3 py-1.5 text-[12px] text-stone-400 transition-all duration-200 hover:border-amber-400/40 hover:text-amber-300 active:scale-[0.98]"
                  type="button"
                  onClick={() => setSaving(true)}
                >
                  + save
                </button>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`h-10 rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.98] ${
                state.mode === 'video' ? 'bg-stone-700 text-stone-200' : 'bg-amber-400 text-amber-950 hover:bg-amber-300'
              }`}
              disabled={!selectedScene}
              type="button"
              onClick={() =>
                state.mode === 'video'
                  ? void window.campfire.stopSession().then(setState)
                  : selectedScene && void window.campfire.startSession({ sceneId: selectedScene.id, mix: currentMix }).then(setState)
              }
            >
              {state.mode === 'video' ? 'Stop session' : 'Start session'}
            </button>
            <button
              className="h-10 rounded-xl border border-stone-600 text-[13px] font-medium text-stone-300 transition-all duration-200 hover:border-stone-500 hover:bg-white/5 active:scale-[0.98]"
              type="button"
              onClick={() =>
                state.mode === 'audioOnly'
                  ? void window.campfire.stopAudio().then(setState)
                  : void window.campfire.startAudio({ mix: currentMix }).then(setState)
              }
            >
              {state.mode === 'audioOnly' ? 'Stop audio' : 'Audio only'}
            </button>
          </div>
          <div className="pt-3 text-center text-[11px] text-stone-500">Right-click the menu bar icon to resume instantly</div>
        </footer>
      </div>

      {contextMenu && (
        <PresetContextMenu
          preset={contextMenu.preset}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            void window.campfire.deletePreset({ id: contextMenu.preset.id }).then(() => setContextMenu(null));
          }}
          onOverwrite={() => {
            void window.campfire.overwritePreset({ id: contextMenu.preset.id }).then(() => setContextMenu(null));
          }}
          onSetDefault={() => {
            void window.campfire.setDefaultPreset({ id: contextMenu.preset.id }).then(() => setContextMenu(null));
          }}
        />
      )}
    </main>
  );
}

type AudioChannel = {
  audio: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
};

function AudioEngine() {
  const channels = useRef(new Map<string, AudioChannel>());
  const manifestRef = useRef<MediaManifest>({ scenes: [], sounds: [] });
  const mixRef = useRef<Mix>({});
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const pausedRef = useRef(false);
  const pauseTimers = useRef(new Map<string, number>());

  const ensureContext = useCallback(() => {
    if (!contextRef.current) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 1;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }
    return { context: contextRef.current, master: masterRef.current as GainNode };
  }, []);

  const refreshManifest = useCallback(async () => {
    manifestRef.current = await window.campfire.getManifest();
    return manifestRef.current;
  }, []);

  const ensureChannel = useCallback(
    (sound: SoundManifest) => {
      const existing = channels.current.get(sound.id);
      if (existing) {
        return existing;
      }
      const { context, master } = ensureContext();
      const audio = new Audio(sound.url);
      audio.loop = true;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(master);
      const channel = { audio, gain, source };
      channels.current.set(sound.id, channel);
      return channel;
    },
    [ensureContext],
  );

  const ramp = useCallback((param: AudioParam, value: number, seconds: number) => {
    const context = contextRef.current;
    if (!context) {
      return;
    }
    param.cancelScheduledValues(context.currentTime);
    param.setValueAtTime(param.value, context.currentTime);
    param.linearRampToValueAtTime(value, context.currentTime + seconds);
  }, []);

  const pauseLater = useCallback((channelId: string, audio: HTMLAudioElement, delayMs: number) => {
    const existing = pauseTimers.current.get(channelId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      if (mixValue(mixRef.current, channelId) === 0 || pausedRef.current) {
        audio.pause();
      }
      pauseTimers.current.delete(channelId);
    }, delayMs);
    pauseTimers.current.set(channelId, timer);
  }, []);

  const updateMediaSession = useCallback(async () => {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) {
      return;
    }
    const state = await window.campfire.getState();
    const scene = manifestRef.current.scenes.find((item) => item.id === state.currentSceneId);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: scene ? `Campfire - ${scene.name}` : 'Campfire',
      artist: 'Campfire',
      artwork: scene?.thumbnailUrl
        ? [
            {
              src: scene.thumbnailUrl,
              sizes: '512x512',
              type: 'image/png',
            },
          ]
        : [],
    });
    navigator.mediaSession.setActionHandler('play', () => {
      void window.campfire.resumePlayer();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      void window.campfire.pausePlayer();
    });
  }, []);

  const applyMix = useCallback(
    async (mix: Mix, fadeMs = 400) => {
      mixRef.current = { ...mix };
      const { context, master } = ensureContext();
      await context.resume();
      const freshManifest = await refreshManifest();
      ramp(master.gain, mixValue(mix, MASTER_ID) ** 2, fadeMs / 1000);

      for (const sound of freshManifest.sounds) {
        const target = pausedRef.current ? 0 : mixValue(mix, sound.id) ** 2;
        const channel = ensureChannel(sound);
        if (target > 0) {
          const pendingPause = pauseTimers.current.get(sound.id);
          if (pendingPause) {
            window.clearTimeout(pendingPause);
            pauseTimers.current.delete(sound.id);
          }
          await channel.audio.play().catch(console.warn);
        }
        ramp(channel.gain.gain, target, fadeMs / 1000);
        if (target === 0) {
          pauseLater(sound.id, channel.audio, fadeMs + 40);
        }
      }
      void updateMediaSession();
    },
    [ensureChannel, ensureContext, pauseLater, ramp, refreshManifest, updateMediaSession],
  );

  const fadeOutAndStop = useCallback(
    (durationMs = 400) => {
      for (const [channelId, channel] of channels.current) {
        ramp(channel.gain.gain, 0, durationMs / 1000);
        pauseLater(channelId, channel.audio, durationMs + 40);
      }
    },
    [pauseLater, ramp],
  );

  useEffect(() => {
    void refreshManifest();
    const removeApply = window.campfire.onAudioApply(({ mix }) => {
      pausedRef.current = false;
      void applyMix(mix, 400);
    });
    const removeVolume = window.campfire.onAudioVolume(({ channelId, value }) => {
      mixRef.current = { ...mixRef.current, [channelId]: value };
      void applyMix(mixRef.current, 150);
    });
    const removeStop = window.campfire.onAudioFadeOutAndStop((payload) => fadeOutAndStop(payload?.durationMs ?? 400));
    const removeState = window.campfire.onStateChanged((state) => {
      pausedRef.current = state.paused;
      if (state.mode === 'stopped') {
        fadeOutAndStop(state.fadeOutMs ?? 400);
        return;
      }
      if (state.paused) {
        fadeOutAndStop(200);
      } else {
        void applyMix(state.mix, 200);
      }
    });
    return () => {
      removeApply();
      removeVolume();
      removeStop();
      removeState();
      for (const timer of pauseTimers.current.values()) {
        window.clearTimeout(timer);
      }
      for (const channel of channels.current.values()) {
        channel.audio.pause();
      }
      contextRef.current?.close().catch(console.warn);
    };
  }, [applyMix, fadeOutAndStop, refreshManifest]);

  return <div className="hidden" />;
}

function SessionView() {
  const { manifest, state, setState } = useCampfireData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoVisible, setVideoVisible] = useState(false);
  const [fadeDuration, setFadeDuration] = useState(600);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  const scene = useMemo(
    () => manifest.scenes.find((item) => item.id === state?.currentSceneId) ?? manifest.scenes[0] ?? null,
    [manifest.scenes, state?.currentSceneId],
  );

  useEffect(() => {
    if (scene?.videoUrl && !videoUrl) {
      setVideoUrl(scene.videoUrl);
      window.setTimeout(() => setVideoVisible(true), 80);
    }
  }, [scene?.videoUrl, videoUrl]);

  const setVideoVolume = useCallback((value: number) => {
    if (videoRef.current) {
      videoRef.current.volume = clamp01(value);
    }
  }, []);

  const switchVideo = useCallback((nextUrl: string) => {
    setFadeDuration(300);
    setVideoVisible(false);
    window.setTimeout(() => {
      setVideoUrl(nextUrl);
      window.requestAnimationFrame(() => {
        setFadeDuration(300);
        setVideoVisible(true);
      });
    }, 300);
  }, []);

  useEffect(() => {
    const removeVolume = window.campfire.onVideoVolume(({ value }) => setVideoVolume(value));
    const removeSwitch = window.campfire.onVideoSwitch(({ videoUrl: nextUrl }) => switchVideo(nextUrl));
    return () => {
      removeVolume();
      removeSwitch();
    };
  }, [setVideoVolume, switchVideo]);

  useEffect(() => {
    if (!state) {
      return;
    }
    setVideoVolume(state.paused ? 0 : mixValue(state.mix, SCENE_SOUND_ID) ** 2 * mixValue(state.mix, MASTER_ID) ** 2);
    if (state.mode !== 'video') {
      setFadeDuration(state.fadeOutMs ?? 400);
      setVideoVisible(false);
      return;
    }
    if (state.paused) {
      window.setTimeout(() => videoRef.current?.pause(), 220);
    } else {
      void videoRef.current?.play().catch(console.warn);
      setVideoVisible(true);
    }
  }, [setVideoVolume, state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void window.campfire.stopSession().then(setState);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setState]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    setCursorHidden(false);
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => {
      setOverlayVisible(false);
      setCursorHidden(true);
    }, 3000);
  }, []);

  useEffect(() => {
    showOverlay();
    return () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
      }
    };
  }, [showOverlay]);

  if (!state) {
    return <div className="h-screen w-screen bg-black" />;
  }

  const clockText = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <main
      className={`relative h-screen w-screen overflow-hidden bg-black text-stone-50 ${cursorHidden ? 'cursor-none' : ''}`}
      onMouseMove={showOverlay}
    >
      {videoUrl && (
        <video
          ref={videoRef}
          autoPlay
          className={`h-full w-full object-cover object-center transition-opacity ease-out ${
            videoVisible && !state.paused ? 'opacity-100' : 'opacity-0'
          }`}
          loop
          playsInline
          src={videoUrl}
          style={{ transitionDuration: `${fadeDuration}ms` }}
          onLoadedData={() => {
            setVideoVolume(state.paused ? 0 : mixValue(state.mix, SCENE_SOUND_ID) ** 2 * mixValue(state.mix, MASTER_ID) ** 2);
            void videoRef.current?.play().catch(console.warn);
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: clamp01(state.settings.videoDimmer) * 0.6 }} />

      {state.settings.showClock && (
        <div className="pointer-events-none absolute right-8 top-7 text-[20px] font-light text-stone-200/70">{clockText}</div>
      )}

      <div
        className={`absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-900/70 px-4 py-2 text-stone-200 shadow-2xl backdrop-blur transition-all duration-200 ${
          overlayVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="max-w-[180px] truncate text-[12px] text-stone-300">{scene?.name ?? 'Campfire'}</div>
        <IconButton
          className="h-7 w-7"
          title={state.paused ? 'Resume' : 'Pause'}
          onClick={() => void (state.paused ? window.campfire.resumePlayer() : window.campfire.pausePlayer()).then(setState)}
        >
          {state.paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
        </IconButton>
        <TimerButton state={state} />
        <div className="flex w-28 items-center">
          <Slider
            title="Video dimmer"
            value={clamp01(state.settings.videoDimmer)}
            onChange={(value) => void window.campfire.setSetting({ key: 'videoDimmer', value }).then(setState)}
          />
        </div>
        <IconButton
          className={state.settings.showClock ? 'h-7 w-7 bg-amber-400/15 text-amber-300' : 'h-7 w-7'}
          title="Clock"
          onClick={() => void window.campfire.setSetting({ key: 'showClock', value: !state.settings.showClock }).then(setState)}
        >
          <ClockIcon size={14} />
        </IconButton>
        <IconButton className="h-7 w-7" title="Stop" onClick={() => void window.campfire.stopSession().then(setState)}>
          <XIcon size={14} />
        </IconButton>
      </div>
    </main>
  );
}

function App() {
  const route = window.location.hash.replace(/^#/, '') || '/popover';
  if (route === '/audio') {
    return <AudioEngine />;
  }
  if (route === '/session') {
    return <SessionView />;
  }
  return <PopoverApp />;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
