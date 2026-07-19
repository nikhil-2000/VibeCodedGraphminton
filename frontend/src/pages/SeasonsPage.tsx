import { useState } from 'react'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { createSeason, updateSeason } from '../api/seasons'
import type { Season } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { DatePicker } from '../components/ui/date-picker'

function SeasonRow({ season, onSaved }: { season: Season; onSaved: (s: Season) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(season.name)
  const [startDate, setStartDate] = useState(season.start_date)
  const [endDate, setEndDate] = useState(season.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateSeason(season.id, {
        name,
        start_date: startDate,
        end_date: endDate || undefined,
      })
      onSaved(updated)
      setEditing(false)
    } catch {
      setError('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setName(season.name)
    setStartDate(season.start_date)
    setEndDate(season.end_date ?? '')
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">{season.name}</p>
            <p className="text-sm text-muted-foreground">
              {season.start_date} → {season.end_date ?? 'ongoing'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1" />
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" />
          <DatePicker value={endDate} onChange={setEndDate} placeholder="End date (optional)" />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SeasonsPage() {
  const { seasons, setSelectedSeasonId } = useSeasonFilter()
  const [localSeasons, setLocalSeasons] = useState<Season[] | null>(null)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const displayed = localSeasons ?? seasons

  const handleSaved = (updated: Season) => {
    setLocalSeasons(displayed.map((s) => (s.id === updated.id ? updated : s)))
  }

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
        start_date: startDate,
        end_date: endDate || undefined,
      })
      setLocalSeasons([...displayed, season])
      setSelectedSeasonId(season.id)
      setName('')
      setStartDate('')
      setEndDate('')
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
        {displayed.map((s) => (
          <SeasonRow key={s.id} season={s} onSaved={handleSaved} />
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
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Pick start date" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                End date (leave blank if ongoing)
              </label>
              <DatePicker value={endDate} onChange={setEndDate} placeholder="Pick end date (optional)" />
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
