'use client';

import { useState } from 'react';
import SpeakingFeedbackDetails from '@/components/b1b2/SpeakingFeedbackDetails';
import type { DiscussAndDecidePart } from '@/lib/curriculum/details';
import type { ShortSpeakingFeedback } from '@/lib/b1b2/speaking-feedback.mjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationalSpeakingLabProps {
  sessionTitle?: string;
  keyLanguage?: string[];
  weekNumber?: number;
  discussAndDecide?: DiscussAndDecidePart | null;
}

interface DiscussEvalResponse extends ShortSpeakingFeedback {
  attemptId?: string | null;
  error?: string;
}

export default function ConversationalSpeakingLab({
  sessionTitle,
  keyLanguage = [],
  weekNumber,
  discussAndDecide = null,
}: ConversationalSpeakingLabProps) {
  const initialGreeting =
    discussAndDecide?.openingLine ||
    "Good to meet you! Let's talk through the options together and agree on the best choice. Which one would you start with?";

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: initialGreeting,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<DiscussEvalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userTurns = messages.filter((m) => m.role === 'user');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/speaking/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages,
          weekNumber,
          discussAndDecide: discussAndDecide
            ? {
                topic: discussAndDecide.topic,
                options: discussAndDecide.options,
                decisionTask: discussAndDecide.decisionTask,
              }
            : undefined,
          context: { sessionTitle, keyLanguage },
        }),
      });

      const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!res.ok || !data) {
        console.error('[role-play] chat request failed:', data?.error ?? res.status);
        setError(data?.error || 'Something went wrong. Please try again, or message your teacher.');
        return;
      }

      setMessages([...updatedMessages, { role: 'assistant', content: data.reply || '' }]);
    } catch (err: unknown) {
      console.error('[role-play] chat request failed:', err);
      setError('Something went wrong. Please try again, or message your teacher.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluateDiscussion() {
    if (userTurns.length === 0 || evaluating) return;
    setEvaluating(true);
    setError(null);
    try {
      const transcript = userTurns.map((m) => m.content).join(' ');
      const promptText = discussAndDecide
        ? `${discussAndDecide.topic} (${discussAndDecide.options.join(', ')}). ${discussAndDecide.decisionTask}`
        : sessionTitle || 'Discuss and decide with a speaking partner';
      const res = await fetch('/api/speaking/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          prompt: promptText,
          targetPhrase: keyLanguage.join(', '),
          weekNumber,
          partType: 'discuss_and_decide',
          optionsList: discussAndDecide?.options ?? [],
          decisionTask: discussAndDecide?.decisionTask ?? '',
        }),
      });
      const data = (await res.json().catch(() => null)) as DiscussEvalResponse | null;
      if (!res.ok || !data) {
        console.error('[role-play] evaluation failed:', data?.error ?? res.status);
        setError(data?.error || 'We could not check your work. Please try again.');
        return;
      }
      setEvalResult(data);
    } catch (err: unknown) {
      console.error('[role-play] evaluation failed:', err);
      setError('We could not check your work. Please try again.');
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-stone-900">
            {discussAndDecide ? 'Discuss and decide' : 'Role-play practice'}
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {discussAndDecide
              ? 'Talk about the five options with your AI partner, react to their ideas, and agree on a choice together (~3 minutes).'
              : 'Have a conversation with the AI coach. It asks you questions, and you answer.'}
          </p>
        </div>
        {keyLanguage.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keyLanguage.map((item) => (
              <span
                key={item}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-700"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {discussAndDecide && (
        <div className="space-y-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 text-sm">
          <p className="font-semibold text-stone-900">{discussAndDecide.topic}</p>
          <ul className="flex flex-wrap gap-2" aria-label="Five options to discuss">
            {discussAndDecide.options.map((opt, idx) => (
              <li
                key={opt}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-950"
              >
                {idx + 1}. {opt}
              </li>
            ))}
          </ul>
          <p className="text-xs font-semibold text-indigo-900">
            Decision goal: {discussAndDecide.decisionTask}
          </p>
        </div>
      )}

      <div className="h-72 space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-xl p-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-br-none bg-indigo-700 text-white'
                  : 'rounded-bl-none border border-stone-200 bg-white text-stone-800 shadow-2xs'
              }`}
            >
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-75">
                {msg.role === 'user' ? 'You' : 'Partner'}
              </p>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500">
              Partner is replying…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSend} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your response in English…"
          className="min-w-[200px] flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
        >
          Send
        </button>
        {userTurns.length > 0 && (
          <button
            type="button"
            disabled={evaluating || loading}
            onClick={() => void handleEvaluateDiscussion()}
            className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
          >
            {evaluating ? 'Checking…' : 'Finish and get feedback'}
          </button>
        )}
      </form>

      {evalResult && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <SpeakingFeedbackDetails
            feedback={evalResult}
            showImprovedInline
            ttsKind="attempt"
            ttsId={evalResult.attemptId ?? null}
          />
        </div>
      )}
    </div>
  );
}
