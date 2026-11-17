'use client';

import { useState } from 'react';

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize checkout session.');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned from server.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            🇬🇧 B1 British English Platform
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Unlock All Sessions</h1>
          <p className="text-sm text-gray-600 mt-2">
            Get unlimited access to AI conversational speaking labs, writing correctors, and British RP audio evaluations.
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100 text-left">
            ⚠️ {errorMessage}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
          <span className="text-3xl font-extrabold text-blue-900">£19</span>
          <span className="text-xs text-blue-700 font-medium"> / month</span>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              {/* Animated Spinner SVG */}
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Connecting to Stripe...</span>
            </>
          ) : (
            <span>Upgrade to Premium</span>
          )}
        </button>

        <p className="text-xs text-gray-400">
          Secure payment processed by Stripe. Cancel anytime.
        </p>
      </div>
    </main>
  );
}