import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
