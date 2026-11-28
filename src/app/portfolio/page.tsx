import Link from 'next/link';
import SpeakingRecording from '@/components/b1b2/SpeakingRecording';
import { createServerSupabase } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

interface AreaMark {
  score: number;
  strength?: string;
  improvement?: string;
}

interface SpeakingRow {
  id: string;
  transcript: string | null;
  overall: number | null;
  feedback: {
    summary?: string;
    improvedResponse?: string;
    areas?: {
      grammar_and_vocabulary?: AreaMark;
      discourse_management?: AreaMark;
      pronunciation?: AreaMark | null;
      interactive_communication?: AreaMark | null;
    } | null;
    teacherAreaMarks?: Record<string, number> | null;
  } | null;
  audio_path: string | null;
  created_at: string;
}

interface WritingRow {
  id: string;
  body: string;
  word_count: number | null;
  overall: number | null;
  feedback: {
    summary?: string;
    corrected?: string;
    upgrade?: string;
    areas?: {
      content?: AreaMark;
      communicative_achievement?: AreaMark;
      organisation?: AreaMark;
      language?: AreaMark;
    } | null;
    teacherAreaMarks?: Record<string, number> | null;
  } | null;
  created_at: string;
}

function areaBadgeList(
  entries: Array<{ key: string; label: string; ai?: AreaMark | null }>,
  teacherMarks?: Record<string, number> | null,
) {
  return entries
    .map((entry) => {
      const t = teacherMarks?.[entry.key];
      const val = typeof t === 'number' ? t : entry.ai?.score;
      if (typeof val !== 'number') return null;
      return { label: entry.label, val };
    })
    .filter((item): item is { label: string; val: number } => Boolean(item));
}

export default async function PortfolioPage() {
  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!supabase || !user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            My work
          </span>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">
            Sign in to view your saved speaking &amp; writing work
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Listen to recordings and read feedback on your work.
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
              Open Practice
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
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Your work</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">
            My work
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Your speaking and writing, with your recordings and feedback.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/labs"
            className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            Open Practice
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
            <h2 className="font-serif text-xl font-bold text-stone-900">
              Speaking ({speaking.length})
            </h2>
          </div>

          {speaking.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              No speaking yet. Try a speaking task in Practice.
            </div>
          ) : (
            speaking.map((item) => {
              const badges = areaBadgeList(
                [
                  {
                    key: 'grammar_and_vocabulary',
                    label: 'Grammar & vocab',
                    ai: item.feedback?.areas?.grammar_and_vocabulary,
                  },
                  {
                    key: 'discourse_management',
                    label: 'Discourse',
                    ai: item.feedback?.areas?.discourse_management,
                  },
                  {
                    key: 'pronunciation',
                    label: 'Pronunciation',
                    ai: item.feedback?.areas?.pronunciation,
                  },
                  {
                    key: 'interactive_communication',
                    label: 'Interaction',
                    ai: item.feedback?.areas?.interactive_communication,
                  },
                ],
                item.feedback?.teacherAreaMarks,
              );
              return (
                <article
                  key={item.id}
                  className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-stone-500">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {badges.map((b) => (
                          <span
                            key={b.label}
                            className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800"
                          >
                            {b.label}: {b.val}/5
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <SpeakingRecording
                    recordingUrl={item.audio_path ? `/api/checkpoints/recording/${item.id}` : null}
                  />

                  {item.transcript && (
                    <p className="rounded-xl bg-stone-50 p-3 text-sm italic text-stone-700">
                      &ldquo;{item.transcript}&rdquo;
                    </p>
                  )}

                  {item.feedback?.summary && (
                    <p className="text-xs leading-5 text-stone-600">{item.feedback.summary}</p>
                  )}

                  {item.feedback?.improvedResponse && (
                    <div className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50/40 p-3 text-xs leading-5 text-stone-700">
                      <strong className="block text-indigo-900">Your answer, improved</strong>
                      {item.feedback.improvedResponse}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-stone-900">
              Writing ({writing.length})
            </h2>
          </div>

          {writing.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              No writing yet. Try a writing task in Practice.
            </div>
          ) : (
            writing.map((item) => {
              const badges = areaBadgeList(
                [
                  { key: 'content', label: 'Content', ai: item.feedback?.areas?.content },
                  {
                    key: 'communicative_achievement',
                    label: 'Communicative',
                    ai: item.feedback?.areas?.communicative_achievement,
                  },
                  {
                    key: 'organisation',
                    label: 'Organisation',
                    ai: item.feedback?.areas?.organisation,
                  },
                  { key: 'language', label: 'Language', ai: item.feedback?.areas?.language },
                ],
                item.feedback?.teacherAreaMarks,
              );
              return (
                <article
                  key={item.id}
                  className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-stone-500">
                      {new Date(item.created_at).toLocaleString()}
                      {item.word_count ? ` · ${item.word_count} words` : ''}
                    </span>
                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {badges.map((b) => (
                          <span
                            key={b.label}
                            className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800"
                          >
                            {b.label}: {b.val}/5
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm leading-6 text-stone-800">
                    {item.body}
                  </p>

                  {item.feedback?.summary && (
                    <p className="text-xs leading-5 text-stone-600">{item.feedback.summary}</p>
                  )}

                  {(item.feedback?.corrected || item.feedback?.upgrade) && (
                    <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/40 p-3 text-xs leading-5 text-stone-700">
                      <strong className="block text-emerald-900">A better way to say it</strong>
                      {item.feedback.corrected || item.feedback.upgrade}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
