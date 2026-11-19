import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-57px)] bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          CEFR B1 → B2 Global English Platform · 64 Hours
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Fluency Studio</h1>
        <p className="text-sm text-gray-600">
          Master international English fluency across 8 modules and 32 two-hour sessions with connected-speech labs, multi-accent listening, and speaking coaching.
        </p>
        <div className="space-y-3 pt-2">
          <Link
            href="/login"
            className="block w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm"
          >
            Sign In / Get Started
          </Link>
          <Link
            href="/curriculum"
            className="block w-full py-3 bg-white text-indigo-700 border border-indigo-200 font-semibold rounded-lg hover:bg-indigo-50 transition-colors text-sm"
          >
            Browse Curriculum
          </Link>
          <Link
            href="/labs"
            className="block w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Explore Labs
          </Link>
        </div>
      </div>
    </main>
  );
}
