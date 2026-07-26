// Supabase REST API直接呼び出しユーティリティ（JSクライアントの代替）
const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function headers(extra?: Record<string, string>) {
  return {
    'apikey': KEY(),
    'Authorization': `Bearer ${KEY()}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra,
  }
}

export async function sbGet<T = unknown>(path: string): Promise<T[]> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, { headers: headers(), cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export async function sbGetOne<T = unknown>(path: string): Promise<T | null> {
  const rows = await sbGet<T>(path)
  return rows[0] ?? null
}

export async function sbPost<T = unknown>(path: string, body: object): Promise<T | null> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data[0] ?? null : data
}

export async function sbUpsert<T = unknown>(path: string, body: object, onConflict: string): Promise<T | null> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    method: 'POST',
    headers: headers({ 'Prefer': `resolution=merge-duplicates,return=representation` }),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data[0] ?? null : data
}

export async function sbPatch(path: string, body: object): Promise<boolean> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  return res.ok
}

export async function sbDelete(path: string): Promise<boolean> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: headers(),
    cache: 'no-store',
  })
  return res.ok
}
