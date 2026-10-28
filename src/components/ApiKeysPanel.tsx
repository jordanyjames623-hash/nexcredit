import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { planErrorMessage } from '@/components/UpgradeToProModal'

type ApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

// API pública de solo lectura (plan Business): permite que otros sistemas (contabilidad, hojas de
// cálculo, tableros) lean tus clientes, préstamos y pagos con una llave.
export function ApiKeysPanel() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error: listError } = await supabase
        .from('api_keys').select('id, name, key_prefix, created_at, last_used_at, revoked_at').order('created_at', { ascending: false })
      if (listError) throw listError
      return data as ApiKey[]
    }
  })

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('create_api_key', { p_name: name.trim() })
      if (rpcError) throw rpcError
      return data as { key: string }
    },
    onSuccess: (data) => { setNewKey(data.key); setName(''); setError(null); setCopied(false); qc.invalidateQueries({ queryKey: ['api-keys'] }) },
    onError: (e: any) => setError(planErrorMessage(e.message) ?? e.message ?? 'No se pudo crear la llave.')
  })

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error: rpcError } = await supabase.rpc('revoke_api_key', { p_id: id })
      if (rpcError) throw rpcError
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
    onError: (e: any) => setError(e.message ?? 'No se pudo revocar la llave.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Ponle un nombre a la llave (ej. "Contabilidad").'); return }
    create.mutate()
  }

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
  }

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`
  const keys = keysQuery.data ?? []

  return (
    <div className="space-y-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {newKey && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="mb-2 text-sm font-semibold text-content">Tu nueva llave — cópiala ahora</p>
          <p className="mb-2 text-xs text-content-muted">Por seguridad no se vuelve a mostrar. Si la pierdes, revócala y crea otra.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 text-xs text-content">{newKey}</code>
            <button onClick={copyKey} className="btn-solid shrink-0 !px-3 !py-1.5 text-xs"><Copy size={14} className="mr-1" />{copied ? 'Copiada' : 'Copiar'}</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input aria-label="Nombre de la llave" className="field-input" placeholder='Nombre de la llave (ej. "Contabilidad")' value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={create.isPending} className="btn-solid shrink-0">{create.isPending ? 'Creando…' : 'Crear llave'}</button>
      </form>

      {keys.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className={`text-sm ${k.revoked_at ? 'text-content-muted line-through' : 'text-content'}`}>{k.name} <span className="font-mono text-xs text-content-muted">{k.key_prefix}…</span></p>
                <p className="text-xs text-content-muted">
                  Creada {new Date(k.created_at).toLocaleDateString('es-DO')} ·{' '}
                  {k.last_used_at ? `último uso ${new Date(k.last_used_at).toLocaleDateString('es-DO')}` : 'sin usar'}
                </p>
              </div>
              {k.revoked_at ? (
                <span className="badge-neutral">Revocada</span>
              ) : (
                <button onClick={() => { if (window.confirm('¿Revocar esta llave? Los sistemas que la usen dejarán de funcionar.')) revoke.mutate(k.id) }} className="text-xs font-medium text-danger hover:underline">Revocar</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-line p-4">
        <p className="mb-2 text-sm font-semibold text-content">Cómo usarla</p>
        <p className="mb-2 text-xs text-content-muted">Solo lectura. Recursos: <code>clients</code>, <code>loans</code>, <code>payments</code>. Parámetros opcionales: <code>limit</code> (máx. 500) y <code>offset</code>.</p>
        <pre className="overflow-x-auto rounded bg-background p-3 text-xs text-content">{`curl "${baseUrl}/loans?limit=100" \\\n  -H "x-api-key: TU_LLAVE"`}</pre>
        <p className="mt-2 text-xs text-content-muted">Si el negocio deja de estar en el plan Business, las llaves dejan de funcionar.</p>
      </div>
    </div>
  )
}
