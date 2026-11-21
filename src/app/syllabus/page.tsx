import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTeacherViewer } from '@/lib/auth/require-teacher';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** The published syllabus lives at /curriculum; keep /syllabus as a friendly alias. */
export default async function SyllabusAlias() {
  await requireTeacherViewer();
  redirect('/curriculum');
}
