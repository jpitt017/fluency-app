import Link from 'next/link';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import ConversationalSpeakingLab from '@/components/labs/ConversationalSpeakingLab';
import ShadowingLab from '@/components/b1b2/ShadowingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';
import { getViewer } from '@/lib/b1b2/data';
import { loadUnlockedModels } from '@/lib/curriculum/week-models';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { learnerWeekFromParam, phaseForWeek } from '@/lib/curriculum/syllabus';

export const dynamic = 'force-dynamic';

type LabsProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function LabsPage({ searchParams }: LabsProps) {
  const viewer = await getViewer();
  const weekParam = (await searchParams).week;
  const weekNumber = weekParam ? learnerWeekFromParam(weekParam) : await currentLearnerWeek();
  // The current week's pronunciation clips also belong in free practice. Keep
  // writing/speaking free unless the learner opened a specific weekly task.
  const pronunciationWeek = await loadLearnerWeek(weekNumber);
  const selectedWeek = weekParam ? pronunciationWeek : null;
  const unlockedModels = selectedWeek ? await loadUnlockedModels(weekNumber) : null;
  const pronunciationFocus = phaseForWeek(weekNumber)?.pronunciationFocus;
  const freeContext: LessonLabContext = {
    prompt:
      'Practise speaking for 1–2 minutes. Use linking words like however and so to connect your ideas.',
    mode: 'free',
    targetGrammar: ['Present perfect vs. past simple', 'Conditionals', 'Hedging & concession'],
    targetVocabulary: ['turning point', 'compelling evidence', 'on balance', 'concede a point'],
  };
  // A task opened from /week/[n] keeps its week: the way back is on screen and
  // the evaluated submission counts for that week (weekNumber rides along in
  // the lesson context, and the marking routes record it).
  const backToWeek = weekParam ? (
    <Link
      href={`/week/${weekNumber}`}
      className="inline-block text-sm font-semibold text-indigo-700 underline"
    >
      ← Back to Week {weekNumber}
    </Link>
  ) : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              English practice · B1 → B2
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Speaking, writing and role-play practice
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-stone-600">
              Practise speaking and writing. Get feedback to help you improve.
            </p>
            {backToWeek && <p className="mt-2">{backToWeek}</p>}
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
            See my work →
          </Link>
        </div>
      </header>

      {!viewer.signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-5 py-4 text-sm text-indigo-950">
          <p>
            <strong>Sign in for feedback.</strong> You can write and record before signing in.
          </p>
          {/* Keep the selected week after sign-in; otherwise the checked task
              becomes free practice and cannot count for the week. */}
          <Link
            href={`/login?next=${encodeURIComponent(weekParam ? `/labs?week=${weekNumber}` : '/labs')}`}
            className="shrink-0 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            Sign in for AI feedback →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section id="writing" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            {backToWeek}
            <h2 className="text-lg font-bold text-stone-900">Writing practice</h2>
            <p className="text-xs text-stone-500">
              Write an email, a review or a short essay. Get corrections to help you improve.
            </p>
            {selectedWeek && (
              <p className="mt-1 text-xs font-semibold text-emerald-800">This task counts for Week {weekNumber}.</p>
            )}
          </div>
          <WritingLab unlockedModel={unlockedModels?.writing} lessonContext={selectedWeek ? { ...freeContext, prompt: selectedWeek.writingPrompt, weekNumber } : weekParam ? { ...freeContext, weekNumber } : freeContext} />
        </section>

        <section id="speaking" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-6">
          <div className="mb-4 border-b border-stone-100 pb-3">
            {backToWeek}
            <h2 className="text-lg font-bold text-stone-900">Speaking practice</h2>
            <p className="text-xs text-stone-500">
              {selectedWeek?.speakingLength ? `Speak for ${selectedWeek.speakingLength}. ` : 'Speak for about 1 minute. '}The app writes down what you said and gives you feedback.
            </p>
            {selectedWeek && (
              <p className="mt-1 text-xs font-semibold text-emerald-800">This task counts for Week {weekNumber}.</p>
            )}
          </div>
          <SpeakingLab unlockedModel={unlockedModels?.speaking} lessonContext={selectedWeek ? { ...freeContext, prompt: selectedWeek.speakingPrompt, weekNumber } : weekParam ? { ...freeContext, weekNumber } : freeContext} pronunciationFocus={pronunciationFocus} />
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <ShadowingLab
          title="Pronunciation practice"
          pronunciationFocus={pronunciationFocus}
          targets={pronunciationWeek?.shadowingChunks.length ? pronunciationWeek.shadowingChunks.map((chunk, index) => ({
            label: `Week ${weekNumber} · Sentence ${index + 1}`,
            text: chunk.text,
            // Keep the teacher's authored note intact, but use the short-sound
            // wording on learner pages as requested by the B1 review.
            note: chunk.note?.replace(/\bis weak\b/gi, 'has a short sound'),
            audioUrl: chunk.audioUrl,
          })) : [
            {
              label: 'Speed and pauses · Turning point',
              text: 'I had been teaching for six years when I finally booked a one-way ticket.',
              note: 'Listen for the short sound in "for" and stress on "six years" and "one-way ticket".',
            },
            {
              label: 'Joining words · Come round to',
              text: 'My parents came round to the idea after a few months.',
              note: 'Join "came round" smoothly and keep "to the" light.',
            },
            {
              label: 'Groups of consonants · Settle down',
              text: 'They settled down in Valencia after years of travelling.',
              note: 'Practise clear /d/ and /t/ endings without adding an extra vowel.',
            },
          ]}
        />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <ConversationalSpeakingLab
          sessionTitle="B1 → B2 role-play practice"
          keyLanguage={['on balance', 'to be honest', 'nevertheless', 'turning point']}
        />
      </section>
    </main>
  );
}
