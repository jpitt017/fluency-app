import { notFound, permanentRedirect } from 'next/navigation';

/**
 * Legacy 32-session URLs (module 1–8 × session 1–4) redirect to the 64-lesson
 * course. Session `l` covered new lessons `2l−1` and `2l`, so it maps to the
 * first of the pair and the learner continues from there.
 */
export const dynamic = 'force-dynamic';

export default async function LegacyLessonRedirect({
  params,
}: {
  params: Promise<{ moduleNumber: string; lessonNumber: string }>;
}) {
  const { moduleNumber, lessonNumber } = await params;
  const moduleValue = Number(moduleNumber);
  const lessonValue = Number(lessonNumber);

  if (!Number.isInteger(moduleValue) || !Number.isInteger(lessonValue)) notFound();
  if (moduleValue < 1 || moduleValue > 8 || lessonValue < 1 || lessonValue > 4) notFound();

  permanentRedirect(`/curriculum/lessons/${(moduleValue - 1) * 8 + (lessonValue - 1) * 2 + 1}`);
}
