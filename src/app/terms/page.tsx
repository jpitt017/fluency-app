export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-stone-800 sm:px-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <h1 className="text-3xl font-bold text-stone-900">Terms of Service</h1>
        <p className="mt-2 mb-8 text-xs text-stone-500">Last updated: November 19, 2026</p>

        <section className="space-y-6 text-sm leading-relaxed text-stone-700">
          <div>
            <h2 className="text-base font-semibold text-stone-900">1. Agreement to Terms</h2>
            <p className="mt-1.5">
              By accessing or using Fluency Studio (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you disagree with any part of these terms, please discontinue use of the Service.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">2. Subscriptions &amp; Billing</h2>
            <p className="mt-1.5">
              Paid memberships are billed in advance on a recurring basis and processed securely via Stripe. You may cancel your subscription at any time through your account billing portal.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">3. AI-Generated Content &amp; Limitations</h2>
            <p className="mt-1.5">
              Our platform uses AI models to generate writing corrections, speaking evaluations, and structured feedback. AI feedback is designed for educational practice and should not be treated as official CEFR certification.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">4. User Conduct</h2>
            <p className="mt-1.5">
              You agree not to misuse the platform, bypass rate limits or security controls, upload malicious files, or use AI endpoints for automated scraping.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
