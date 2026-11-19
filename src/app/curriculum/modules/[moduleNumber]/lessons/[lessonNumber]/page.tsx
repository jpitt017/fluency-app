import { notFound } from 'next/navigation';
import CurriculumLessonClient from './CurriculumLessonClient';
import LessonLabs from '@/components/labs/LessonLabs';
import { b1Curriculum } from '@/lib/curriculum';

export function generateStaticParams() {
  return b1Curriculum.modules.flatMap((module) => module.lessons.map((lesson) => ({
    moduleNumber: String(module.module_number),
    lessonNumber: String(lesson.lesson_number),
  })));
}

export default async function CurriculumLessonPage({ params }: { params: Promise<{ moduleNumber: string; lessonNumber: string }> }) {
  const { moduleNumber, lessonNumber } = await params;
  const module = b1Curriculum.modules.find((item) => item.module_number === Number(moduleNumber));
  const lesson = module?.lessons.find((item) => item.lesson_number === Number(lessonNumber));
  if (!module || !lesson) notFound();
  return <><CurriculumLessonClient module={module} lesson={lesson} /><LessonLabs module={module} lesson={lesson} /></>;
}
