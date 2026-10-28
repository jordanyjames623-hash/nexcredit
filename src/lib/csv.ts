export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set }, new Set<string>()))
  const escape = (v: unknown) => {
    let s = String(v ?? '')
    // Neutraliza inyección de fórmulas al abrir el CSV en Excel: una celda
    // que empieza con = + - @ tab o CR se ejecutaría como fórmula.
    const c = s.charCodeAt(0)
    if (c === 61 || c === 43 || c === 45 || c === 64 || c === 9 || c === 13) s = "'" + s
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
