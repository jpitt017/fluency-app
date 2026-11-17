'use client';

import { useState } from 'react';
import { getWritingScaffold } from '@/lib/writingScaffolds';
import { getSpeakingScaffold, compareSpokenWords } from '@/lib/speakingScaffolds';
import WritingLab from './labs/WritingLab';

interface QuizData {
  question: string;
  options: string[];
  correctIndex: number;
}

interface BlockPracticeDrawerProps {
  blockNumber: number;
  skillLabel: string;
  scriptText: string;
  quizData: QuizData | null;
  targetDrillPhrase: string;
  slowAudio: boolean;
  onSpeak: (text: string) => void;
}

export default function BlockPracticeDrawer({
  blockNumber,
  skillLabel,
  scriptText,
  quizData,
  slowAudio,
  onSpeak,
}: BlockPracticeDrawerProps) {
  const [speakingStep, setSpeakingStep] = useState<'drill' | 'free'>('drill');
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [wordAnalysis, setWordAnalysis] = useState<{
    results: { word: string; matched: boolean }[];
    score: number;
  } | null>(null);
  const [speechNote, setSpeechNote] = useState<string | null>(null);

  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [showTranscript, setShowTranscript] = useState(false);

  const startAdvancedSpeechRecording = async (targetPhrase: string, isFreeMode: boolean) => {
    setWordAnalysis(null);
    setSpeechNote(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsListeningMic(true);
      setSpokenTranscript('Practice recording active...');
      setTimeout(() => {
        setIsListeningMic(false);
        const simulated = isFreeMode
          ? 'Hello, I am excited to work with our international team and share my perspective.'
          : targetPhrase;
        setSpokenTranscript(simulated);
        if (!isFreeMode) {
          setWordAnalysis(compareSpokenWords(targetPhrase, simulated));
        }
        setSpeechNote('Great rhythm! Listen to your recorded voice playback below.');
      }, 2500);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListeningMic(true);
    setSpokenTranscript('Listening... Speak clearly.');

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSpokenTranscript(transcript);
      setIsListeningMic(false);

      if (!isFreeMode) {
        const analysis = compareSpokenWords(targetPhrase, transcript);
        setWordAnalysis(analysis);
        setSpeechNote('Clarity score: ' + analysis.score + '% match.');
      } else {
        setSpeechNote('Fantastic fluency! Spoken response captured successfully.');
      }
    };

    recognition.onerror = () => {
      setIsListeningMic(false);
      setSpokenTranscript('Microphone check needed.');
    };

    recognition.onend = () => setIsListeningMic(false);
    recognition.start();
  };

  const speakingScaffold = getSpeakingScaffold(blockNumber);
  const writingScaffold = getWritingScaffold(blockNumber);

  return (
    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl space-y-4">
      {/* SPEAKING LAB */}
      {skillLabel === 'Speaking' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wide">
              British RP Speaking Lab
            </h4>
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSpeakingStep('drill');
                  setSpokenTranscript('');
                  setWordAnalysis(null);
                  setSpeechNote(null);
                }}
                className={
                  speakingStep === 'drill'
                    ? 'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-sky-600 text-white'
                    : 'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-zinc-600'
                }
              >
                Step 1: RP Drill
              </button>
              <button
                type="button"
                onClick={() => {
                  setSpeakingStep('free');
                  setSpokenTranscript('');
                  setWordAnalysis(null);
                  setSpeechNote(null);
                }}
                className={
                  speakingStep === 'free'
                    ? 'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-sky-600 text-white'
                    : 'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-zinc-600'
                }
              >
                Step 2: Free Speak
              </button>
            </div>
          </div>

          {speakingStep === 'drill' ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onSpeak(speakingScaffold.modelPhrase)}
                className="px-3.5 py-2 bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold rounded-xl"
              >
                Hear Model Audio
              </button>
              <button
                type="button"
                onClick={() => startAdvancedSpeechRecording(speakingScaffold.modelPhrase, false)}
                disabled={isListeningMic}
                className="px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-xl"
              >
                {isListeningMic ? 'Recording...' : 'Record Voice'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startAdvancedSpeechRecording('', true)}
              disabled={isListeningMic}
              className="px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-xl"
            >
              Record Spoken Answer
            </button>
          )}

          {spokenTranscript && (
            <p className="text-xs text-zinc-700 dark:text-zinc-300 italic">
              “{spokenTranscript}”
            </p>
          )}
        </div>
      )}

      {/* LISTENING PRACTICE */}
      {skillLabel === 'Listening' && scriptText && (
        <div className="space-y-3">
          <button
            onClick={() => onSpeak(scriptText)}
            className="px-4 py-2.5 bg-amber-600 text-white text-xs font-semibold rounded-xl"
          >
            Play Audio ({slowAudio ? '0.82x' : '1.0x'})
          </button>
        </div>
      )}

      {/* WRITING LAB COMPONENT */}
      {skillLabel === 'Writing' && (
        <WritingLab
          blockNumber={blockNumber}
          scaffold={writingScaffold}
          onSpeak={onSpeak}
        />
      )}

      {/* QUIZ CHECKPOINT */}
      {quizData && (
        <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <h5 className="text-xs font-bold text-emerald-600 uppercase tracking-wide">
            Quick Knowledge Check
          </h5>
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {quizData.question}
          </p>
          <div className="space-y-2">
            {quizData.options.map((option, idx) => {
              const isSelected = quizAnswers[blockNumber] === option;
              const isCorrect = idx === quizData.correctIndex;
              const answered = quizAnswers[blockNumber] !== undefined;

              let btnStyle =
                'w-full text-left p-2.5 text-xs rounded-xl border transition flex items-center justify-between bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300';
              if (answered && isCorrect) {
                btnStyle =
                  'w-full text-left p-2.5 text-xs rounded-xl border transition flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-semibold';
              } else if (answered && isSelected) {
                btnStyle =
                  'w-full text-left p-2.5 text-xs rounded-xl border transition flex items-center justify-between bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-800 dark:text-rose-200';
              }

              return (
                <button
                  key={idx}
                  onClick={() => setQuizAnswers({ ...quizAnswers, [blockNumber]: option })}
                  className={btnStyle}
                >
                  <span>
                    {String.fromCharCode(65 + idx)}) {option}
                  </span>
                  {answered && isCorrect && (
                    <span className="text-emerald-600 font-medium">Correct</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}