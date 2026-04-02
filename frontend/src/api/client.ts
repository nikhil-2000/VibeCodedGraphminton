export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return body as T
}
