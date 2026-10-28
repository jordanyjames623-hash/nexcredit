import { useState } from 'react'
import { MapPin, Loader2, X } from 'lucide-react'

// Captura puntual de ubicación, siempre iniciada por el usuario (nunca automática ni continua).
// No hay rastreo del cobrador: solo guarda un punto para el cliente cuando alguien lo pide.
export function LocationCapture({ value, onChange }: { value: { lat: number; lng: number } | null; onChange: (v: { lat: number; lng: number } | null) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function capture() {
    if (!navigator.geolocation) { setError('Este dispositivo no puede compartir su ubicación.'); return }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLoading(false) },
      () => { setError('No se pudo obtener la ubicación. Revisa los permisos del navegador.'); setLoading(false) },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  return (
    <div>
      <label className="field-label">Ubicación (opcional, para el mapa de rutas)</label>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
          <MapPin size={15} className="shrink-0 text-success-text" aria-hidden="true" />
          <span className="text-content">Ubicación guardada</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Quitar ubicación" className="ml-auto text-content-muted hover:text-content">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={capture} disabled={loading} className="btn-secondary !py-2 text-sm">
          {loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
          {loading ? 'Obteniendo…' : 'Usar mi ubicación actual'}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
