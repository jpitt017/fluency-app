import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Compass,
  Flag,
  GraduationCap,
  Headphones,
  Mic,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import CurriculumExplorer from '@/components/curriculum/CurriculumExplorer';
import {
  loadSyllabusContent,
  syllabus,
  type SyllabusCheckpoint,
  type SyllabusWeek,
} from '@/lib/curriculum/syllabus';

export const metadata = {
  title: 'Curriculum · B1 → B2 in 32 weeks | Fluency Studio',
  description:
    'The full two-stage Fluency Studio syllabus: 32 weeks, eight checkpoints, weekly speaking and writing, and a skill ladder from B1 to B2.',
};

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
        <Icon className="h-3.5 w-3.5 text-indigo-700" />
        {label}
      </div>
      <p className="mt-1.5 font-serif text-lg font-semibold leading-tight text-stone-900">{value}</p>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-stone-200 bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-stone-900 marker:hidden">
        {title}
        <span className="text-indigo-700 transition group-open:rotate-45">＋</span>
      </summary>
      <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-xs leading-6 text-stone-600">{children}</div>
    </details>
  );
}

function checkpointLabel(checkpoint: SyllabusCheckpoint, weeks: SyllabusWeek[]) {
  const week = weeks.find((item) => item.number === checkpoint.afterWeek);
  return week?.theme ?? `Week ${checkpoint.afterWeek}`;
}

