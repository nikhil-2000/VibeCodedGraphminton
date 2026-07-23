const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init)
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
