import Link from 'next/link';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'B1 British English Curriculum Platform',
  description: 'Learn British English with AI-powered feedback and structured modules.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <header className="border-b border-slate-200 bg-white">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-bold text-slate-900">Fluency Studio</Link>
            <div className="flex items-center gap-4 text-sm font-medium">
              <Link href="/curriculum" className="text-slate-700 hover:text-indigo-700">Curriculum</Link>
              <Link href="/labs" className="text-slate-700 hover:text-indigo-700">Labs</Link>
              <Link href="/login" className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700">Sign in</Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
