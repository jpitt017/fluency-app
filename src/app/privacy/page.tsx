export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-stone-800 sm:px-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <h1 className="text-3xl font-bold text-stone-900">Privacy Policy</h1>
        <p className="mt-2 mb-8 text-xs text-stone-500">Last updated: November 19, 2026</p>

        <section className="space-y-6 text-sm leading-relaxed text-stone-700">
          <div>
            <h2 className="text-base font-semibold text-stone-900">1. Information We Collect</h2>
            <p className="mt-1.5">
              We collect information you provide directly when creating an account, such as your email address and authentication credentials via Supabase. When you use our speaking and writing studios, we process your voice audio and text submissions to store your progress and generate AI-driven feedback.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">2. How We Use Your Information</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Provide, maintain, and improve our B1 → B2 curriculum, SRS decks, and assessments.</li>
              <li>Process transactions and manage subscription billing securely via Stripe.</li>
              <li>Send administrative notifications, password resets, and account updates.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">3. Third-Party Service Providers</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li><strong>Supabase:</strong> For secure database hosting, storage, and user authentication.</li>
              <li><strong>Groq:</strong> For processing speech-to-text (Whisper) and language model feedback.</li>
              <li><strong>Stripe:</strong> For secure payment processing and subscription management.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">4. Data Security</h2>
            <p className="mt-1.5">
              We implement encryption in transit (HTTPS/SSL), row-level security on learner records, and private storage buckets for voice recordings.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
