import { Headphones, MessageCircle, Mic, Sparkles } from 'lucide-react';
import type { DescriptorSet, SpeakingDetail } from '@/lib/curriculum/details';

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Mic; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h4 className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
        <Icon className="h-3.5 w-3.5 text-indigo-700" /> {title}
      </h4>
      <div className="mt-2 space-y-2 text-[11px] leading-5 text-stone-600">{children}</div>
    </div>
  );
}

export function SpeakingDescriptors({ descriptors }: { descriptors: DescriptorSet }) {
  return (
    <section className="space-y-4" aria-label="Speaking descriptors">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Speaking descriptors</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">The same four criteria for speech</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{descriptors.intro}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">Area &amp; learner question</th>
              <th className="px-4 py-3">Marked by</th>
              <th className="px-4 py-3">5 · Strong B1+</th>
              <th className="px-4 py-3">3 · Solid B1</th>
              <th className="px-4 py-3">1 · Below B1</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {descriptors.criteria.map((criterion) => (
              <tr key={criterion.key} className="align-top">
                <th className="px-4 py-3 text-left font-bold text-stone-900">
                  {criterion.label}
                  {criterion.question && (
                    <span className="mt-0.5 block font-normal text-stone-500">{criterion.question}</span>
                  )}
                </th>
                <td className="px-4 py-3 leading-5 text-stone-600">{criterion.markedBy ?? 'AI'}</td>
                <td className="px-4 py-3 leading-5 text-stone-800">{criterion.band5 ?? criterion.beyondTarget}</td>
                <td className="px-4 py-3 leading-5 text-stone-700">{criterion.band3 ?? criterion.onTarget}</td>
                <td className="px-4 py-3 leading-5 text-stone-600">{criterion.band1 ?? criterion.gettingThere}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="What the learner sees after each recording" icon={Mic}>
          {typeof descriptors.learnerFeedback === 'string' ? (
            <p>{descriptors.learnerFeedback}</p>
          ) : (
            descriptors.learnerFeedback?.map((item) => <p key={item}>{item}</p>)
          )}
          {descriptors.notes?.map((note) => <p key={note} className="border-t border-stone-100 pt-2">{note}</p>)}
        </Panel>
        <Panel title="Recordings for the build" icon={Headphones}>
          <p>{descriptors.recordings}</p>
        </Panel>
      </div>
    </section>
  );
}

export default function SpeakingSpec({ speaking }: { speaking: SpeakingDetail }) {
  return (
    <section className="space-y-4" aria-label="Full speaking spec">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Speaking · pilot draft</p>
          <h3 className="font-serif text-lg font-semibold text-stone-900">Four-part speaking: questions about you, long turn, discuss &amp; decide, follow-up</h3>
        </div>
        <span className="text-[10px] text-stone-500">Main: {speaking.main}</span>
      </div>

      {speaking.parts && (
        <div className="grid gap-3 md:grid-cols-3">
          <Panel title="Part 1 · Questions about you (~1 min, optional)" icon={Mic}>
            <ol className="list-decimal space-y-1 pl-4">
              {speaking.parts.questionsAboutYou.map((q) => <li key={q}>{q}</li>)}
            </ol>
          </Panel>
          <Panel title="Part 3 · Discuss and decide (~3 min, optional)" icon={MessageCircle}>
            <p className="font-semibold text-stone-800">{speaking.parts.discussAndDecide.topic}</p>
            <p>{speaking.parts.discussAndDecide.options.join(' · ')}</p>
            <p><strong className="font-semibold text-stone-800">Decision:</strong> {speaking.parts.discussAndDecide.decisionTask}</p>
          </Panel>
          <Panel title="Part 4 · Follow-up questions (~2 min, optional)" icon={Mic}>
            <ol className="list-decimal space-y-1 pl-4">
              {speaking.parts.followUpQuestions.map((q) => <li key={q}>{q}</li>)}
            </ol>
          </Panel>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Prompt and cue card" icon={Mic}>
          <p className="font-semibold text-stone-800">{speaking.prompt}</p>
          <p><strong className="font-semibold text-stone-800">Cue card:</strong> {speaking.cueCard}</p>
          <p><strong className="font-semibold text-stone-800">On target:</strong> {speaking.onTarget}</p>
          <p><strong className="font-semibold text-stone-800">Correction priority:</strong> {speaking.correctionPriority}</p>
        </Panel>
        <Panel title="Phrase bank · hidden on the first take" icon={Sparkles}>
          <ul className="space-y-1">
            {speaking.phraseBank.map((phrase) => <li key={phrase}>• {phrase}</li>)}
          </ul>
        </Panel>
      </div>

      <div className="rounded-xl border-l-4 border-indigo-300 bg-white p-4 font-serif text-sm italic leading-7 text-stone-800">
        <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.18em] not-italic text-stone-500">Model answer</p>
        “{speaking.model}”
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Shadowing chunks · 3 min warm-up" icon={Headphones}>
          {speaking.shadowingChunks.map((chunk) => (
            <p key={chunk.chunk}><strong className="font-semibold text-stone-800">{chunk.chunk}</strong> — {chunk.listenFor}</p>
          ))}
        </Panel>
        <Panel title={`Conversation: ${speaking.conversation.title}`} icon={MessageCircle}>
          <table className="w-full table-fixed text-left text-[10px] leading-4">
            <thead className="text-stone-500"><tr><th className="w-1/3">Partner</th><th className="w-1/3">Learner</th><th>Follow-up</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {speaking.conversation.turns.map((turn) => (
                <tr key={turn.partner} className="align-top">
                  <td className="py-1.5 pr-2">{turn.partner}</td>
                  <td className="py-1.5 pr-2 text-stone-800">{turn.learner}</td>
                  <td className="py-1.5">{turn.followUp}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><strong className="font-semibold text-stone-800">Closing:</strong> “{speaking.conversation.closingLine}”</p>
          <p><strong className="font-semibold text-stone-800">Natural recast:</strong> {speaking.conversation.naturalRecastExample}</p>
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Delayed recall · 3–5 days later" icon={Mic}>
          <p>“{speaking.delayedRecall}”</p>
          <p><strong className="font-semibold text-stone-800">B2 stretch:</strong> {speaking.b2Stretch}</p>
        </Panel>
        <details className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-[11px] leading-5">
          <summary className="cursor-pointer font-bold text-stone-900">Weekly speaking flow and unlocking</summary>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(speaking.flow).map(([key, value]) => (
              <div key={key}>
                <dt className="font-semibold capitalize text-stone-800">{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="text-stone-600">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
