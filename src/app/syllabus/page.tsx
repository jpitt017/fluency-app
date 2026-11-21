import { redirect } from 'next/navigation';

/** The published syllabus lives at /curriculum; keep /syllabus as a friendly alias. */
export default function SyllabusAlias() {
  redirect('/curriculum');
}
