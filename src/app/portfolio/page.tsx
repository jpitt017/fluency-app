import Link from 'next/link';
import SpeakingRecording from '@/components/b1b2/SpeakingRecording';
import { createServerSupabase } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

interface SpeakingRow {
  id: string;
  transcript: string | null;
  overall: number | null;
  feedback: { summary?: string; improvedResponse?: string } | null;
  audio_path: string | null;
  created_at: string;
}

interface WritingRow {
  id: string;
  body: string;
  word_count: number | null;
  overall: number | null;
  feedback: { summary?: string; corrected?: string; upgrade?: string } | null;
  created_at: string;
}

export default async function PortfolioPage() {
  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!supabase || !user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Study Portfolio</span>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">Sign in to view your saved speaking &amp; writing work</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Replay your past audio recordings, inspect AI rubric scores, and revisit B2 model rewrites from your speaking and writing labs.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/portfolio"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Sign in →
            </Link>
            <Link
              href="/labs"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              Open AI Labs
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [speakingRes, writingRes] = await Promise.all([
    supabase
      .from('speaking_attempts')
      .select('id, transcript, overall, feedback, audio_path, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('writing_submissions')
      .select('id, body, word_count, overall, feedback, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  const speaking = (speakingRes.data as SpeakingRow[] | null) ?? [];
  const writing = (writingRes.data as WritingRow[] | null) ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Output Archive</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">Speaking &amp; Writing Portfolio</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            All evaluated speaking and writing submissions with audio playback and B2 model upgrades.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/labs"
            className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            Open AI Labs
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-stone-900">Speaking Attempts ({speaking.length})</h2>
          </div>

          {speaking.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              No evaluated speaking attempts yet. Record a speaking response in the AI Labs to save your first recording.
            </div>
          ) : (
            speaking.map((item) => (
              <article key={item.id} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-500">{new Date(item.created_at).toLocaleString()}</span>
                  {typeof item.overall === 'number' && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                      {item.overall} / 100
                    </span>
                  )}
                </div>

                <SpeakingRecording
                  recordingUrl={item.audio_path ? `/api/checkpoints/recording/${item.id}` : null}
                  transcript={item.transcript}
                />

                {item.transcript && (
                  <p className="rounded-xl bg-stone-50 p-3 text-sm italic text-stone-700">&ldquo;{item.transcript}&rdquo;</p>
                )}

                {item.feedback?.summary && <p className="text-xs leading-5 text-stone-600">{item.feedback.summary}</p>}

                {item.feedback?.improvedResponse && (
                  <div className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50/40 p-3 text-xs leading-5 text-stone-700">
                    <strong className="block text-indigo-900">B2 model upgrade</strong>
                    {item.feedback.improvedResponse}
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-stone-900">Writing Submissions ({writing.length})</h2>
          </div>

          {writing.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              No evaluated writing submissions yet. Draft a paragraph in the Writing Studio to save your first submission.
            </div>
          ) : (
            writing.map((item) => (
              <article key={item.id} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-500">
                    {new Date(item.created_at).toLocaleString()}
                    {item.word_count ? ` · ${item.word_count} words` : ''}
                  </span>
                  {typeof item.overall === 'number' && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      {item.overall} / 100
                    </span>
                  )}
                </div>

                <p className="whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm leading-6 text-stone-800">{item.body}</p>

                {item.feedback?.summary && <p className="text-xs leading-5 text-stone-600">{item.feedback.summary}</p>}

                {(item.feedback?.corrected || item.feedback?.upgrade) && (
                  <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/40 p-3 text-xs leading-5 text-stone-700">
                    <strong className="block text-emerald-900">B2 model rewrite</strong>
                    {item.feedback.corrected || item.feedback.upgrade}
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
