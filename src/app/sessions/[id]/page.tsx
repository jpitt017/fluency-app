import { notFound, permanentRedirect } from 'next/navigation';

/**
 * Legacy speaking-lab URLs (`/sessions/1` … `/sessions/32`) redirect to the
 * 64-lesson course; recording now lives in the lesson's output block.
 */
export const dynamic = 'force-dynamic';

export default async function LegacySessionRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionNumber = Number(id);

  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 32) notFound();

  permanentRedirect(`/curriculum/lessons/${sessionNumber * 2 - 1}`);
}
