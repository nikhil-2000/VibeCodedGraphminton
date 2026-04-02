import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LeaderboardTable from './LeaderboardTable'
import type { LeaderboardEntry } from '../types'

const entries: LeaderboardEntry[] = [
  { player_id: 1, canonical_name: 'Alice', games_played: 20, wins: 16, losses: 4, win_rate: 0.8, avg_points: 19.5 },
  { player_id: 2, canonical_name: 'Bob', games_played: 20, wins: 8, losses: 12, win_rate: 0.4, avg_points: 15.2 },
]

describe('LeaderboardTable', () => {
  it('renders player names', () => {
    render(<MemoryRouter><LeaderboardTable entries={entries} /></MemoryRouter>)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders win rate as percentage', () => {
    render(<MemoryRouter><LeaderboardTable entries={entries} /></MemoryRouter>)
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('renders rank numbers', () => {
    render(<MemoryRouter><LeaderboardTable entries={entries} /></MemoryRouter>)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
