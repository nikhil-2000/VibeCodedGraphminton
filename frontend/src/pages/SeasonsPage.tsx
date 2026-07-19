import { useState } from 'react'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { createSeason } from '../api/seasons'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'

export default function SeasonsPage() {
  const { seasons, setSelectedSeasonId } = useSeasonFilter()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name || !startDate) {
      setError('Name and start date are required.')
      return
    }
    setSubmitting(true)
    try {
      const season = await createSeason({
        name,
        start_date: startDate as unknown as Date,
        end_date: endDate ? endDate as unknown as Date : undefined,
      })
      setSelectedSeasonId(season.id)
      setName('')
      setStartDate('')
      setEndDate('')
      window.location.reload()
    } catch {
      setError('Failed to create season. Name may already exist.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Seasons</h1>

      <div className="space-y-3">
        {seasons.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.start_date} → {s.end_date ?? 'ongoing'}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Season</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Name</label>
              <Input
                placeholder="e.g. 2025-2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Start date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">End date (leave blank if ongoing)</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create season'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
