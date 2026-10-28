type TooltipItem = { name?: string | number; value?: number | string; color?: string }

// Tooltip de vidrio para Recharts (se usa como <Tooltip content={<ChartTooltip format={...} />} />).
export function ChartTooltip({ active, payload, label, format, title }: {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
  format: (value: number) => string
  title?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="glass-panel glass-strong !rounded-xl px-3 py-2 text-xs">
      {label !== undefined && label !== '' && <p className="mb-1 font-medium text-content-muted">{label}</p>}
      {payload.map((item, i) => (
        <p key={i} className="flex items-center gap-2 font-semibold text-content">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="font-medium text-content-muted">{title ?? item.name}</span>
          <span className="money">{format(Number(item.value))}</span>
        </p>
      ))}
    </div>
  )
}
