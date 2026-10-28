// Marca de Nexcredit: cuadro azul con una "N" en trazo continuo, mismo estilo que la "C" anterior
// (mismo degradado, mismo grosor de trazo, mismo acento en punto).
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="brand-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B7BF0" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#brand-mark-gradient)" />
      <path d="M13 27V13L27 27V13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27.5" cy="12" r="1.8" fill="#fff" opacity="0.9" />
    </svg>
  )
}
