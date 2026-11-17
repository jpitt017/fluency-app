import WritingLab from '@/components/labs/WritingLab';
import SpeakingLab from '@/components/labs/SpeakingLab';

export default function LabsPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            🇬🇧 B1 British English Writing & Speaking Lab
          </h1>
          <p className="text-gray-600 mt-2">
            Real-time explicit grammatical correction and spoken fluency practice powered by AI.
          </p>
        </header>

        {/* Labs Container */}
        <div className="grid grid-cols-1 gap-8">
          {/* Writing Lab Component */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">✍️ Writing Correction Lab</h2>
            <WritingLab />
          </section>

          {/* Speaking Lab Component */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🎙️ Spoken English Lab</h2>
            <SpeakingLab />
          </section>
        </div>

      </div>
    </main>
  );
}