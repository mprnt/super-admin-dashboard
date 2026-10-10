'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { call, messageOf } from './api';
import type { Kiosk, Organization, Printer, StaffUser } from '../types';

/**
 * The whole platform's shape, loaded once and refreshed after every change:
 * partners, QR points, printers and staff. The tree, the command palette and
 * the list pages all read from here, so a change made on one page shows on
 * every other without a manual reload.
 *
 * Detail pages still fetch their own record, so a single view never shows
 * stale figures for longer than the next change.
 */

export interface ConsoleData {
  organizations: Organization[];
  kiosks: Kiosk[];
  printers: Printer[];
  users: StaffUser[];
  ready: boolean;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<ConsoleData | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    organizations: Organization[];
    kiosks: Kiosk[];
    printers: Printer[];
    users: StaffUser[];
    ready: boolean;
    error: string | null;
  }>({ organizations: [], kiosks: [], printers: [], users: [], ready: false, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;

    Promise.all([
      call<{ organizations: Organization[] }>('GET', 'organizations'),
      call<{ kiosks: Kiosk[] }>('GET', 'kiosks'),
      call<{ printers: Printer[] }>('GET', 'printers'),
      call<{ users: StaffUser[] }>('GET', 'users'),
    ])
      .then(([orgs, kiosks, printers, users]) => {
        if (!live) return;
        setState({
          organizations: orgs.organizations,
          kiosks: kiosks.kiosks,
          printers: printers.printers,
          users: users.users,
          ready: true,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (!live) return;
        setState((s) => ({ ...s, ready: true, error: messageOf(e) }));
      });

    return () => {
      live = false;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo<ConsoleData>(() => ({ ...state, reload }), [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsole(): ConsoleData {
  const value = useContext(Ctx);
  if (!value) throw new Error('useConsole must be used inside ConsoleProvider');
  return value;
}

/**
 * Fetches one resource, and refetches on demand. Keeps the previous data while
 * reloading, so a refresh does not blank the page.
 */
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    call<T>('GET', path)
      .then((data) => {
        if (live) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (live) setState((s) => ({ ...s, error: messageOf(e), loading: false }));
      });
    return () => {
      live = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
