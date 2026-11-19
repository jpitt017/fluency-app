import Link from 'next/link';
import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';

export default function LabsPage() {
  const freeContext: LessonLabContext = {
    prompt: 'Choose a global topic and practise B1 → B2 Global English fluency. Use clear thought-group pacing, collocations, and natural cross-cultural phrasing.',
    mode: 'free',
    targetGrammar: [],
    targetVocabulary: [],
  };
  return <main className="min-h-screen bg-gray-50 p-6 md:p-12"><div className="mx-auto max-w-4xl space-y-8">
    <header className="rounded-xl border border-gray-100 bg-white p-6"><h1 className="text-3xl font-bold tracking-tight text-gray-900">B1 → B2 Global English Writing & Speaking Lab</h1><p className="mt-2 text-gray-600">Free practice, connected-speech drills, and session-linked fluency tasks.</p><Link href="/curriculum" className="mt-4 inline-block text-sm font-semibold text-indigo-700 hover:underline">Browse 64-hour curriculum / continue a session →</Link></header>
    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h2 className="mb-4 text-xl font-semibold text-gray-800">✍️ Writing practice</h2><WritingLab lessonContext={freeContext}/></section>
    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h2 className="mb-4 text-xl font-semibold text-gray-800">🎙️ Speaking practice</h2><SpeakingLab lessonContext={freeContext}/></section>
  </div></main>;
}
