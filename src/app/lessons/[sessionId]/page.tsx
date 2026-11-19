import { notFound, permanentRedirect } from 'next/navigation';
import { COURSE_SESSIONS } from '@/lib/course-architecture';

/**
 * Legacy `/lessons/<uuid>` deep links pointed at the 32 two-hour sessions.
 * Session `n` now maps to the first of its two 64-lesson counterparts.
 */
export const dynamic = 'force-dynamic';

export default async function LegacyLessonViewerRedirect({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = COURSE_SESSIONS.find((entry) => entry.id === sessionId);

  if (!session) notFound();

  permanentRedirect(`/curriculum/lessons/${session.session_number * 2 - 1}`);
}
