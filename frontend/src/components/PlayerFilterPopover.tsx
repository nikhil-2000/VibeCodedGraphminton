import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'

export default function PlayerFilterPopover() {
  const { allPlayers, selectedIds, setSelectedIds, activePreset, setPreset } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()

  function isSub(player: (typeof allPlayers)[number]): boolean {
    const role = selectedSeasonId != null
      ? player.season_roles.find((r) => r.season_id === selectedSeasonId)
      : player.season_roles[player.season_roles.length - 1]
    return role?.is_sub ?? false
  }

  const label =
    activePreset === 'everyone' ? 'Everyone' :
    activePreset === 'regulars' ? 'Regulars' :
    `${selectedIds.length} players`

  const togglePlayer = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
  }

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
            variant={activePreset === 'regulars' ? 'default' : 'outline'}
            onClick={() => setPreset('regulars')}
            className="flex-1 text-xs"
          >
            Regulars only
          </Button>
          <Button
            size="sm"
            variant={activePreset === 'everyone' ? 'default' : 'outline'}
            onClick={() => setPreset('everyone')}
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
              {isSub(p) && (
                <span className="ml-auto text-[10px] text-muted-foreground">sub</span>
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
