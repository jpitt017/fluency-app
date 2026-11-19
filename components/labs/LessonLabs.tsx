'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';
import type { CurriculumLesson, CurriculumModule } from '@/lib/curriculum';

function contextPrompt(module: CurriculumModule, lesson: CurriculumLesson) {
  return [
    `Session ${lesson.session_number} (${lesson.title}): ${lesson.objectives}`,
    `Pronunciation Lab: ${lesson.pronunciation_focus}`,
    `Grammar & Lexis: ${lesson.grammar_lexis}`,
    `Speaking Task: ${lesson.speaking_pragmatics}`,
    module.cefr_objectives.find((objective) => lesson.objective_ids.includes(objective.id))?.can_do ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function LessonLabs({ module, lesson }: { module: CurriculumModule; lesson: CurriculumLesson }) {
  const router = useRouter();
  const isModuleCheckpoint = lesson.lesson_number === 4;
  const includeSpeaking = true;
  const includeWriting = lesson.lesson_number === 2 || lesson.lesson_number === 4;

  const mode: LessonLabContext['mode'] = isModuleCheckpoint ? 'checkpoint' : 'drill';
  const onComplete: NonNullable<LessonLabContext['onComplete']> = async (result) => {
    if (mode === 'checkpoint') return;
    await fetch('/api/curriculum/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moduleNumber: module.module_number,
        lessonNumber: lesson.lesson_number,
        completed: true,
        score: result.score,
      }),
    });
    router.refresh();
  };

  const shared: Omit<LessonLabContext, 'cefrSkill'> = {
    moduleId: module.module_number,
    lessonId: lesson.lesson_number,
    prompt: contextPrompt(module, lesson),
    targetGrammar: lesson.grammar,
    targetVocabulary: lesson.vocabulary,
    mode,
    durationSeconds: isModuleCheckpoint ? 120 : 60,
    minWords: isModuleCheckpoint ? 100 : undefined,
    maxWords: isModuleCheckpoint ? 180 : undefined,
    onComplete,
  };

  return (
    <section className="mx-auto max-w-4xl space-y-4 px-4 pb-10" aria-label="Session speaking and writing labs">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Session practice labs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Practise Session {lesson.session_number}’s connected speech, functional grammar, and cross-cultural speaking targets.
        </p>
      </div>
      {includeSpeaking && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">
            {isModuleCheckpoint
              ? `Module ${module.module_number} Speaking Checkpoint`
              : 'Prosody & Speaking Practice'}
          </h3>
          <SpeakingLab
            sessionTitle={`Module ${module.module_number} · Session ${lesson.session_number}: ${lesson.title}`}
            lessonContext={{
              ...shared,
              cefrSkill: isModuleCheckpoint ? 'Spoken Interaction' : 'Spoken Production',
            }}
          />
        </div>
      )}
      {includeWriting && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">
            {isModuleCheckpoint
              ? `Module ${module.module_number} Writing Checkpoint`
              : 'Targeted Grammar & Lexis Writing Practice'}
          </h3>
          <WritingLab lessonContext={{ ...shared, cefrSkill: 'Writing' }} />
        </div>
      )}
      <p className="text-xs text-slate-500">
        For free-form extra practice, visit{' '}
        <Link href="/labs" className="font-semibold text-indigo-700 hover:underline">
          Labs
        </Link>
        .
      </p>
    </section>
  );
}
