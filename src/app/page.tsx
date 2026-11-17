import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          🇬🇧 B1 British English Platform
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Fluency Studio</h1>
        <p className="text-sm text-gray-600">
          Master British English with AI-powered speaking labs, writing corrections, and interactive lessons.
        </p>
        <div className="space-y-3 pt-2">
          <Link
            href="/login"
            className="block w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm"
          >
            Sign In / Get Started
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