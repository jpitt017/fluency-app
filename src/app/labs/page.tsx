import Link from 'next/link';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import ConversationalSpeakingLab from '@/components/labs/ConversationalSpeakingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';
import { getViewer } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function LabsPage() {
  const viewer = await getViewer();
  const freeContext: LessonLabContext = {
    prompt:
      'Practise B1 → B2 English fluency. Organise your ideas with clear linkers (whereas, consequently, nevertheless), precise collocations, and confident pacing.',
    mode: 'free',
    targetGrammar: ['Present perfect vs. past simple', 'Conditionals', 'Hedging & concession'],
    targetVocabulary: ['turning point', 'compelling evidence', 'on balance', 'concede a point'],
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              AI Output Studio · B1 → B2
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Speaking, Writing & Role-Play Labs
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-stone-600">
              Free-practice AI coaching alongside your 64-lesson curriculum: structured writing evaluation, speech transcription and rubric scoring, and interactive conversation practice.
            </p>
          </div>
          <Link
            href="/curriculum"
            className="shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          >
            Browse 64-lesson curriculum →
          </Link>
        </div>
      </header>

      {!viewer.signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-5 py-4 text-sm text-indigo-950">
          <p>
            <strong>Sign in required for AI feedback:</strong> You can draft and record below, then sign in to run Groq Whisper transcription and B1 → B2 rubric scoring.
          </p>
          <Link
            href="/login?next=/labs"
            className="shrink-0 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            Sign in to unlock AI Labs →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            <h2 className="text-lg font-bold text-stone-900">Writing Studio</h2>
            <p className="text-xs text-stone-500">
              Draft a paragraph, email, review, or essay and get targeted B2 corrections.
            </p>
          </div>
          <WritingLab lessonContext={freeContext} />
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            <h2 className="text-lg font-bold text-stone-900">Speaking Evaluator</h2>
            <p className="text-xs text-stone-500">
              Record 60–180 seconds for Whisper transcription and B1 → B2 feedback.
            </p>
          </div>
          <SpeakingLab lessonContext={freeContext} />
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <ConversationalSpeakingLab
          sessionTitle="B1 → B2 Real-Time Role-Play"
          keyLanguage={['on balance', 'to be honest', 'nevertheless', 'turning point']}
        />
      </section>
    </main>
  );
}
