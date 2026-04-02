import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameCard from './GameCard'
import type { Game } from '../types'

const game: Game = {
  id: 1,
  played_on: '2024-04-08',
  session: 1,
  game_number: 1,
  team_a_score: 21,
  team_b_score: 9,
}

describe('GameCard', () => {
  it('renders scores', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('renders date', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('2024-04-08')).toBeInTheDocument()
  })

  it('renders session number', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('Session 1')).toBeInTheDocument()
  })
})
