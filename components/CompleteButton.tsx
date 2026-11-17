'use client';

import { useState, useEffect } from 'react';

interface CompleteButtonProps {
  sessionId: string;
}

export default function CompleteButton({ sessionId }: CompleteButtonProps) {
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/progress?sessionId=${sessionId}`);
        const data = await res.json();
        setCompleted(data.completed);
      } catch (err) {
        console.error('Failed to load progress', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProgress();
  }, [sessionId]);

  async function toggleComplete() {
    const nextState = !completed;
    setCompleted(nextState);
    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, completed: nextState }),
      });
    } catch (err) {
      setCompleted(!nextState); // revert on error
    }
  }

  if (loading) return null;

  return (
    <button
      onClick={toggleComplete}
      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm ${
        completed
          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
      }`}
    >
      {completed ? '🎉 Lesson Completed!' : 'Mark Lesson as Complete'}
    </button>
  );
}