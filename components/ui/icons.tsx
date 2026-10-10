import type { ReactNode } from 'react';

/** Line icons, drawn at 24 units and inheriting colour. Decorative: always beside a text label. */
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-6 w-6'}>
      {children}
    </svg>
  );
}

export const Icons = {
  home: () => (
    <Svg>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </Svg>
  ),
  partners: () => (
    <Svg>
      <rect x="3" y="4" width="8" height="7" rx="2" />
      <rect x="13" y="4" width="8" height="7" rx="2" />
      <rect x="3" y="13" width="8" height="7" rx="2" />
      <rect x="13" y="13" width="8" height="7" rx="2" />
    </Svg>
  ),
  printer: () => (
    <Svg>
      <path d="M7 9V3.5h10V9" />
      <rect x="3" y="9" width="18" height="8" rx="2.5" />
      <path d="M7 14h10v6.5H7z" />
    </Svg>
  ),
  alert: () => (
    <Svg>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </Svg>
  ),
  more: () => (
    <Svg>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Svg>
  ),
  menu: () => (
    <Svg>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Svg>
  ),
  search: () => (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  ),
  theme: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  logout: () => (
    <Svg>
      <path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H9" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </Svg>
  ),
  chevron: () => (
    <Svg className="h-4 w-4">
      <path d="m9 6 6 6-6 6" />
    </Svg>
  ),
  refresh: () => (
    <Svg>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Svg>
  ),
};
