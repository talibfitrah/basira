type P = { className?: string };
const base = (d: React.ReactNode, className = "w-5 h-5") => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const IconSend = ({ className }: P) => base(<><path d="M5 12h14" /><path d="M11 6l-6 6 6 6" /></>, className);
export const IconStop = ({ className }: P) => base(<rect x="7" y="7" width="10" height="10" rx="1.5" />, className);
export const IconPlus = ({ className }: P) => base(<><path d="M12 5v14" /><path d="M5 12h14" /></>, className);
export const IconClip = ({ className }: P) => base(<path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7L14 4.5a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4L15.5 7.6" />, className);
export const IconMic = ({ className }: P) => base(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0" /><path d="M12 18v3" /></>, className);
export const IconGlobe = ({ className }: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 010 18a14 14 0 010-18" /></>, className);
export const IconCode = ({ className }: P) => base(<><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /><path d="M14 5l-4 14" /></>, className);
export const IconBook = ({ className }: P) => base(<><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /><path d="M9 7h6" /></>, className);
export const IconImage = ({ className }: P) => base(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>, className);
export const IconChat = ({ className }: P) => base(<path d="M4 5h16v11H9l-5 4z" />, className);
export const IconUser = ({ className }: P) => base(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>, className);
export const IconShield = ({ className }: P) => base(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />, className);
export const IconMenu = ({ className }: P) => base(<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>, className);
export const IconX = ({ className }: P) => base(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, className);
export const IconTrash = ({ className }: P) => base(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>, className);
export const IconCopy = ({ className }: P) => base(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></>, className);
export const IconCheck = ({ className }: P) => base(<path d="M5 12l5 5 9-10" />, className);
export const IconSpeaker = ({ className }: P) => base(<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9a4 4 0 010 6" /></>, className);
export const IconMoon = ({ className }: P) => base(<path d="M20 14A8 8 0 1110 4a6 6 0 0010 10z" />, className);
export const IconSearch = ({ className }: P) => base(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>, className);
export const IconSpark = ({ className }: P) => base(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />, className);
export const IconLock = ({ className }: P) => base(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>, className);
export const IconDownload = ({ className }: P) => base(<><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>, className);
export const IconLogout = ({ className }: P) => base(<><path d="M10 4H5v16h5" /><path d="M14 8l-4 4 4 4" /><path d="M10 12h10" /></>, className);
export const IconSettings = ({ className }: P) => base(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2L10 21h4l.6-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>, className);

export function Logo({ className = "w-8 h-8" }: P) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--color-brand)" />
      <path d="M20 9c-5.5 6.5-8.5 11-8.5 15a8.5 8.5 0 0017 0c0-4-3-8.5-8.5-15z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="20" cy="24" r="3.2" fill="var(--color-gold)" />
    </svg>
  );
}
