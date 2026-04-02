import { apiFetch } from './client'
import type { IngestResult } from '../types'

export const postScores = (files: string[]) =>
  apiFetch<IngestResult>('/ingest/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
