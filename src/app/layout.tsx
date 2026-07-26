export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zyvox Coaching',
  description: 'Zyvox コーチング管理システム',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#060912]">{children}</body>
    </html>
  )
}
