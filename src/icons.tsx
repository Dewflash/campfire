import type { SVGProps } from 'react';
import type { SoundIconName } from './types';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8.5 14.5A3.5 3.5 0 0 0 12 18a3.5 3.5 0 0 0 3.5-3.5c0-1.9-1.2-3.1-2.2-4.1-.8-.8-1.5-1.5-1.3-2.7-2.7 1.5-4.8 3.8-3.5 6.8Z" />
      <path d="M12 22c4 0 7-2.8 7-6.9 0-2.7-1.5-5.3-4.4-7.8-2.3-2-2.7-3.4-2.1-5.3C8.5 4 5 8 5 13.8 5 18.6 8.1 22 12 22Z" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </IconBase>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12.5 2.5a8.5 8.5 0 1 0 9 9 6.5 6.5 0 0 1-9-9Z" />
    </IconBase>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <IconBase {...props} fill="currentColor" strokeWidth="1.5">
      <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 5 11 7-11 7V5Z" />
    </IconBase>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 4v16" />
      <path d="M14 4v16" />
    </IconBase>
  );
}

export function XIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}

function CloudRainIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 14.9A5 5 0 0 1 6.2 5.4 7 7 0 0 1 19 9a4 4 0 0 1 1 7.9" />
      <path d="M8 19v1" />
      <path d="M12 19v1" />
      <path d="M16 19v1" />
    </IconBase>
  );
}

function CloudLightningIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 14.9A5 5 0 0 1 6.2 5.4 7 7 0 0 1 19 9a4 4 0 0 1 1 7.9" />
      <path d="m13 11-3 5h4l-2 5" />
    </IconBase>
  );
}

function WindIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M4 12h14a3 3 0 1 1-3 3" />
      <path d="M2 16h9" />
    </IconBase>
  );
}

function WavesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </IconBase>
  );
}

function LeafIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M11 20A7 7 0 0 1 4 13c0-7 8-9 16-9 0 8-2 16-9 16Z" />
      <path d="M4 20c4-4 8-8 16-16" />
    </IconBase>
  );
}

function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 21h4" />
    </IconBase>
  );
}

function BirdIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 7h.01" />
      <path d="M3 18c5 0 8-3 9-8 1.8 2 4.7 3 8 3-2 3-4.5 5-8 5H3Z" />
      <path d="m18 7 3-2-1 4" />
    </IconBase>
  );
}

function BugIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0V8Z" />
      <path d="M3 13h5" />
      <path d="M16 13h5" />
      <path d="m5 7 3 3" />
      <path d="m19 7-3 3" />
      <path d="M12 4V2" />
    </IconBase>
  );
}

function BuildingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01" />
      <path d="M9 13v.01" />
      <path d="M9 17v.01" />
    </IconBase>
  );
}

function TrainIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3h12a3 3 0 0 1 3 3v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V6a3 3 0 0 1 3-3Z" />
      <path d="M8 21l2-3" />
      <path d="m16 18 2 3" />
      <path d="M7 8h10" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </IconBase>
  );
}

function SnowflakeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2v20" />
      <path d="m17 4-5 5-5-5" />
      <path d="m17 20-5-5-5 5" />
      <path d="M2 12h20" />
      <path d="m4 7 5 5-5 5" />
      <path d="m20 7-5 5 5 5" />
    </IconBase>
  );
}

function CoffeeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
      <path d="M6 2v2" />
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M3 21h15" />
    </IconBase>
  );
}

function AudioWaveformIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12h2" />
      <path d="M7 5v14" />
      <path d="M11 9v6" />
      <path d="M15 3v18" />
      <path d="M19 8v8" />
      <path d="M21 12h-2" />
    </IconBase>
  );
}

const soundIconMap: Record<SoundIconName, (props: IconProps) => JSX.Element> = {
  'audio-waveform': AudioWaveformIcon,
  bell: BellIcon,
  bird: BirdIcon,
  bug: BugIcon,
  buildings: BuildingsIcon,
  'cloud-lightning': CloudLightningIcon,
  'cloud-rain': CloudRainIcon,
  coffee: CoffeeIcon,
  flame: FlameIcon,
  leaf: LeafIcon,
  moon: MoonIcon,
  snowflake: SnowflakeIcon,
  train: TrainIcon,
  waves: WavesIcon,
  wind: WindIcon,
};

export function SoundIcon({ name, ...props }: IconProps & { name: SoundIconName }) {
  const Component = soundIconMap[name];
  return <Component {...props} />;
}
