'use client';

import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationalSpeakingLabProps {
  sessionTitle?: string;
  keyLanguage?: string[];
}

export default function ConversationalSpeakingLab({
  sessionTitle,
  keyLanguage = [],
}: ConversationalSpeakingLabProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Good to meet you! Let's practise speaking. Tell me about a change in your work or daily life. Was it better than you expected?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          context: { sessionTitle, keyLanguage },
        }),
      });

      const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!res.ok || !data) {
        // The technical detail goes to the console log, not to the learner.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Role-play practice</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Have a conversation with the AI coach. It asks you questions, and you answer.
          </p>
        </div>
        {keyLanguage.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keyLanguage.map((item) => (
              <span key={item} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

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
                {msg.role === 'user' ? 'You' : 'Fluency Coach'}
              </p>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500">
              Fluency Coach is replying…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your response in English…"
          className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
