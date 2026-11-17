'use client';

export default function ProgressChart({ logs }: { logs: any[] }) {
  if (!logs || logs.length === 0) return null;

  // Sort logs chronologically for the chart
  const sortedLogs = [...logs].reverse();
  const maxScore = 100;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">📈 Fluency & Score Trends</h2>
        <p className="text-xs text-gray-500 mt-0.5">Visualizing your performance across recent sessions and quizzes.</p>
      </div>

      <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2 border-b border-gray-100">
        {sortedLogs.map((log, index) => {
          const heightPercent = Math.min(Math.max((log.score / maxScore) * 100, 15), 100);
          return (
            <div key={log.id || index} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
              
              {/* Tooltip on hover */}
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-sm">
                Score: {log.score}% ({log.session_id})
              </div>

              {/* Bar */}
              <div 
                style={{ height: `${heightPercent}%` }}
                className="w-full max-w-[40px] bg-blue-600 rounded-t-lg transition-all duration-300 group-hover:bg-blue-700"
              />

              {/* X-Axis Label */}
              <span className="text-[10px] font-medium text-gray-400 truncate max-w-full">
                #{index + 1}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-gray-400 px-1">
        <span>Oldest Session</span>
        <span>Latest Session</span>
      </div>
    </div>
  );
}