import { Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePlayerFilter } from '../context/PlayerFilterContext'

interface Props {
  iconOnly?: boolean
}

export default function PlayerFilterPopover({ iconOnly }: Props) {
  const { allPlayers, selectedIds, setSelectedIds, activePreset, setPreset } = usePlayerFilter()

  const label =
    activePreset === 'everyone' ? 'Everyone' :
    activePreset === 'regulars' ? 'Regulars' :
    `${selectedIds.length} players`

  const hasCustom = activePreset === 'custom'

  const togglePlayer = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
  }

  return (
    <Popover>
      {iconOnly ? (
        <PopoverTrigger
          className={`relative rounded p-1.5 transition-colors hover:text-foreground ${hasCustom ? 'text-yellow-400' : 'text-muted-foreground'}`}
          aria-label="Filter players"
        >
          <Users size={16} />
          {hasCustom && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-yellow-400" />
          )}
        </PopoverTrigger>
      ) : (
        <PopoverTrigger className="rounded border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          {label}
        </PopoverTrigger>
      )}
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
              {p.is_sub && (
                <span className="ml-auto text-[10px] text-muted-foreground">sub</span>
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
