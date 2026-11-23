import Link from 'next/link';
import GrammarPractice from '@/components/b1b2/GrammarPractice';
import ListeningTrialPlayer from '@/components/b1b2/ListeningTrialPlayer';
import RememberWeek from '@/components/b1b2/RememberWeek';
import VocabularyPractice from '@/components/b1b2/VocabularyPractice';
import WeekInputTask from '@/components/b1b2/WeekInputTask';
import { getViewer } from '@/lib/b1b2/data';
import { notFound } from 'next/navigation';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { loadPlayableTrialAudio } from '@/lib/curriculum/load-listening-audio';
import { learnerGrammar } from '@/lib/curriculum/learner-grammar';
import { learnerVocabulary } from '@/lib/curriculum/learner-vocabulary';
import { learnerVocabularyExercises } from '@/lib/curriculum/learner-vocabulary-exercises';
import { loadSyllabusContent } from '@/lib/curriculum/syllabus';

export const dynamic = 'force-dynamic';

export default async function LearnerWeekPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(n)) notFound();
  const number = Number(n);
  const [details, syllabus, viewer, trialAudio] = await Promise.all([
    loadLearnerWeek(number),
    loadSyllabusContent(),
    getViewer(),
    loadPlayableTrialAudio(number),
  ]);
  const week = syllabus.weeks.find((item) => item.number === number);
  if (!week) notFound();
  const grammar = learnerGrammar(number);
  const cards = learnerVocabulary(number);
  const vocabulary = learnerVocabularyExercises(number);
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    {!viewer.signedIn && <RememberWeek week={number} />}
    <header><p className="text-sm font-semibold text-indigo-700">Week {number}</p><h1 className="font-serif text-3xl font-semibold">{details?.title ?? week.theme}</h1>
      <p className="mt-4 rounded-xl bg-emerald-50 p-4"><strong>By the end of this week I can… </strong>{details?.canDo ?? week.cefr.canDo}</p></header>
    {!details ? <section className="rounded-xl border border-stone-200 p-5"><h2 className="font-semibold">Week {number} activities are coming soon</h2><p className="mt-2 text-sm">Detailed reading, listening, speaking and writing tasks have not been published for this week yet.</p><Link className="mt-3 inline-block text-indigo-700 underline" href="/labs">Open free practice in Labs</Link></section> : <>
      {grammar && <GrammarPractice grammar={grammar} week={number} signedIn={viewer.signedIn} />}
      {cards && vocabulary && <VocabularyPractice cards={cards} exercises={vocabulary} signedIn={viewer.signedIn} />}
      <section className="space-y-4 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Reading: {details.reading.title}</h2><p className="whitespace-pre-line leading-7">{details.reading.text}</p><WeekInputTask week={number} skill="reading" questions={details.reading.questions} available signedIn={viewer.signedIn} /></section>
      <section className="space-y-4 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Listening: {details.listening.title}</h2>{trialAudio ? <><p className="text-sm text-stone-600">Listen once for the main idea, then once more for the detail. The transcript stays hidden for now.</p><ListeningTrialPlayer trial={trialAudio} /></> : details.listening.audioUrl ? <audio controls src={details.listening.audioUrl} /> : <p>Audio coming soon.</p>}<WeekInputTask week={number} skill="listening" questions={details.listening.questions} available={Boolean(trialAudio || details.listening.audioUrl)} signedIn={viewer.signedIn} /></section>
      <section className="space-y-3 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Speaking</h2><p>{details.speakingPrompt}</p><p><strong>Cue card: </strong>{details.cueCard}</p><Link href={`/labs?week=${number}#speaking`} className="inline-block text-indigo-700 underline">Open speaking task in Labs</Link></section>
      <section className="space-y-3 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Writing</h2><p>{details.writingPrompt}</p><Link href={`/labs?week=${number}#writing`} className="inline-block text-indigo-700 underline">Open writing task in Labs</Link></section>
    </>}</main>;
}
