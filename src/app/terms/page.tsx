export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-zinc-800 dark:text-zinc-200">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-zinc-500 mb-8">Last updated: November 17, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">1. Agreement to Terms</h2>
        <p>
          By accessing or using the B1 British English Platform (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">2. Subscriptions & Billing</h2>
        <p>
          Some parts of the Service are billed on a subscription basis (&quot;Subscription&quot;). You will be billed in advance on a recurring and periodic basis. Subscriptions are processed securely via Stripe. You may cancel your subscription at any time through your account dashboard or billing portal.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">3. AI-Generated Content & Limitations</h2>
        <p>
          Our platform utilizes artificial intelligence (including Groq Whisper and LLM APIs) to generate writing corrections, speaking evaluations, and structured feedback. While we strive for high accuracy, AI outputs may occasionally contain errors, omissions, or misinterpretations. The Service is provided for educational purposes and should not be relied upon as infallible professional linguistic certification.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">4. User Conduct</h2>
        <p>
          You agree not to misuse the platform, attempt to bypass rate limits or security filters, upload malicious audio files, or use the AI endpoints for automated scraping or unauthorized commercial reselling.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">5. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact support via your account dashboard.
        </p>
      </section>
    </main>
  );
}