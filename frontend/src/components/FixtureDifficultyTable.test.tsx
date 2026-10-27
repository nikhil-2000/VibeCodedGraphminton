import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FixtureDifficultyTable from './FixtureDifficultyTable'
import type { FixtureDifficultyEntry } from '../types'

const base = {
  rank: 1, games_played: 3, favourable: 2, even: 1, underdog: 0,
  net_difficulty: 0.67, favourable_pct: 0.67, expected_net: 0.4, expected_favourable_pct: 0.6, vs_expected: 0.27,
}
const entries: FixtureDifficultyEntry[] = [
  { player_id: 1, ...base },
  {
    player_id: 2, ...base, rank: 2, favourable: 0, even: 1, underdog: 2,
    net_difficulty: -0.67, favourable_pct: 0, expected_net: -0.2, expected_favourable_pct: 0.2, vs_expected: -0.47,
  },
  {
    player_id: 3, ...base, rank: 3, games_played: 0, favourable: 0, even: 0, underdog: 0,
    net_difficulty: null, favourable_pct: null, expected_net: 0, expected_favourable_pct: 0.3, vs_expected: null,
  },
]
const names = { 1: 'Alice', 2: 'Bob', 3: 'Cara' }

describe('FixtureDifficultyTable', () => {
  it('renders positive scores in green and negative in red', () => {
    render(<FixtureDifficultyTable entries={entries} playerNames={names} />)
    expect(screen.getByText('+0.67')).toHaveClass('text-green-500')
    expect(screen.getByText('-0.67')).toHaveClass('text-red-500')
    expect(screen.getByText('+0.27')).toHaveClass('text-green-500')
  })

  it('shows the expected baseline next to vs expected', () => {
    render(<FixtureDifficultyTable entries={entries} playerNames={names} />)
    expect(screen.getByText('exp +0.40')).toBeInTheDocument()
  })

  it('shows dashes for a player with no games', () => {
    render(<FixtureDifficultyTable entries={entries} playerNames={names} />)
    const row = screen.getByText('Cara').closest('tr')!
    expect(row.textContent).toContain('–')
    expect(row.textContent).not.toContain('exp')
  })

  it('renders favourable as a percentage', () => {
    render(<FixtureDifficultyTable entries={entries} playerNames={names} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })
})
