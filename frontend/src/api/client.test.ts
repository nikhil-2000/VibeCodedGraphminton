import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './client'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 200 })
    )
    const result = await apiFetch<{ id: number }>('/players')
    expect(result).toEqual({ id: 1 })
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    )
    await expect(apiFetch('/players/999')).rejects.toThrow('Not found')
  })
})
