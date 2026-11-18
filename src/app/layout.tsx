// app/layout.tsx
import './globals.css' // Adjust path if using styles/globals.css -> import '../styles/globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'B1 British English Curriculum Platform',
  description: 'Learn British English with AI-powered feedback and structured modules.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}