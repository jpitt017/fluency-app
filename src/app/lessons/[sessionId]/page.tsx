import { notFound, permanentRedirect } from 'next/navigation';

/**
 * Legacy `/lessons/<uuid>` deep links pointed at the 32 two-hour sessions.
 * Session ids are deterministic (`66666666-6666-4666-8666-<padded number>`),
 * so the number is read straight from the URL — no static course data needed.
 * Session `n` now maps to the first of its two 64-lesson counterparts.
 */
export const dynamic = 'force-dynamic';

const LEGACY_SESSION_ID = /^66666666-6666-4666-8666-(\d{12})$/i;

export default async function LegacyLessonViewerRedirect({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const match = LEGACY_SESSION_ID.exec(sessionId);
  if (!match) notFound();

  const sessionNumber = Number(match[1]);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 32) notFound();

  permanentRedirect(`/curriculum/lessons/${sessionNumber * 2 - 1}`);
}
