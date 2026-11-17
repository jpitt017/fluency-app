export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-zinc-800 dark:text-zinc-200">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-zinc-500 mb-8">Last updated: November 17, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">1. Information We Collect</h2>
        <p>
          We collect information you provide directly when creating an account, such as your email address and authentication credentials via Supabase. When you use our speaking and writing labs, we temporarily process your voice audio and text inputs to generate AI-driven feedback.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">2. How We Use Your Information</h2>
        <p>
          Your information is used to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide, maintain, and improve our English learning labs and assessments.</li>
          <li>Process transactions and manage subscription billing securely via Stripe.</li>
          <li>Send administrative notifications, password resets, and account updates.</li>
        </ul>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">3. Third-Party Service Providers</h2>
        <p>
          We share data only with essential trusted subprocessors required to run the platform:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Supabase:</strong> For secure database hosting and user authentication.</li>
          <li><strong>Groq:</strong> For processing speech-to-text (Whisper) and language model feedback.</li>
          <li><strong>Stripe:</strong> For secure payment processing and subscription management (we never store raw credit card numbers on our servers).</li>
        </ul>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">4. Data Security</h2>
        <p>
          We implement industry-standard encryption in transit (HTTPS/SSL) and secure serverless architecture to protect your personal data and learning history.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">5. Contact Us</h2>
        <p>
          For privacy inquiries or data deletion requests, reach out through your account support page.
        </p>
      </section>
    </main>
  );
}