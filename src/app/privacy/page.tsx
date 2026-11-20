import DeleteDataButton from '@/components/b1b2/DeleteDataButton';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-stone-800 sm:px-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <h1 className="text-3xl font-bold text-stone-900">Privacy Policy &amp; Data Controls</h1>
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
              <li>Provide, maintain, and improve our B1 → B2 curriculum, FSRS review decks, and assessments.</li>
              <li>Process transactions and manage subscription billing securely via Stripe.</li>
              <li>Monitor AI endpoint latency, usage quotas, and cost reliability.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">3. Third-Party Service Providers</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li><strong>Supabase:</strong> Database hosting, private storage buckets, and user authentication.</li>
              <li><strong>Groq:</strong> Speech-to-text (Whisper) and language model feedback processing.</li>
              <li><strong>Stripe:</strong> Subscription payment processing.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">4. Retention &amp; Security</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Voice recordings and AI request telemetry logs are retained for up to 12 months while your account is active, unless deleted earlier by you.</li>
              <li>Anonymized evaluation cache entries expire automatically after 90 days.</li>
              <li>All user records are protected by HTTPS/TLS in transit and Postgres Row-Level Security (RLS) at rest.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-5">
            <h2 className="text-base font-semibold text-stone-900">5. Your EU / GDPR Rights &amp; Data Deletion</h2>
            <p className="mt-1.5 text-xs leading-5 text-stone-600">
              You may permanently erase all of your stored lessons, vocabulary/error FSRS cards, AI request logs, writing drafts, and voice recordings in Supabase Storage at any time below.
            </p>
            <div className="mt-4">
              <DeleteDataButton />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
