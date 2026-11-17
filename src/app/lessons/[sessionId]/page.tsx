import LessonViewerClient from './LessonViewerClient';

export function generateStaticParams() {
  return [{ sessionId: 'placeholder-session' }];
}

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { sessionId } = await params;
  return <LessonViewerClient sessionId={sessionId} />;
}