import PlacementQuizClient from '@/components/b1b2/PlacementQuizClient';
import { loadPlacementQuestions } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function PlacementQuizPage() {
  const questions = await loadPlacementQuestions();
  return <PlacementQuizClient questions={questions} />;
}