export default async function CurriculumPage() {
  const { weeks, checkpoints, source } = await loadSyllabusContent();

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold text-stone-700 shadow-2xs">
            <BookOpen className="h-3.5 w-3.5 text-indigo-700" />
            Course syllabus · {syllabus.version}
          </div>
          <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-[2.6rem]">
            From secure B1 to B2, in two focused stages.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600 sm:text-[15px]">{syllabus.course.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href="#weeks"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:bg-indigo-800"
            >
              Explore the 32 weeks
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/onboarding/placement"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              <Compass className="h-4 w-4 text-indigo-700" />
              Placement check
            </Link>
          </div>
          <p className="mt-4 max-w-2xl text-xs leading-5 text-stone-500">
            <strong className="font-semibold text-stone-700">A note on the goal:</strong> {syllabus.course.disclaimer}
          </p>
        </div>

        <aside className="grid grid-cols-2 gap-2.5 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-4">
          <InfoCard icon={CalendarClock} label="Course length" value={`${syllabus.course.totalWeeks} weeks`} />
          <InfoCard icon={GraduationCap} label="Study time" value={`~${syllabus.course.totalHours} hours`} />
          <InfoCard icon={BookOpen} label="Structure" value="2 × 16-week stages" />
          <InfoCard icon={Flag} label="Checkpoints" value={`${syllabus.checkpoints.length} + 3 tests`} />
          <div className="col-span-2 rounded-xl bg-stone-50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Who it is for</p>
            <p className="mt-1 text-xs leading-5 text-stone-700">{syllabus.course.audience}</p>
            <p className="mt-2 text-xs leading-5 text-stone-600">{syllabus.course.start}</p>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-[11px] text-emerald-900">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Curriculum data {source === 'supabase' ? 'synced from Supabase' : 'bundled locally'}
            </span>
            <span className="font-mono">{weeks.length} weeks</span>
          </div>
        </aside>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">The two stages</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">One route, two destinations</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {syllabus.stages.map((stage) => (
            <div key={stage.number} className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Stage {stage.number}
                </span>
                <span className="font-mono text-[11px] text-stone-500">
                  Weeks {stage.weekRange} · {stage.hours}h
                </span>
              </div>
              <h3 className="mt-3 font-serif text-xl font-semibold text-stone-900">{stage.title.replace(/^Stage \d+: /, '')}</h3>
              <p className="mt-1 text-sm leading-6 text-stone-600">{stage.aim}</p>
              <dl className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-xs">
                {[
                  ['Starting level', stage.startingLevel],
                  ['Grammar', stage.grammar],
                  ['Vocabulary', stage.vocabulary],
                  ['Listening & reading', stage.listeningReading],
                  ['Speaking', stage.speaking],
                  ['Writing', stage.writing],
                  ['Extra input', stage.extraInput],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                    <dt className="font-semibold text-stone-500">{label}</dt>
                    <dd className="leading-5 text-stone-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 space-y-1.5 border-t border-stone-100 pt-4">
                {stage.phases.map((phase) => (
                  <div key={phase.weeks} className="flex gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-indigo-700">Wk {phase.weeks}</span>
                    <span className="text-stone-600">{phase.focus}</span>
                  </div>
                ))}
              </div>
              <Link
                href="#weeks"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
              >
                Stage {stage.number} begins at week {stage.weekStart}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-indigo-700" />
            <h2 className="font-serif text-lg font-semibold text-stone-900">Placement &amp; starting point</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">{syllabus.placement.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {syllabus.placement.components.map((item) => (
              <span key={item} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-600">
            Places you at <strong>{syllabus.placement.outcomes[0]}</strong> or{' '}
            <strong>{syllabus.placement.outcomes[1]}</strong>. {syllabus.placement.belowB1}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-900 p-5 text-stone-100">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-300" />
            <h2 className="font-serif text-lg font-semibold">A typical week</h2>
          </div>
          <p className="mt-2 text-xs leading-6 text-stone-300">{syllabus.course.pace}</p>
          <ul className="mt-3 space-y-1.5 text-[11px] text-stone-200">
            <li>15 min vocabulary · 15 min grammar</li>
            <li>15 min listening + 15 min reading</li>
            <li>15 min speaking · 15 min AI conversation</li>
            <li>30 min writing · 15 min review</li>
            <li className="pt-1 font-semibold text-amber-200">+ ~60 min extra input</li>
          </ul>
        </div>
      </section>

      <CurriculumExplorer weeks={weeks} stages={syllabus.stages} checkpoints={checkpoints} />

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">The weekly rhythm</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Same tasks, every week</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{syllabus.progression.details}</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Required?</th>
                <th className="px-4 py-3">Suggested order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {syllabus.weeklyTasks.map((task) => (
                <tr key={task.key} className="align-top hover:bg-stone-50/70">
                  <td className="px-4 py-3 font-medium text-stone-800">{task.title}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{task.time}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        task.requirementKind === 'required'
                          ? 'bg-indigo-100 text-indigo-800'
                          : task.requirementKind === 'recommended'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {task.requirement}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-stone-600">{task.order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Moving on
            </p>
            <p className="mt-1.5 text-xs leading-6 text-stone-700">{syllabus.progression.rule}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Sparkles className="h-3.5 w-3.5" />
              A good target
            </p>
            <p className="mt-1.5 text-xs leading-6 text-stone-700">{syllabus.progression.target}</p>
          </div>
        </div>
        <p className="text-xs leading-6 text-stone-600">{syllabus.progression.feedback}</p>
      </section>

      <section id="ladders" className="scroll-mt-28 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">How your skills grow</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">The skill ladders</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Each skill gets harder every few weeks, so you can see what changed between week 2 and week 28.
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Skill</th>
                {syllabus.skillLadders[0].levels.map((level) => (
                  <th key={level.weeks} className="px-4 py-3">Wk {level.weeks}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {syllabus.skillLadders.map((ladder) => (
                <tr key={ladder.key}>
                  <th className="px-4 py-3 text-left font-semibold text-stone-800">{ladder.label}</th>
                  {ladder.levels.map((level) => (
                    <td key={level.weeks} className="px-4 py-3 leading-5 text-stone-600">
                      {level.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">How progress is measured</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">Checkpoints &amp; tests</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
            A checkpoint every four weeks shows what you can do now; an independent test at the start and after each stage shows how far you have come.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {syllabus.externalAssessments.map((test) => (
            <div key={test.code} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-900">{test.title}</h3>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">{test.when}</span>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-stone-600">{test.description}</p>
            </div>
          ))}
        </div>
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {checkpoints.map((checkpoint) => (
            <div key={checkpoint.code} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${checkpoint.stage === 1 ? 'bg-indigo-50 text-indigo-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {checkpoint.number}
              </span>
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-stone-900">After week {checkpoint.afterWeek}</p>
                  <span className="text-[11px] text-stone-500">· {checkpointLabel(checkpoint, weeks)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-600">{checkpoint.assessed}</p>
              </div>
              <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                Stage {checkpoint.stage}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 text-xs leading-6 text-stone-600">
          <strong className="font-semibold text-stone-800">Marking.</strong> {syllabus.marking}{' '}
          <strong className="font-semibold text-stone-800">Certificate.</strong> {syllabus.certificate}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-indigo-700" />
          <h2 className="font-serif text-xl font-semibold text-stone-900">Learning that adapts to you</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(syllabus.adaptation).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold capitalize text-stone-900">{key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="mt-1.5 text-xs leading-6 text-stone-600">{value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Disclosure title="How the course works — seven principles">
            {syllabus.principles.map((principle) => (
              <p key={principle}>• {principle}</p>
            ))}
          </Disclosure>
          <Disclosure title="What happens next after each stage">
            {syllabus.nextSteps.map((step) => (
              <p key={`${step.after}-${step.condition}`}>
                <strong className="font-semibold text-stone-800">{step.after} · {step.condition} →</strong> {step.next}
              </p>
            ))}
          </Disclosure>
          <Disclosure title="AI, fairness and your data">
            {syllabus.aiAndData.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </Disclosure>
          <Disclosure title="For teachers and academies">
            {syllabus.teachers.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </Disclosure>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Mic, title: 'Speaking Lab', text: 'Record a weekly answer and compare with a model.', href: '/labs' },
          { icon: PenLine, title: 'Writing Lab', text: 'Submit the week’s 120–260 word task.', href: '/labs' },
          { icon: Headphones, title: 'Shadowing & input', text: 'Listen, shadow and check yourself.', href: '/labs' },
          { icon: ShieldCheck, title: 'Review queue', text: 'Repair mistakes and save your own words.', href: '/review' },
        ].map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="group rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"
          >
            <item.icon className="h-4 w-4 text-indigo-700" />
            <p className="mt-2 text-sm font-bold text-stone-900 group-hover:text-indigo-800">{item.title}</p>
            <p className="mt-1 text-[11px] leading-5 text-stone-600">{item.text}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Assessment specs</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-stone-900">Writing, placement and Checkpoint 1</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-stone-600">
              Weeks 1–4 come with full grammar, vocabulary and speaking authoring specs, plus the writing band descriptors, the 24-question placement blueprint and the 20-item Checkpoint 1 question bank.
            </p>
          </div>
          <Link
            href="/assessments"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
          >
            Open assessment specs
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/70 p-4 text-xs text-stone-600">
        <p className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-indigo-700" />
          Source: {syllabus.source}. The weekly plan is the same for everyone; the review queue is personal.
        </p>
        <Link href="/teacher" className="font-semibold text-indigo-700 hover:underline">
          Teacher console →
        </Link>
      </div>
    </main>
  );
}
