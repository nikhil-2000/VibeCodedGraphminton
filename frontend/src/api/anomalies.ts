import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) => {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?${params.toString()}`)
}

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) => {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?${params.toString()}`)
}
