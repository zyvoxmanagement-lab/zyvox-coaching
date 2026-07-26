import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/auth'
import AdminNav from '@/components/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  return (
    <div className="min-h-screen flex flex-col">
      <AdminNav />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
