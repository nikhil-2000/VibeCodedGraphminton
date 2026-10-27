import { apiFetch } from './client'
import type { BalancedLeague } from '../types'

export const getBalancedLeague = (minCoverage = 1) =>
  apiFetch<BalancedLeague>(`/balanced-league?min_coverage=${minCoverage}`)
