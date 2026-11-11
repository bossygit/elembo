import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function ArrowRight(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 12h15" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path d="m5 12.5 4.2 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Menu(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function Close(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

export function Mail(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m3.5 6.5 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pin(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function Phone(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path
        d="M7.2 3.8h2.1l1.2 4.1-2 1.3a12 12 0 0 0 6.3 6.3l1.3-2 4.1 1.2v2.1a2.6 2.6 0 0 1-2.8 2.6A16.5 16.5 0 0 1 4.6 6.6a2.6 2.6 0 0 1 2.6-2.8Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bulle de discussion — utilisée pour l'assistance WhatsApp. */
export function Chat(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" {...props}>
      <path
        d="M4 19.5 5.3 16A8 8 0 1 1 8 18.7L4 19.5Z"
        strokeLinejoin="round"
      />
      <path d="M9 10.5h6M9 13.5h4" strokeLinecap="round" />
    </svg>
  );
}

export function Gift(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
      <path d="M5 12.5V20h14v-7.5M12 8.5V20" strokeLinejoin="round" />
      <path d="M12 8.5S10.8 4 8.5 4.3C6.6 4.6 7 8.5 12 8.5Zm0 0s1.2-4.5 3.5-4.2c1.9.3 1.5 4.2-3.5 4.2Z" strokeLinejoin="round" />
    </svg>
  );
}

export function Shirt(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path
        d="M9 3.5 3.5 6.5l2 4 2-1V20.5h9V9.5l2 1 2-4L15 3.5a3 3 0 0 1-6 0Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Celebration(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M4 20.5 8.5 8l7.5 7.5L4 20.5Z" strokeLinejoin="round" />
      <path d="M14 4v2M19.5 9.5h-2M17.5 5.5 16 7M12.5 9.5c1-1.5 1-3 0-4.5M14.5 11.5c1.5-1 3-1 4.5 0" strokeLinecap="round" />
    </svg>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z" strokeLinejoin="round" />
      <path d="M18.5 16v4M16.5 18h4" strokeLinecap="round" />
    </svg>
  );
}
