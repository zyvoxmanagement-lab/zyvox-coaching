export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zyvox Coaching',
  description: 'Zyvox コーチング管理システム',
}

export function generateViewport() {
  return {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#060912]">{children}</body>
    </html>
  )
}
