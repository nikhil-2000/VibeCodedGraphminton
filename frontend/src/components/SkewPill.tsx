type Props = {
  top: number
  mid: number
  bottom: number
  label?: string
  topLabel?: string
  bottomLabel?: string
}

export default function SkewPill({ top, mid, bottom, label, topLabel = 'Top third', bottomLabel = 'Bottom third' }: Props) {
  const total = top + mid + bottom
  if (total === 0) return null

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`

  return (
    <div className="mb-4">
      {label && <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>}
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {top > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: pct(top) }}
            title={`${topLabel}: ${top} games (${pct(top)})`}
          />
        )}
        {mid > 0 && (
          <div
            className="bg-yellow-500 transition-all"
            style={{ width: pct(mid) }}
            title={`Middle third: ${mid} games (${pct(mid)})`}
          />
        )}
        {bottom > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: pct(bottom) }}
            title={`${bottomLabel}: ${bottom} games (${pct(bottom)})`}
          />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-xs text-muted-foreground">
        <span className="absolute left-0 flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />{topLabel} — {pct(top)}</span>
        {mid > 0 && (
          <span className="absolute flex items-center gap-1" style={{ left: pct(top) }}><span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />Mid — {pct(mid)}</span>
        )}
        <span className="absolute right-0 flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />{bottomLabel} — {pct(bottom)}</span>
      </div>
    </div>
  )
}
