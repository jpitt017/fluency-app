import PlacementQuizClient from '@/components/b1b2/PlacementQuizClient';
import { loadPlacementQuestions, loadPlacementTexts } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function PlacementQuizPage() {
  const [questions, texts] = await Promise.all([loadPlacementQuestions(), loadPlacementTexts()]);
  return <PlacementQuizClient questions={questions} texts={texts} />;
}
