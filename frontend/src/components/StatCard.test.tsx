import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Win Rate" value="75.0%" />)
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('renders sub when provided', () => {
    render(<StatCard label="Win Rate" value="75.0%" sub="Last 10 games" />)
    expect(screen.getByText('Last 10 games')).toBeInTheDocument()
  })

  it('renders leaderboard button when onLeaderboardClick is provided', () => {
    render(<StatCard label="Wins" value={5} onLeaderboardClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'View leaderboard' })).toBeInTheDocument()
  })

  it('omits leaderboard button when onLeaderboardClick is not provided', () => {
    render(<StatCard label="Wins" value={5} />)
    expect(screen.queryByRole('button', { name: 'View leaderboard' })).not.toBeInTheDocument()
  })

  it('calls onLeaderboardClick when the button is clicked', async () => {
    const handler = vi.fn()
    render(<StatCard label="Wins" value={5} onLeaderboardClick={handler} />)
    await userEvent.click(screen.getByRole('button', { name: 'View leaderboard' }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('shows a disabled icon with tooltip when disabledReason is set', () => {
    render(<StatCard label="Wins" value={5} disabledReason="Not enough players" />)
    expect(screen.queryByRole('button', { name: 'View leaderboard' })).not.toBeInTheDocument()
    const icon = screen.getByLabelText('Leaderboard unavailable')
    expect(icon).toHaveAttribute('title', 'Not enough players')
  })

  it('shows the active button (not disabled icon) when both props are set', () => {
    render(<StatCard label="Wins" value={5} onLeaderboardClick={() => {}} disabledReason="Should not appear" />)
    expect(screen.getByRole('button', { name: 'View leaderboard' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Leaderboard unavailable')).not.toBeInTheDocument()
  })
})
