'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type PendingAction = 'auth' | 'reset' | null;

export default function LoginPage() {
  const router = useRouter();
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/auth/callback` },
      );

      if (resetError) throw resetError;
      setMessage('If an account exists for that email, a password-reset link will be sent.');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send a password-reset email.',
      );
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

        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected authentication error occurred.',
      );
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
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {isSignUp ? 'Create Your Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            {isSignUp
              ? 'Start your B1 British English fluency journey'
              : 'Sign in to continue your lessons and speaking labs'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
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
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
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
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={pendingAction !== null}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            {pendingAction === 'auth'
              ? isSignUp ? 'Creating Account...' : 'Signing In...'
              : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <button
            type="button"
            onClick={toggleAuthMode}
            disabled={pendingAction !== null}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer disabled:text-slate-400"
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>

          {!isSignUp && (
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={pendingAction !== null}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer disabled:text-slate-400"
            >
              {pendingAction === 'reset' ? 'Sending reset link…' : 'Forgot password?'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
