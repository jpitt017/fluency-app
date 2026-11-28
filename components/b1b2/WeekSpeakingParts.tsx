'use client';

import SpeakingLab from '@/components/labs/SpeakingLab';
import ConversationalSpeakingLab from '@/components/labs/ConversationalSpeakingLab';
import type { SpeakingParts } from '@/lib/curriculum/details';

export function OptionalPart1Questions({
  week,
  questions,
}: {
  week: number;
  questions: string[];
}) {
  if (!questions.length) return null;
  const promptText = `Answer these two short questions about yourself (about 1 minute): 1) ${questions[0]} 2) ${questions[1] ?? ''}`.trim();

  return (
    <details className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-stone-900">
        Part 1 · Questions about you · about 1 minute (optional warm-up)
      </summary>
      <div className="mt-3 space-y-3 border-t border-stone-200/80 pt-3">
        <p className="text-xs text-stone-600">
          Optional warm-up before your long turn. Answer both short personal questions aloud.
        </p>
        <ol className="list-decimal space-y-1 rounded-lg bg-white p-3 pl-7 text-sm font-medium text-stone-800">
          {questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        <SpeakingLab
          lessonContext={{
            weekNumber: week,
            prompt: promptText,
            mode: 'free',
            durationSeconds: 60,
          }}
          grammarWeek={week}
          partType="questions_about_you"
          recordButtonLabel="Record Part 1 answer"
        />
      </div>
    </details>
  );
}

export function OptionalPart3And4({
  week,
  parts,
  usefulPhrases = [],
}: {
  week: number;
  parts: SpeakingParts;
  usefulPhrases?: string[];
}) {
  const followUpPrompt = `Answer these follow-up questions in a little more detail (about 2 minutes): 1) ${parts.followUpQuestions[0] ?? ''} 2) ${parts.followUpQuestions[1] ?? ''}`.trim();

  return (
    <div className="space-y-3">
      <details className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-900">
          Part 3 · Discuss and decide · about 3 minutes (optional)
        </summary>
        <div className="mt-3 border-t border-stone-200/80 pt-3">
          <ConversationalSpeakingLab
            weekNumber={week}
            discussAndDecide={parts.discussAndDecide}
            keyLanguage={usefulPhrases.slice(0, 4)}
          />
        </div>
      </details>

      {parts.followUpQuestions.length > 0 && (
        <details className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-stone-900">
            Part 4 · Follow-up questions · about 2 minutes (optional)
          </summary>
          <div className="mt-3 space-y-3 border-t border-stone-200/80 pt-3">
            <p className="text-xs text-stone-600">
              Optional follow-up after the conversation. Give reasons and examples for your views.
            </p>
            <ol className="list-decimal space-y-1 rounded-lg bg-white p-3 pl-7 text-sm font-medium text-stone-800">
              {parts.followUpQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <SpeakingLab
              lessonContext={{
                weekNumber: week,
                prompt: followUpPrompt,
                mode: 'free',
                durationSeconds: 120,
              }}
              grammarWeek={week}
              partType="follow_up"
              recordButtonLabel="Record Part 4 answer"
            />
          </div>
        </details>
      )}
    </div>
  );
}
