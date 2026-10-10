'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_CHOICES, THEME_STORAGE_KEY, isThemeChoice, type ThemeChoice } from '../../lib/theme.ts';
import { cx } from './primitives';

interface ThemeValue {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const Ctx = createContext<ThemeValue | null>(null);

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  // Read the saved choice once the page is up. The layout script has already set
  // the attribute before paint, so this only keeps the toggle in step with it.
  useEffect(() => {
    let saved: unknown = null;
    try {
      saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (isThemeChoice(saved)) setChoiceState(saved);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    apply(next);
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be blocked. The theme still applies for this visit.
    }
  }, []);

  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/** A three-way switch: System, Light, Dark. Each option is a full-size tap target. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cx('inline-flex rounded-full border border-line bg-surface p-1', className)}>
      {THEME_CHOICES.map((option) => {
        const on = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setChoice(option.value)}
            className={cx(
              'min-h-[40px] rounded-full px-4 text-sm font-medium transition',
              on ? 'bg-brand text-brand-ink shadow-sm' : 'text-mute hover:text-ink'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
