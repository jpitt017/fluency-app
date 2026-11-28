import DeleteDataButton from '@/components/b1b2/DeleteDataButton';
import { getViewer } from '@/lib/b1b2/data';

export default async function PrivacyPage() {
  const { user } = await getViewer();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-stone-800 sm:px-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <h1 className="text-3xl font-bold text-stone-900">Privacy Policy &amp; Data Controls</h1>
        <p className="mt-2 mb-8 text-xs text-stone-500">Last updated: November 19, 2026</p>

        <section className="space-y-6 text-sm leading-relaxed text-stone-700">
          <div>
            <h2 className="text-base font-semibold text-stone-900">1. Information We Collect</h2>
            <p className="mt-1.5">
              We collect information you provide directly when creating an account, such as your email address and authentication credentials via Supabase. When you use our speaking and writing studios, we process your voice audio and text submissions to store your progress and generate AI-driven feedback. Issue reports include your message and device details. You may choose to add a screenshot, recording or last saved answer.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">2. How We Use Your Information</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Provide and improve your lessons, reviews and assessments.</li>
              <li>Process transactions and manage subscription billing securely via Stripe.</li>
              <li>Check service speed, usage limits and costs.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">3. Sub-Processors &amp; Third-Party Services</h2>
            <p className="mt-1.5 text-xs text-stone-600">
              Learner text, speech audio, authentication, and billing metadata are processed solely to deliver the service by:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Supabase:</strong> Database hosting, private storage buckets, and user authentication.</li>
              <li><strong>Groq:</strong> Turns speech into text and provides feedback.</li>
              <li><strong>OpenAI:</strong> Pre-generated curriculum audio synthesis (TTS, no learner PII).</li>
              <li><strong>Stripe:</strong> Payment processing, customer records, and subscription billing.</li>
              <li><strong>Resend:</strong> Sends an alert when a user reports a broken feature.</li>
              <li><strong>Vercel:</strong> Hosts the app and runs scheduled data deletion.</li>
              <li><strong>AWS (S3 / CloudFront):</strong> Optional static course audio CDN delivery when configured.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-stone-900">4. Data storage and security</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong>Automated 12-month purge:</strong> Each day, we delete study recordings, AI request logs and usage events older than 12 months. Issue reports and their attachments stay until you delete your learning data.
              </li>
              <li>
                <strong>AI feedback cache:</strong> Cached feedback can reflect your submissions. It is deleted with your learning data and is scheduled for removal after 90 days without use.
              </li>
              <li>
                <strong>Security controls:</strong> All traffic uses HTTPS/TLS in transit, private storage buckets, and Postgres Row-Level Security (RLS) at rest.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-5">
            <h2 className="text-base font-semibold text-stone-900">5. Your EU / GDPR Rights &amp; Data Deletion</h2>
            <p className="mt-1.5 text-xs leading-5 text-stone-600">
              Confirming <strong>Delete my learning data &amp; recordings</strong> below starts erasing your lesson progress, vocabulary and mistake review cards, learner error logs, writing drafts, speaking transcripts, issue reports, their attachments, AI request logs, and voice recordings in Supabase Storage. If deletion is interrupted, some files may already be gone. Please retry on this device until you see the confirmation; saving new work is paused while deletion is pending. We retain a small deletion security marker with your login account to prevent late uploads from restoring deleted files; it is removed when the account closes. Your login email and any active Stripe subscription remain intact so paid access is not lost unexpectedly; to close your login account or cancel Stripe billing permanently, visit Billing or contact support.
            </p>
            <div className="mt-4">
              <DeleteDataButton userId={user?.id ?? null} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
