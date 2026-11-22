import Link from 'next/link';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import ConversationalSpeakingLab from '@/components/labs/ConversationalSpeakingLab';
import ShadowingLab from '@/components/b1b2/ShadowingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';
import { getViewer } from '@/lib/b1b2/data';
import { loadUnlockedModels } from '@/lib/curriculum/week-models';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { learnerWeekFromParam, phaseForWeek } from '@/lib/curriculum/syllabus';

export const dynamic = 'force-dynamic';

type LabsProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function LabsPage({ searchParams }: LabsProps) {
  const viewer = await getViewer();
  const weekParam = (await searchParams).week;
  const weekNumber = learnerWeekFromParam(weekParam);
  const selectedWeek = weekParam ? await loadLearnerWeek(weekNumber) : null;
  const unlockedModels = selectedWeek ? await loadUnlockedModels(weekNumber) : null;
  const pronunciationFocus = phaseForWeek(weekNumber)?.pronunciationFocus;
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
              AI coaching for B1 → B2 English fluency: structured writing evaluation, speech transcription and content/grammar scoring, prosody shadowing, and interactive conversation practice.
            </p>
            {pronunciationFocus && (
              <p className="mt-2 text-xs font-semibold text-emerald-800">
                Pronunciation tip for weeks {phaseForWeek(weekNumber)?.weeks}: {pronunciationFocus}
              </p>
            )}
          </div>
          <Link
            href="/portfolio"
            className="shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          >
            View output portfolio →
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
        <section id="writing" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            <h2 className="text-lg font-bold text-stone-900">Writing Studio</h2>
            <p className="text-xs text-stone-500">
              Draft a paragraph, email, review, or essay and get targeted B2 corrections.
            </p>
          </div>
          <WritingLab unlockedModel={unlockedModels?.writing} lessonContext={selectedWeek ? { ...freeContext, prompt: selectedWeek.writingPrompt, weekNumber } : freeContext} />
        </section>

        <section id="speaking" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            <h2 className="text-lg font-bold text-stone-900">Speaking Evaluator</h2>
            <p className="text-xs text-stone-500">
              Record 60–180 seconds for Whisper transcription and B1 → B2 feedback.
            </p>
          </div>
          <SpeakingLab unlockedModel={unlockedModels?.speaking} lessonContext={selectedWeek ? { ...freeContext, prompt: selectedWeek.speakingPrompt, weekNumber } : freeContext} pronunciationFocus={pronunciationFocus} />
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <ShadowingLab
          title="Listen-and-Compare Shadowing Studio"
          pronunciationFocus={pronunciationFocus}
          targets={[
            {
              label: 'Narrative pacing · Turning point',
              text: 'I had been teaching for six years when I finally booked a one-way ticket.',
              note: 'Listen for the weak form in "for" and stress on "six years" and "one-way ticket".',
            },
            {
              label: 'Phrasal linking · Come round to',
              text: 'My parents came round to the idea after a few months.',
              note: 'Link "came round" smoothly and keep "to the" light.',
            },
            {
              label: 'Consonant clusters · Settle down',
              text: 'They settled down in Valencia after years of travelling.',
              note: 'Practise clear /d/ and /t/ endings without adding an extra vowel.',
            },
          ]}
        />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <ConversationalSpeakingLab
          sessionTitle="B1 → B2 Real-Time Role-Play"
          keyLanguage={['on balance', 'to be honest', 'nevertheless', 'turning point']}
        />
      </section>
    </main>
  );
}
