const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function getUserId(): string {
  let id = localStorage.getItem('graphminton_user_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('graphminton_user_id', id)
  }
  return id
}

function getAdminToken(): string {
  return localStorage.getItem('graphminton_admin_token') ?? ''
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('X-User-ID', getUserId())
  const token = getAdminToken()
  if (token) headers.set('X-Admin-Token', token)

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const { detail } = body as { detail?: string | string[] }
    const message = Array.isArray(detail)
      ? detail.join('\n')
      : detail ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}
