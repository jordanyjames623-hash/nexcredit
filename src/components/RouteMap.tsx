import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapClient = { id: string; full_name: string; address: string | null; latitude: number; longitude: number }

// Marcador numerado propio (círculo con el color de marca) en vez del ícono por defecto de Leaflet: evita el
// problema conocido de rutas de imagen rotas con bundlers (Vite incluido) y combina mejor con el diseño.
function numberedIcon(n: number) {
  return divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#2563EB;color:#fff;font:700 12px system-ui;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

// Mapa de solo lectura con los clientes de la ruta que tienen ubicación guardada, numerados según el orden
// de visita. Sin rastreo: no se pide ni se muestra la ubicación del cobrador, solo puntos fijos de clientes.
export function RouteMap({ clients }: { clients: MapClient[] }) {
  if (clients.length === 0) return null
  const center: [number, number] = [clients[0].latitude, clients[0].longitude]

  return (
    <div className="h-80 overflow-hidden rounded-2xl border border-line">
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {clients.map((c, i) => (
          <Marker key={c.id} position={[c.latitude, c.longitude]} icon={numberedIcon(i + 1)}>
            <Popup>
              <strong>{i + 1}. {c.full_name}</strong>
              {c.address && <><br />{c.address}</>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
