import { BookOpen, Flag, MessageCircle, Mic, PenLine, Sparkles } from 'lucide-react';
import type { WeekDetail } from '@/lib/curriculum/details';

const USE_LABELS: Record<string, string> = {
  P: 'B1 productive',
  B: 'guided B2',
  O: 'recognition only',
};

function SectionHeading({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof BookOpen;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-stone-900">
        <Icon className="h-4 w-4 text-indigo-700" />
        {title}
      </h2>
      {note && <span className="text-[11px] text-stone-500">{note}</span>}
    </div>
  );
}

export default function WeekDetailPanel({
  detail,
  checkpointFocus,
}: {
  detail: WeekDetail;
  checkpointFocus?: string;
}) {
  const totalVocab = detail.vocabulary.core.length + detail.vocabulary.collocations.length;

  return (
    <div className="space-y-8 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5 sm:p-7">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Week {detail.number} authoring spec
          </span>
          <span className="text-[11px] text-stone-500">
            {totalVocab} target items · {detail.vocabulary.newCards} FSRS cards
          </span>
        </div>
        <h2 className="font-serif text-2xl font-semibold text-stone-900">{detail.title}</h2>
        <p className="text-sm leading-6 text-stone-700">{detail.canDo}</p>
        <div className="flex flex-wrap gap-1.5">
          {detail.featuredVocabulary.map((word) => (
            <span
              key={word}
              className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-800"
            >
              {word}
            </span>
          ))}
          {detail.stretchPhrases.map((word) => (
            <span
              key={word}
              className="rounded-full border border-dashed border-stone-300 bg-white px-2.5 py-1 text-[11px] text-stone-600"
            >
              stretch: {word}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={Sparkles} title="Grammar: main and light points" note="20-minute task · 25 auto-marked items" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Main point</p>
            <p className="mt-2 text-xs leading-6 text-stone-700">{detail.grammar.main}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Light point</p>
            <p className="mt-2 text-xs leading-6 text-stone-700">{detail.grammar.light}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {detail.grammar.sampleItems.map((item) => (
            <div key={item.prompt} className="rounded-xl border border-stone-200 bg-white p-3.5">
              <p className="text-xs font-semibold leading-5 text-stone-800">{item.prompt}</p>
              {item.options.length > 0 && (
                <p className="mt-1 font-mono text-[11px] text-stone-500">{item.options.join(' / ')}</p>
              )}
              <p className="mt-2 text-[11px] text-stone-700">
                <strong className="font-semibold text-emerald-800">Key:</strong> {item.key} — {item.reason}
              </p>
            </div>
          ))}
        </div>
        <details className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-stone-800">Authoring notes for teachers</summary>
          <p className="mt-2 leading-6 text-stone-600">{detail.grammar.authoringNote}</p>
        </details>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={Mic} title="Speaking model" note="record 60–90 seconds · model hidden on the first try" />
        <p className="text-xs leading-6 text-stone-700">{detail.speaking.prompt}</p>
        <blockquote className="rounded-xl border-l-4 border-indigo-300 bg-white p-4 font-serif text-sm italic leading-7 text-stone-800">
          “{detail.speaking.model}”
        </blockquote>
        <p className="text-[11px] leading-5 text-stone-600">
          <strong className="font-semibold text-stone-800">B2 stretch:</strong> {detail.speaking.b2Stretch}
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
          <SectionHeading icon={PenLine} title="Writing task" note={`${detail.writing.words[0]}–${detail.writing.words[1]} words · 30 min`} />
          <p className="text-xs leading-6 text-stone-700">{detail.writing.prompt}</p>
          <p className="border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">
            <strong className="font-semibold text-stone-800">Delayed recall:</strong> {detail.writing.delayedRecall}
          </p>
        </div>
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
          <SectionHeading icon={MessageCircle} title="AI conversation" note="15 min · recommended · 3–4 turns" />
          <p className="text-xs font-semibold text-stone-800">{detail.conversation.scenario}</p>
          <p className="text-xs italic leading-6 text-stone-600">“{detail.conversation.openingLine}”</p>
          <p className="text-[11px] leading-5 text-stone-700">{detail.conversation.learnerMoves}</p>
          <p className="border-t border-stone-100 pt-2 text-[11px] leading-5 text-stone-600">
            <strong className="font-semibold text-stone-800">Target language:</strong> {detail.conversation.targetLanguage}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={BookOpen} title="Vocabulary and collocations" note={`${detail.vocabulary.newCards} new cards this week`} />
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-3 py-2.5">Target</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">CEFR</th>
                <th className="px-3 py-2.5">Use</th>
                <th className="px-3 py-2.5">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...detail.vocabulary.core, ...detail.vocabulary.collocations].map((entry) => (
                <tr key={entry.target}>
                  <td className="px-3 py-2 font-semibold text-stone-900">{entry.target}</td>
                  <td className="px-3 py-2 text-stone-500">{entry.type ?? 'phrase'}</td>
                  <td className="px-3 py-2 font-mono text-stone-600">{entry.cefr ?? '—'}</td>
                  <td className="px-3 py-2 text-stone-600">{entry.use ? USE_LABELS[entry.use] ?? entry.use : 'phrase'}</td>
                  <td className="px-3 py-2 leading-5 text-stone-600">{entry.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-[11px] leading-5 text-stone-600">
            <strong className="font-semibold text-stone-800">Word families.</strong>{' '}
            {detail.vocabulary.families.map((family) => `${family.base}: ${family.forms.join(', ')} (${family.card})`).join(' · ')}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-[11px] leading-5 text-stone-600">
            <strong className="font-semibold text-stone-800">Linkers.</strong>{' '}
            {detail.linkers.map((linker) => `${linker.target} (${linker.function}, ${linker.taughtIn})`).join(' · ')}
            {detail.vocabulary.optional.length > 0 && (
              <> <strong className="font-semibold text-stone-800">Recognition only:</strong> {detail.vocabulary.optional.map((item) => item.target).join(', ')}.</>
            )}
          </div>
        </div>
        <p className="text-[11px] leading-5 text-stone-600">{detail.vocabulary.note}</p>
      </section>

      {checkpointFocus && (
        <section className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />
          <div>
            <p className="text-xs font-bold text-emerald-950">Checkpoint 1 draws on this week</p>
            <p className="mt-1 text-[11px] leading-5 text-emerald-900">{checkpointFocus}</p>
          </div>
        </section>
      )}
    </div>
  );
}
