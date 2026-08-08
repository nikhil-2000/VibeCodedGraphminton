import { useState } from 'react'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { useCurrentUser } from '../context/CurrentUserContext'
import { createSeason, updateSeason, deleteSeason } from '../api/seasons'
import type { Season } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { DatePicker } from '../components/ui/date-picker'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'

function SeasonRow({
  season,
  onSaved,
  onDeleted,
}: {
  season: Season
  onSaved: (s: Season) => void
  onDeleted: (id: number) => void
}) {
  const { isAdmin } = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(season.name)
  const [startDate, setStartDate] = useState(season.start_date)
  const [endDate, setEndDate] = useState(season.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const handleDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    deleteSeason(season.id)
      .then(() => { setDeleteOpen(false); onDeleted(season.id) })
      .catch((e: Error) => { setDeleteError(e.message); setDeleting(false) })
  }

  if (!editing) {
    return (
      <>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">{season.name}</p>
              <p className="text-sm text-muted-foreground">
                {season.start_date} → {season.end_date ?? 'ongoing'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={season.game_count > 0}
                  title={season.game_count > 0 ? 'Cannot delete a season with recorded games' : undefined}
                  onClick={() => { setDeleteError(null); setDeleteOpen(true) }}
                >
                  Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete season "{season.name}"?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This cannot be undone. Only seasons with no recorded games can be deleted.
            </p>
            {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="min-w-0 flex-1" />
          <div className="sm:w-44 shrink-0">
            <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" />
          </div>
          <div className="sm:w-44 shrink-0">
            <DatePicker value={endDate} onChange={setEndDate} placeholder="End date (optional)" />
          </div>
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

  const handleDeleted = (id: number) => {
    setLocalSeasons(displayed.filter((s) => s.id !== id))
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
          <SeasonRow key={s.id} season={s} onSaved={handleSaved} onDeleted={handleDeleted} />
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
