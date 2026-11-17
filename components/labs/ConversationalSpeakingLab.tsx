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
      content: "Morning! Dreadful weather we’re having today, isn't it? How did your journey in go?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/speaking/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          messages: updatedMessages,
          context: { sessionTitle, keyLanguage },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch response');

      setMessages([...updatedMessages, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">💬 Multi-Turn Conversational Lab</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Practise real-time dialogue with your British AI colleague.
        </p>
      </div>

      {/* Chat Messages Box */}
      <div className="h-72 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white text-gray-800 border border-gray-200 shadow-2xs rounded-bl-none'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-75">
                {msg.role === 'user' ? 'You' : 'British Coach'}
              </p>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-500 border border-gray-200 p-3 rounded-xl text-xs animate-pulse">
              British Coach is typing...
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your response in British English..."
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}