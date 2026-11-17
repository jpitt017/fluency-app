'use client';

import { useState } from 'react';
import { logStudentProgress } from '@/utils/progress';

export default function SpeakingLabPage({ params }: { params: { id: string } }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simulated recording trigger or MediaRecorder handler
  async function handleAudioSubmit(audioBlob: Blob) {
    setIsSubmitting(true);
    setError(null);
    setTranscript(null);
    setEvaluation(null);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('sessionTitle', `Session ${params.id}`);

    try {
      const res = await fetch('/api/speaking/evaluate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('You are sending requests too quickly. Please wait a moment before trying again.');
        }
        throw new Error(data.error || 'Failed to evaluate audio recording.');
      }

      setTranscript(data.transcript);
      setEvaluation(data.evaluation);

      // Automatically log student progress in Supabase
      const calculatedScore = 85; // Or derive score dynamically based on AI evaluation
      const progressResult = await logStudentProgress(params.id, calculatedScore);

      if (!progressResult.success) {
        console.warn('Warning: Failed to persist progress log to database.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred while communicating with the AI coach.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            🇬🇧 B1 British English Speaking Lab
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Interactive Audio Session</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record your response below. Groq Whisper will transcribe your voice and provide instant British coaching feedback.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100">
            ⚠️ {error}
          </div>
        )}

        <div className="p-6 bg-gray-50 rounded-xl border border-gray-100 text-center space-y-4">
          <button
            onClick={() => {
              // Mocking a recorded audio blob for testing integration
              const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
              handleAudioSubmit(mockBlob);
            }}
            disabled={isSubmitting}
            className="px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm inline-flex items-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Evaluating Recording...</span>
              </>
            ) : (
              <span>🎤 Submit Test Recording</span>
            )}
          </button>
        </div>

        {transcript && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Your Transcript:</h3>
              <p className="text-sm text-gray-800 italic">"{transcript}"</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700">🇬🇧 British Coach Evaluation:</h3>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{evaluation}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}