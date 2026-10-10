/**
 * The operator's theme choice. Pure: the constants are shared by the layout's
 * before-paint script and the client toggle.
 *
 * The choice is a display preference, stored on this device only. It holds
 * nothing about the account and nothing decides access from it.
 */

export const THEME_STORAGE_KEY = 'mprnt-platform-theme';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The next choice when the toggle is tapped: system, then light, then dark. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}
