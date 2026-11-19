'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';
import { moduleOneActivities } from '@/lib/module1-exercises';
import type { CurriculumLesson, CurriculumModule } from '@/lib/curriculum';

function contextPrompt(module: CurriculumModule, lesson: CurriculumLesson) {
  const task = module.module_number === 1 ? moduleOneActivities[lesson.lesson_number] : undefined;
  if (task?.type === 'reading_check') return task.passage;
  if (task?.type === 'listening') return task.script;
  if (task && 'prompt' in task) return task.prompt;
  if (task && 'opening' in task) return task.opening;
  if (task && 'advert' in task) return `${task.advert}\n\n${task.voicemail}`;
  return `${lesson.title}. ${lesson.stage}. ${module.cefr_objectives.find((objective) => lesson.objective_ids.includes(objective.id))?.can_do ?? ''}`;
}

export default function LessonLabs({ module, lesson }: { module: CurriculumModule; lesson: CurriculumLesson }) {
  const router = useRouter();
  const checkpointWriting = module.module_number === 1 && (lesson.lesson_number === 31 || lesson.lesson_number === 32);
  const checkpointSpeaking = module.module_number === 1 && lesson.lesson_number >= 27 && lesson.lesson_number <= 30;
  const includeSpeaking = lesson.lesson_number <= 8 || (lesson.lesson_number >= 17 && lesson.lesson_number <= 30);
  const includeWriting = (lesson.lesson_number >= 9 && lesson.lesson_number <= 24) || checkpointWriting;
  if (!includeSpeaking && !includeWriting) return null;

  const mode: LessonLabContext['mode'] = checkpointWriting || checkpointSpeaking ? 'checkpoint' : lesson.lesson_number >= 17 ? 'drill' : 'drill';
  const onComplete: NonNullable<LessonLabContext['onComplete']> = async (result) => {
    if (mode === 'checkpoint') return;
    await fetch('/api/curriculum/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moduleNumber: module.module_number, lessonNumber: lesson.lesson_number, completed: true, score: result.score }) });
    router.refresh();
  };

  const shared: Omit<LessonLabContext, 'cefrSkill'> = {
    moduleId: module.module_number,
    lessonId: lesson.lesson_number,
    prompt: contextPrompt(module, lesson),
    targetGrammar: lesson.grammar,
    targetVocabulary: lesson.vocabulary,
    mode,
    durationSeconds: checkpointSpeaking ? (lesson.lesson_number < 29 ? 120 : 90) : lesson.lesson_number >= 20 ? 45 : undefined,
    minWords: checkpointWriting ? 100 : undefined,
    maxWords: checkpointWriting ? 130 : undefined,
    onComplete,
  };

  return <section className="mx-auto max-w-3xl space-y-4 px-4 pb-8" aria-label="Lesson writing and speaking labs">
    <div><h2 className="text-xl font-bold text-slate-900">Lesson labs</h2><p className="mt-1 text-sm text-slate-600">Practise this lesson’s target language and get contextual feedback.</p></div>
    {includeSpeaking && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-semibold text-slate-900">{lesson.lesson_number <= 8 ? 'Shadowing & read-aloud' : checkpointSpeaking ? 'Can-Do speaking checkpoint' : 'Guided speaking practice'}</h3><SpeakingLab sessionTitle={`Module ${module.module_number} · Lesson ${lesson.lesson_number}`} lessonContext={{ ...shared, cefrSkill: lesson.lesson_number === 27 || lesson.lesson_number === 28 ? 'Spoken Interaction' : 'Spoken Production' }}/></div>}
    {includeWriting && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-semibold text-slate-900">{checkpointWriting ? 'Can-Do writing checkpoint' : 'Targeted writing practice'}</h3><WritingLab lessonContext={{ ...shared, cefrSkill: 'Writing' }}/></div>}
    <p className="text-xs text-slate-500">For free-form extra practice, visit <Link href="/labs" className="font-semibold text-indigo-700 hover:underline">Labs</Link>.</p>
  </section>;
}
