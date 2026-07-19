import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePlayerFilter } from '../context/PlayerFilterContext'

export default function PlayerFilterPopover() {
  const { allPlayers, selectedIds, setSelectedIds } = usePlayerFilter()

  const isAll = selectedIds.length === allPlayers.length
  const label = isAll ? 'Everyone' : `${selectedIds.length} players`

  const togglePlayer = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
  }

  const selectAll = () => setSelectedIds(allPlayers.map((p) => p.id))

  return (
    <Popover>
      <PopoverTrigger className="rounded border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Filter players
        </p>
        <div className="mb-3 flex gap-2">
          <Button
            size="sm"
            variant={isAll ? 'default' : 'outline'}
            onClick={selectAll}
            className="flex-1 text-xs"
          >
            Everyone
          </Button>
        </div>
        <div className="max-h-60 space-y-0.5 overflow-y-auto">
          {allPlayers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => togglePlayer(p.id)}
                className="h-3.5 w-3.5"
              />
              <span>{p.canonical_name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
