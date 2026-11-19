import React from 'react';
import Link from 'next/link';

// Define the shape of your practice logs
interface PracticeLog {
  id: string;
  title?: string;
  feedback?: string;
  score: number;
  created_at: string;
}

interface DashboardPageProps {
  logs?: PracticeLog[];
}

export default function DashboardPage({ logs = [] }: DashboardPageProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your B1 → B2 Global English Dashboard</h1>
        <Link
          href="/labs"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Start New Practice
        </Link>
      </div>

      <div className="space-y-4">
        {logs && logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className="p-4 border rounded-lg shadow-sm bg-white dark:bg-zinc-900">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-lg">{log.title || 'Practice Session'}</h3>
                <span className="text-sm text-gray-500">
                  {new Date(log.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                {log.feedback || 'Completed practice session.'}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-block px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                  Score: {log.score}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No practice logs found yet. Start a session above!</p>
        )}
      </div>
    </div>
  );
}
