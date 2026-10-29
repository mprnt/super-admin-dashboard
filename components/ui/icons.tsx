import type { ReactNode } from 'react';

/** Line icons, drawn at 24 units and inheriting colour. Decorative: always beside a text label. */
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-5 w-5'}
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const Icons = {
  home: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </Svg>
  ),
  partners: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M4 20V9.5L8 6l4 3.5V20" />
      <path d="M12 20v-7.5l4-3 4 3V20" />
      <path d="M3 20h18M7 13h2M7 16.5h2M15 15h2" />
    </Svg>
  ),
  printer: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M7 9V3.5h10V9" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v6.5H7z" />
    </Svg>
  ),
  qr: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 20.5h2" />
    </Svg>
  ),
  alert: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </Svg>
  ),
  sessions: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </Svg>
  ),
  billing: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
      <path d="M6 6V4.5h12V6" />
    </Svg>
  ),
  pricing: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </Svg>
  ),
  reports: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" />
    </Svg>
  ),
  queue: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </Svg>
  ),
  leads: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
      <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
    </Svg>
  ),
  staff: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Svg>
  ),
  permissions: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  audit: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  account: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19.5a7 7 0 0 1 13 0" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  ),
  onboarding: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M9 4.5H6.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-14a1 1 0 0 0-1-1H15" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M12 10v6M9 13h6" />
    </Svg>
  ),
  plus: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  check: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  cross: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  more: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Svg>
  ),
  menu: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Svg>
  ),
  search: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  ),
  theme: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  logout: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H9" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </Svg>
  ),
  chevron: ({ className }: IconProps = {}) => (
    <Svg className={className ?? 'h-4 w-4'}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  ),
  chevronDown: ({ className }: IconProps = {}) => (
    <Svg className={className ?? 'h-4 w-4'}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  refresh: ({ className }: IconProps = {}) => (
    <Svg className={className}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icons;
