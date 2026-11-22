import Link from 'next/link';
import RememberWeek from '@/components/b1b2/RememberWeek';
import { notFound } from 'next/navigation';
import { loadLearnerWeek, type LearnerQuestion } from '@/lib/curriculum/learner-week';
import { loadSyllabusContent } from '@/lib/curriculum/syllabus';

export const dynamic = 'force-dynamic';

function Questions({ questions }: { questions: LearnerQuestion[] }) {
  return <ol className="space-y-4">{questions.map((q) => <li key={q.id} className="rounded-xl bg-stone-50 p-4">
    <p className="font-medium">{q.question}</p>
    {q.options.length > 0 ? <ul className="mt-2 list-inside list-disc text-sm text-stone-700">{q.options.map((option) => <li key={option}>{option}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">Think about your answer.</p>}
  </li>)}</ol>;
}

export default async function LearnerWeekPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(n)) notFound();
  const number = Number(n);
  const [details, syllabus] = await Promise.all([loadLearnerWeek(number), loadSyllabusContent()]);
  const week = syllabus.weeks.find((item) => item.number === number);
  if (!week) notFound();
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <RememberWeek week={number} />
    <header><p className="text-sm font-semibold text-indigo-700">Week {number}</p><h1 className="font-serif text-3xl font-semibold">{details?.title ?? week.theme}</h1>
      <p className="mt-4 rounded-xl bg-emerald-50 p-4"><strong>By the end of this week I can… </strong>{details?.canDo ?? week.cefr.canDo}</p></header>
    {!details ? <section className="rounded-xl border border-stone-200 p-5"><h2 className="font-semibold">Week {number} activities are coming soon</h2><p className="mt-2 text-sm">Detailed reading, listening, speaking and writing tasks have not been published for this week yet.</p><Link className="mt-3 inline-block text-indigo-700 underline" href="/labs">Open free practice in Labs</Link></section> : <>
      <section className="space-y-4 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Reading: {details.reading.title}</h2><p className="whitespace-pre-line leading-7">{details.reading.text}</p><Questions questions={details.reading.questions} /></section>
      <section className="space-y-4 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Listening: {details.listening.title}</h2>{details.listening.audioUrl ? <audio controls src={details.listening.audioUrl} /> : <p>Audio coming soon.</p>}<Questions questions={details.listening.questions} /></section>
      <section className="space-y-3 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Speaking</h2><p>{details.speakingPrompt}</p><p><strong>Cue card: </strong>{details.cueCard}</p><Link href={`/labs?week=${number}#speaking`} className="inline-block text-indigo-700 underline">Open speaking task in Labs</Link></section>
      <section className="space-y-3 rounded-xl border border-stone-200 p-5"><h2 className="text-xl font-semibold">Writing</h2><p>{details.writingPrompt}</p><Link href={`/labs?week=${number}#writing`} className="inline-block text-indigo-700 underline">Open writing task in Labs</Link></section>
    </>}</main>;
}
