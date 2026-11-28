import Link from 'next/link';
import { ArrowRight, BookOpenCheck, ClipboardCheck, Compass, FileText, Flag, Info, PenLine } from 'lucide-react';
import CheckpointBank from '@/components/curriculum/CheckpointBank';
import { requireTeacherViewer } from '@/lib/auth/require-teacher';
import { SpeakingDescriptors } from '@/components/curriculum/SpeakingSpec';
import { allCheckpointItems, loadDetailedContent } from '@/lib/curriculum/details';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Assessment specs · Writing, speaking, placement & Checkpoint 1 | Fluency Studio',
  robots: { index: false, follow: false },
  description:
    'Writing and speaking bands, the 24-question placement blueprint and the full Checkpoint 1 question bank for the B1 → B2 course.',
};

function Card({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-stone-900">
        <Icon className="h-4 w-4 text-indigo-700" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AssessmentsPage() {
  await requireTeacherViewer();
  const { assessments: doc, source } = await loadDetailedContent({ includeAnswers: true });
  const items = [...doc.checkpoint1.items, ...doc.checkpoint1.reserves];
  const descriptor = doc.writingDescriptors;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold text-stone-700">
            <ClipboardCheck className="h-3.5 w-3.5 text-indigo-700" />
            Assessment specifications · {doc.version}
          </div>
          <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-4xl">
            How writing is marked, where learners start, and what Checkpoint 1 tests.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            Four specifications for the B1 → B2 build: writing descriptors, the matching speaking descriptors, a 35-minute placement flow that decides between the foundation course, Stage 1 and Stage 2, and the 20-item Checkpoint 1 question bank plus four reserves. All content is pilot draft pending second-teacher review.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="#writing"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
            >
              Writing bands <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#speaking-descriptors"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              Speaking bands
            </Link>
            <Link
              href="#placement"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              Placement rules
            </Link>
            <Link
              href="#checkpoint-1"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              Question bank
            </Link>
          </div>
        </div>
        <aside className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-xs leading-6 text-amber-950 lg:col-span-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Info className="h-4 w-4" />
            Provisional until pilot calibration
          </p>
          <p>{doc.note}</p>
          <p className="border-t border-amber-200/80 pt-2">
            Specs {source === 'supabase' ? 'synced from Supabase' : 'bundled locally'} ·{' '}
            <Link href="/curriculum" className="font-semibold underline">
              Back to the 32-week syllabus
            </Link>
          </p>
        </aside>
      </section>

      <section id="writing" className="scroll-mt-28 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Writing descriptors</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Three bands, four criteria</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{descriptor.intro}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Area &amp; learner question</th>
                <th className="px-4 py-3">5 · Strong B1+</th>
                <th className="px-4 py-3">3 · Solid B1</th>
                <th className="px-4 py-3">1 · Below B1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {descriptor.criteria.map((criterion) => (
                <tr key={criterion.key} className="align-top">
                  <th className="px-4 py-3 text-left font-bold text-stone-900">
                    {criterion.label}
                    {criterion.question && (
                      <span className="mt-0.5 block font-normal text-stone-500">{criterion.question}</span>
                    )}
                  </th>
                  <td className="px-4 py-3 leading-5 text-stone-800">{criterion.band5 ?? criterion.beyondTarget}</td>
                  <td className="px-4 py-3 leading-5 text-stone-700">{criterion.band3 ?? criterion.onTarget}</td>
                  <td className="px-4 py-3 leading-5 text-stone-600">{criterion.band1 ?? criterion.gettingThere}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <BookOpenCheck className="h-3.5 w-3.5 text-indigo-700" /> Rules the AI applies
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-stone-600">
              {descriptor.rules.map((rule) => (
                <li key={rule}>• {rule}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <PenLine className="h-3.5 w-3.5 text-indigo-700" /> What the learner sees
            </p>
            <p className="mt-2 text-[11px] leading-5 text-stone-600">{descriptor.learnerFeedback}</p>
            <div className="mt-3 border-t border-stone-100 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Later word ranges</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {descriptor.wordRanges.map((range) => (
                  <span key={range.weeks} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700">
                    Wk {range.weeks}: {range.range} · {range.targetBand}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="speaking-descriptors" className="scroll-mt-28 space-y-4">
        <SpeakingDescriptors descriptors={doc.speakingDescriptors} />
      </section>

      <section id="placement" className="scroll-mt-28 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Placement</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">A 35-minute starting point</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{doc.placement.intro}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {doc.placement.parts.map((part) => (
            <div key={part.part} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-stone-900">{part.part}</p>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">{part.time}</span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-stone-600">{part.what}</p>
              <p className="mt-2 border-t border-stone-100 pt-2 text-[10px] font-semibold text-stone-500">Marked by: {part.markedBy}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="24-question blueprint" icon={Compass}>
            <div className="space-y-2">
              {doc.placement.questionBlueprint.map((row) => (
                <div key={row.level} className="flex gap-3 rounded-lg border border-stone-100 bg-stone-50/70 p-3 text-xs">
                  <span className="font-mono font-bold text-indigo-700">{row.level}</span>
                  <span className="font-semibold text-stone-800">{row.questions} questions</span>
                  <span className="text-stone-600">{row.focus}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-stone-100 pt-3">
              {doc.placement.bands.map((band) => (
                <p key={band.band} className="text-[11px] leading-5 text-stone-600">
                  <strong className="font-semibold text-stone-900">{band.band}:</strong> {band.description}
                </p>
              ))}
            </div>
          </Card>
          <Card title="Decision rules" icon={Flag}>
            <div className="space-y-2">
              {doc.placement.decisionRules.map((rule) => (
                <div key={rule.outcome} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-stone-900">{rule.outcome}</p>
                    <span className="font-mono text-[11px] text-indigo-700">{rule.testScore}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-stone-600">{rule.samples}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-stone-100 pt-3 text-[11px] leading-5 text-stone-600">
              <p><strong className="font-semibold text-stone-900">Borderline:</strong> {doc.placement.borderline}</p>
              <p><strong className="font-semibold text-stone-900">Learner choice:</strong> {doc.placement.learnerChoice}</p>
              <p><strong className="font-semibold text-stone-900">EF SET:</strong> {doc.placement.efSetCrossCheck}</p>
            </div>
          </Card>
        </div>
      </section>

      <section id="checkpoint-1" className="scroll-mt-28 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Checkpoint 1</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">After week 4</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{doc.checkpoint1.intro}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-bold text-stone-900">Quiz blueprint</p>
            <p className="mt-1.5 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.quiz.blueprint}</p>
            <p className="mt-2 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.quiz.delivery}</p>
            <p className="mt-2 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.quiz.reporting}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-bold text-stone-900">Checkpoint 1 speaking</p>
            <p className="mt-1.5 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.speaking.intro}</p>
            <p className="mt-2 rounded-lg bg-stone-50 p-2.5 font-serif text-[11px] italic leading-5 text-stone-800">
              “{doc.checkpoint1.speaking.prompt}”
            </p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-stone-600">
              {doc.checkpoint1.speaking.conditions.map((condition) => (
                <li key={condition.setting}><strong className="font-semibold text-stone-800">{condition.setting}:</strong> {condition.value}</li>
              ))}
            </ul>
            <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.speaking.transferNote}</p>
            <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">
              <strong className="font-semibold text-stone-900">Writing:</strong>{' '}
              {doc.checkpoint1.writing.prompts.map((prompt) => prompt.label).join(' / ')}
            </p>
            <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">
              <strong className="font-semibold text-stone-900">On target:</strong> {doc.checkpoint1.writing.onTarget}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {doc.checkpoint1.writing.conditions.map((condition) => (
                <span key={condition.id} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700">
                  {condition.setting}: {condition.value}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-bold text-stone-900">Overall result</p>
            <p className="mt-1.5 text-[11px] leading-5 text-stone-600">{doc.checkpoint1.result.intro}</p>
            <div className="mt-2 space-y-1">
              {doc.checkpoint1.result.thresholds.map((threshold) => (
                <p key={threshold.part} className="text-[11px] leading-5 text-stone-700">
                  <strong className="font-semibold text-stone-900">{threshold.part}:</strong> {threshold.onTarget}
                </p>
              ))}
            </div>
            <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">
              {doc.checkpoint1.result.practiceLinks}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-serif text-xl font-semibold text-stone-900">Question bank</h3>
          <CheckpointBank items={items} />
          <p className="text-[11px] leading-5 text-stone-500">{doc.checkpoint1.reserveUse}</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
          <p className="text-xs font-bold text-stone-900">Calibration before launch</p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-stone-600">
            {doc.checkpoint1.calibration.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/curriculum" className="rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-indigo-300">
          <p className="font-serif text-lg font-semibold text-stone-900">See the 32-week syllabus →</p>
          <p className="mt-1 text-xs text-stone-600">Themes, grammar and skill ladders for every week.</p>
        </Link>
        <Link href="/curriculum/weeks/1" className="rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-indigo-300">
          <p className="font-serif text-lg font-semibold text-stone-900">Open Week 1 in detail →</p>
          <p className="mt-1 text-xs text-stone-600">Grammar, model answer, vocabulary and conversation scenario.</p>
        </Link>
      </div>

      <p className="text-[11px] text-stone-500">
        {items.length} checkpoint items shown from {allCheckpointItems().length} total · specs {doc.version}
      </p>
    </main>
  );
}
