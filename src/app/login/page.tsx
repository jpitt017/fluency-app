'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type PendingAction = 'auth' | 'reset' | null;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const safeNext = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handlePasswordReset() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Enter your email address first.');
      setMessage(null);
      return;
    }

    setPendingAction('reset');
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });

      if (resetError) throw resetError;
      setMessage('If an account exists for that email, a password-reset link will be sent.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send a password-reset email.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction('auth');
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signUpError) throw signUpError;

        if (data.user && !data.session) {
          setMessage('Check your email for a confirmation link to activate your account.');
        } else {
          router.push('/onboarding/placement');
          router.refresh();
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) throw signInError;

        router.push(safeNext);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected authentication error occurred.');
    } finally {
      setPendingAction(null);
    }
  }

  function toggleAuthMode() {
    setIsSignUp((current) => !current);
    setError(null);
    setMessage(null);
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
      <div className="mb-7 text-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
          English B1 → B2 · Fluency Studio
        </span>
        <h1 className="mt-1.5 text-2xl font-bold text-stone-900">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm text-stone-600">
          {isSignUp
            ? 'Start your 64-hour B1 → B2 study workspace'
            : 'Sign in to continue your lessons, SRS reviews, and AI labs'}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <form onSubmit={handleAuth} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-600">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-600">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <button
          type="submit"
          disabled={pendingAction !== null}
          className="w-full cursor-pointer rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:bg-indigo-400"
        >
          {pendingAction === 'auth'
            ? isSignUp
              ? 'Creating account…'
              : 'Signing in…'
            : isSignUp
              ? 'Create account'
              : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-stone-100 pt-5 text-center">
        <button
          type="button"
          onClick={toggleAuthMode}
          disabled={pendingAction !== null}
          className="cursor-pointer text-xs font-semibold text-indigo-700 hover:underline disabled:text-stone-400"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

        {!isSignUp && (
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={pendingAction !== null}
            className="cursor-pointer text-xs font-semibold text-stone-600 hover:text-stone-900 hover:underline disabled:text-stone-400"
          >
            {pendingAction === 'reset' ? 'Sending reset link…' : 'Forgot password?'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="h-80 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
