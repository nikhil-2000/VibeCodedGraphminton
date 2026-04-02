import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UploadForm from './UploadForm'

describe('UploadForm', () => {
  it('renders file input and submit button', () => {
    render(<UploadForm onSuccess={() => {}} />)
    expect(screen.getByLabelText(/csv files/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
  })

  it('disables submit when no files selected', () => {
    render(<UploadForm onSuccess={() => {}} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled()
  })

  it('calls onSuccess with result after upload', async () => {
    const onSuccess = vi.fn()
    render(<UploadForm onSuccess={onSuccess} />)

    const file = new File(
      ['Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n08-04-2024,1,Alice,Bob,21,Cara,Dan,9'],
      'Week01.csv',
      { type: 'text/csv' }
    )
    const input = screen.getByLabelText(/csv files/i)
    fireEvent.change(input, { target: { files: [file] } })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ games_loaded: 1, errors: [] }), { status: 200 })
    ))

    fireEvent.click(screen.getByRole('button', { name: /upload/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ games_loaded: 1, errors: [] }))
    vi.unstubAllGlobals()
  })
})
