import LessonViewerClient from './LessonViewerClient';
import { COURSE_SESSIONS } from '@/lib/course-architecture';

export function generateStaticParams() {
  return [
    { sessionId: 'placeholder-session' },
    ...COURSE_SESSIONS.map((session) => ({ sessionId: session.id })),
  ];
}

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { sessionId } = await params;
  return <LessonViewerClient sessionId={sessionId} />;
}
