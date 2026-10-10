'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { safeNextPath, PASSWORD_CHANGE_PATH } from '../../lib/gate';
import { Button, Field, Input, Notice } from '../ui/primitives';

const NOTICES: Record<string, string> = {
  expired: 'Your session has ended. Sign in again.',
  idle: 'You were signed out after 20 minutes without activity.',
  platform: 'That account does not have platform access.',
  changed: 'Password changed. Sign in with the new one.',
};

export function LoginForm() {
  const params = useSearchParams();
  const notice = NOTICES[params.get('notice') ?? ''] ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; mustChangePassword?: boolean };

      if (!res.ok) {
        setPassword('');
        setError(body.message || 'Unable to sign in');
        setBusy(false);
        return;
      }

      // Temporary passwords go to the account page before anything else.
      const next = body.mustChangePassword ? PASSWORD_CHANGE_PATH : safeNextPath(params.get('next'));
      window.location.assign(next);
    } catch {
      setError('Could not reach the console server. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <h2 className="text-xl font-semibold tracking-tight text-ink">Sign in</h2>

      {notice && <Notice tone="info">{notice}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      <Field label="Email">
        <Input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Password">
        <Input type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>

      <Button variant="primary" type="submit" disabled={busy || !email || !password} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
