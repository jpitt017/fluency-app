'use client';

import { useState, useRef } from 'react';

interface SpeakingLabProps {
  sessionTitle?: string;
  pronunciationFocus?: string;
  speakingFocus?: string;
  keyLanguage?: string[];
}

interface SpeakingFeedback {
  transcript?: string;
  improvedResponse?: string;
  pronunciationFeedback?: string[];
  pragmaticsFeedback?: string[];
}

export default function SpeakingLab({
  sessionTitle,
  pronunciationFocus,
  speakingFocus,
  keyLanguage = [],
}: SpeakingLabProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Audio analysis refs for the visualizer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    setError(null);
    setFeedback(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext for visualization
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      startVisualizer();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopVisualizer();
        // Release hardware tracks
        stream.getTracks().forEach((track) => track.stop());
        if (audioCtx.state !== 'closed') {
          audioCtx.close();
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await submitAudioForEvaluation(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setError('Microphone access denied or unavailable. Please check browser permissions.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function startVisualizer() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = '#059669'; // Emerald-600
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  function stopVisualizer() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  async function submitAudioForEvaluation(audioBlob: Blob) {
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append(
        'context',
        JSON.stringify({
          sessionTitle,
          pronunciationFocus,
          speakingFocus,
          keyLanguage,
        })
      );

      const res = await fetch('/api/speaking/evaluate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to evaluate speech.');
      }

      setFeedback(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while analysing your speech.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Contextual Speaking & Phonology Focus Banner */}
      {(pronunciationFocus || speakingFocus || keyLanguage.length > 0) && (
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-3.5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            🎯 Session Speaking & Phonology Focus
          </p>

          {pronunciationFocus && (
            <p className="text-xs text-gray-800">
              <span className="font-semibold text-emerald-900">Phonology & Stress:</span>{' '}
              {pronunciationFocus}
            </p>
          )}

          {speakingFocus && (
            <p className="text-xs text-gray-800">
              <span className="font-semibold text-emerald-900">Pragmatics & Fluency:</span>{' '}
              {speakingFocus}
            </p>
          )}

          {keyLanguage.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {keyLanguage.map((item, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-white text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded-full"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recording Controls & Waveform Canvas */}
      <div className="flex flex-wrap items-center gap-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {isAnalyzing ? 'Transcribing & Analysing...' : '🎙️ Start Recording'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 animate-pulse"
          >
            ⏹️ Stop Recording
          </button>
        )}

        {/* Live Audio Visualizer Canvas */}
        <div className="flex items-center gap-3">
          <canvas
            ref={canvasRef}
            width={160}
            height={36}
            className={`bg-gray-900 rounded-md border border-gray-200 \${
              isRecording ? 'opacity-100' : 'opacity-40'
            }`}
          />
          {isRecording && (
            <span className="text-xs font-medium text-red-600 animate-pulse">
              Recording live...
            </span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </p>
      )}

      {/* AI Evaluation Output */}
      {feedback && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4 text-sm">
          {feedback.transcript && (
            <div>
              <span className="text-xs font-bold uppercase text-gray-500">What You Said:</span>
              <p className="text-gray-800 italic mt-1">"{feedback.transcript}"</p>
            </div>
          )}

          {feedback.improvedResponse && (
            <div>
              <span className="text-xs font-bold uppercase text-emerald-800">
                Natural B1 British Model (with Stress & Chunking Cues):
              </span>
              <p className="text-gray-900 font-medium mt-1">{feedback.improvedResponse}</p>
            </div>
          )}

          {feedback.pronunciationFeedback && feedback.pronunciationFeedback.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase text-gray-600">
                🗣️ Phonology & Thought-Group Notes:
              </span>
              <ul className="list-disc list-inside space-y-1 text-gray-700 mt-1">
                {feedback.pronunciationFeedback.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {feedback.pragmaticsFeedback && feedback.pragmaticsFeedback.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase text-gray-600">
                🤝 Pragmatics & Target Language Check:
              </span>
              <ul className="list-disc list-inside space-y-1 text-gray-700 mt-1">
                {feedback.pragmaticsFeedback.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}