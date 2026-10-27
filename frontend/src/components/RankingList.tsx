import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface Props {
  ids: number[]
  playerNames: Record<number, string>
  onReorder: (ids: number[]) => void
}

function RankingRow({ id, rank, name }: { id: number; rank: number; name: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm ${isDragging ? 'relative z-10 shadow-md' : ''}`}
    >
      <button
        type="button"
        aria-label={`Drag ${name}`}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className="w-6 text-right font-mono text-xs text-muted-foreground">{rank}</span>
      <span className="font-medium">{name}</span>
    </li>
  )
}

export default function RankingList({ ids, playerNames, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1.5">
          {ids.map((id, i) => (
            <RankingRow key={id} id={id} rank={i + 1} name={playerNames[id] ?? `#${id}`} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}
