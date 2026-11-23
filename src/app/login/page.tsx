'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import {
  buildRedirectTo,
  emailLinksEnabled,
  EMAIL_LINKS_ENABLED_ENV,
  isSignupsClosedError,
  RESET_LINK_REPLACEMENT,
  SIGNUP_DESTINATION,
  SIGNUP_OUTCOMES,
  SIGNUPS_CLOSED_MESSAGE,
  SIGNUPS_ENABLED_ENV,
  signUpOutcome,
  signupsEnabled,
  UPDATE_PASSWORD_PATH,
} from '@/lib/auth/email-links.mjs';

type PendingAction = 'auth' | 'magic' | 'reset' | null;

function formatAuthError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : fallback;
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Email sending limit reached (Supabase default allows 2 emails/hour without custom SMTP). Sign in with your password above, or wait before requesting another link.';
  }
  return raw;
}

function LoginForm({ emailLinks, signupsOpen }: { emailLinks: boolean; signupsOpen: boolean }) {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const mode = searchParams.get('mode');
  const callbackError = searchParams.get('error');
  const safeNext =
    nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard';
  const isUpdatePassword = mode === 'update-password';
  // ?mode=sign-up opens the sign-up tab directly, so a link to "create an
  // account" does not land on a sign-in form that asks for a password the
  // visitor does not have yet.
  const startsInSignUpMode = mode === 'sign-up' || mode === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(startsInSignUpMode);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    callbackError === 'auth_callback_failed'
      ? 'Your sign-in link expired or was already used. Sign in with your password or request a fresh link.'
      : null,
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled && data.user?.email) {
          setSignedInEmail(data.user.email);
        }
      });
    } catch {
      /* Env vars missing in offline build mode */
    }
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMagicLink() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Enter your email address first.');
      setMessage(null);
      return;
    }

    setPendingAction('magic');
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: buildRedirectTo(window.location.origin, safeNext),
        },
      });
      if (otpError) throw otpError;
      setMessage('Check your email for a one-time sign-in link.');
    } catch (err: unknown) {
      setError(formatAuthError(err, 'Unable to send a sign-in link.'));
    } finally {
      setPendingAction(null);
    }
  }

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
        // Encoded once: GoTrue re-encodes the whole URL it embeds in redirect_to,
        // and encoding twice arrives as %252F… which the callback cannot use.
        redirectTo: buildRedirectTo(window.location.origin, UPDATE_PASSWORD_PATH),
      });

      if (resetError) throw resetError;
      setMessage('If an account exists for that email, a password-reset link will be sent.');
    } catch (err: unknown) {
      setError(formatAuthError(err, 'Unable to send a password-reset email.'));
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

      if (isUpdatePassword) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        window.location.assign(safeNext);
        return;
      }

      const normalizedEmail = email.trim();

      if (isSignUp) {
        // Closed signup: say what to do instead of posting a request that
        // GoTrue answers with "Signups not allowed for this instance".
        if (!signupsOpen) {
          setError(SIGNUPS_CLOSED_MESSAGE);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: buildRedirectTo(window.location.origin, safeNext),
          },
        });

        if (signUpError) throw signUpError;

        const outcome = signUpOutcome(data);
        if (outcome === SIGNUP_OUTCOMES.existing) {
          setIsSignUp(false);
          setError('An account with this email already exists. Sign in below or reset your password.');
          return;
        }

        if (outcome === SIGNUP_OUTCOMES.confirmEmail) {
          setMessage('Check your email for a confirmation link to activate your account.');
          return;
        }

        // "Confirm email" is off, so the account is usable now. Send the new
        // learner to placement: they have no band yet, and the dashboard has
        // nothing to show until the quiz has run.
        // Full document navigation ensures Server Components and AppHeader read fresh auth cookies immediately.
        window.location.assign(SIGNUP_DESTINATION);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) throw signInError;
        if (!data.session) {
          throw new Error('Signed in, but no browser session was created. Please try again.');
        }
        if (!document.cookie.includes('sb-')) {
          setError(
            'Your browser blocked session cookies inside this embedded preview. Open this page in a new tab to sign in.',
          );
          return;
        }

        // Full document navigation ensures Server Components and AppHeader read fresh auth cookies immediately.
        window.location.assign(safeNext);
      }
    } catch (err: unknown) {
      // The setting can be stale in a long-open tab, and the server is the real
      // authority either way, so translate the refusal here too rather than
      // showing a learner GoTrue's own wording.
      setError(
        isSignupsClosedError(err)
          ? SIGNUPS_CLOSED_MESSAGE
          : formatAuthError(err, 'An unexpected authentication error occurred.'),
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
    <div className="mx-auto w-full max-w-md rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] sm:p-8">
      <div className="mb-7 text-center">
        <span className="inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
          English B1 → B2 · Fluency Studio
        </span>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-stone-900">
          {isUpdatePassword
            ? 'Set a new password'
            : isSignUp
              ? signupsOpen
                ? 'Create your account'
                : 'Sign-up is closed'
              : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm text-stone-600">
          {isUpdatePassword
            ? 'Choose a new password (at least 6 characters) for your account'
            : isSignUp
              ? signupsOpen
                ? 'Start your B1 → B2 study workspace'
                : 'Pilot accounts are made by your teacher'
              : 'Sign in to practise and review your mistakes'}
        </p>
      </div>

      {signedInEmail && !isUpdatePassword && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
          <p className="font-semibold">Already signed in as {signedInEmail}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.assign(safeNext);
              }}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800"
            >
              Continue to {safeNext === '/dashboard' ? 'Dashboard' : safeNext} →
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p>{error}</p>
          {error.includes('embedded preview') && (
            <a
              href={`/login?next=${encodeURIComponent(safeNext)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 underline"
            >
              Open login in a new tab ↗
            </a>
          )}
        </div>
      )}

      {message && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Closed signup shows the reason and a way forward instead of a form
          that cannot submit: one short sentence, then the form that works. */}
      {isSignUp && !signupsOpen ? (
        <div className="space-y-4">
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900"
          >
            {SIGNUPS_CLOSED_MESSAGE}
          </div>
          <button
            type="button"
            onClick={toggleAuthMode}
            className="w-full cursor-pointer rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800"
          >
            Go to sign in
          </button>
        </div>
      ) : (
      <form onSubmit={handleAuth} className="space-y-4">
        {!isUpdatePassword && (
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-stone-600">
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
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-stone-600">
              {isUpdatePassword ? 'New password' : 'Password'}
            </label>
            {!isSignUp && !isUpdatePassword && emailLinks && (
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={pendingAction !== null}
                className="cursor-pointer text-xs font-medium text-indigo-700 hover:underline disabled:text-stone-400"
              >
                {pendingAction === 'reset' ? 'Sending reset link…' : 'Forgot password?'}
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={isSignUp || isUpdatePassword ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-3.5 pr-10 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 hover:text-stone-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={pendingAction !== null}
          className="w-full cursor-pointer rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:bg-indigo-400"
        >
          {pendingAction === 'auth'
            ? isUpdatePassword
              ? 'Updating password…'
              : isSignUp
                ? 'Creating account…'
                : 'Signing in…'
            : isUpdatePassword
              ? 'Save new password'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
        </button>

        {!isSignUp && !isUpdatePassword && emailLinks && (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={pendingAction !== null}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5 text-indigo-700" />
            <span>{pendingAction === 'magic' ? 'Sending link…' : 'Email me a one-time link'}</span>
          </button>
        )}
      </form>
      )}

      {/* Without SMTP a reset link can only fail, so point at a person instead. */}
      {!emailLinks && !isSignUp && !isUpdatePassword && (
        <p className="mt-4 text-center text-xs text-stone-600">
          {RESET_LINK_REPLACEMENT}
        </p>
      )}

      {!isUpdatePassword && (
        <p className={`${emailLinks || isSignUp ? 'mt-6 border-t border-stone-100 pt-5' : 'mt-4'} text-center text-xs text-stone-600`}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={toggleAuthMode}
            disabled={pendingAction !== null}
            className="cursor-pointer font-semibold text-indigo-700 underline-offset-2 hover:underline disabled:text-stone-400"
          >
            {isSignUp ? 'Switch to login' : 'Sign up'}
          </button>
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  // Read on the server and passed in, so the setting is evaluated when the page
  // is requested rather than frozen into the client bundle at build time.
  const emailLinks = emailLinksEnabled(process.env[EMAIL_LINKS_ENABLED_ENV]);
  const signupsOpen = signupsEnabled(process.env[SIGNUPS_ENABLED_ENV]);
  return (
    <main className="flex min-h-[calc(100vh-140px)] items-start justify-center px-4 py-6 sm:items-center sm:py-10">
      <Suspense fallback={<div className="mx-auto h-80 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8" />}>
        <LoginForm emailLinks={emailLinks} signupsOpen={signupsOpen} />
      </Suspense>
    </main>
  );
}
