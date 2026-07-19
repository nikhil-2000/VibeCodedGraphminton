export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
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
