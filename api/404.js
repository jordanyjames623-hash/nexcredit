// Destino de las reglas de vercel.json que bloquean /.env y /.git (hallazgo VIGÍA).
// Reescribir a una ruta inexistente NO devolvió 404 (Vercel cae al fallback SPA),
// así que el 404 lo devuelve esta función. Responde 404 a cualquier método.
export default function handler(req, res) {
  res.status(404).end()
}
