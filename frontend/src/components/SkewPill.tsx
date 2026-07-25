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
      <p className="mt-1.5 text-xs text-muted-foreground">
        <span className="text-green-500">{pct(top)}</span> top · <span className="text-yellow-500">{pct(mid)}</span> mid · <span className="text-red-500">{pct(bottom)}</span> bottom
      </p>
    </div>
  )
}
