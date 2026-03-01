import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" {...props} />;
}

export function TerminalIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16v12H4z" />
      <path d="M8 10l2 2-2 2" />
      <path d="M12 14h4" />
    </BaseIcon>
  );
}

export function BrowserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9h17" />
      <circle cx="6.7" cy="7" r="0.8" fill="currentColor" />
      <circle cx="9.6" cy="7" r="0.8" fill="currentColor" />
      <circle cx="12.5" cy="7" r="0.8" fill="currentColor" />
    </BaseIcon>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3H3v5" />
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M16 21h5v-5" />
      <path d="M3 3l6 6" />
      <path d="M21 3l-6 6" />
      <path d="M3 21l6-6" />
      <path d="M21 21l-6-6" />
    </BaseIcon>
  );
}

export function CompressIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 9H4V4" />
      <path d="M15 9h5V4" />
      <path d="M9 15H4v5" />
      <path d="M15 15h5v5" />
      <path d="M4 4l6 6" />
      <path d="M20 4l-6 6" />
      <path d="M4 20l6-6" />
      <path d="M20 20l-6-6" />
    </BaseIcon>
  );
}

export function ThemeDarkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </BaseIcon>
  );
}

export function ThemeLightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </BaseIcon>
  );
}

export function TodoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16M4 12h10M4 17h8" />
    </BaseIcon>
  );
}

export function RunningIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 4h8l-2 6h6L9 20l2-6H5z" />
    </BaseIcon>
  );
}

export function DoneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.8 12.4l2.2 2.2 4.4-4.4" />
    </BaseIcon>
  );
}

export function FailedIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
      <path d="M10.3 3.6L2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
    </BaseIcon>
  );
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 10v1a6 6 0 0 0 12 0v-1" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </BaseIcon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </BaseIcon>
  );
}

export function PulseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 12h4l2.2-5 3.6 10 2.4-5H21" />
      <circle cx="12" cy="12" r="9" />
    </BaseIcon>
  );
}
