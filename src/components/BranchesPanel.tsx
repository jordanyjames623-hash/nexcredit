import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { planErrorMessage } from '@/components/UpgradeToProModal'

type Branch = { id: string; name: string; address: string | null; phone: string | null; is_active: boolean }
type Collaborator = { user_id: string; email: string; full_name: string }
type MemberBranch = { user_id: string; branch_id: string | null }

// Sucursales (plan Business): crear/activar, y asignar colaboradores. Los clientes que registre
// cada colaborador quedan en su sucursal; los préstamos siguen a su cliente.
export function BranchesPanel() {
  const { business } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const branchesQuery = useQuery({
    queryKey: ['settings-branches'],
    queryFn: async () => {
      const { data, error: listError } = await supabase.from('branches').select('id, name, address, phone, is_active').order('name')
      if (listError) throw listError
      return data as Branch[]
    }
  })

  const collaboratorsQuery = useQuery({
    queryKey: ['settings-branches-collaborators'],
    queryFn: async () => {
      const { data, error: collabError } = await supabase.rpc('list_collaborators')
      if (collabError) throw collabError
      return data as Collaborator[]
    }
  })

  const membersQuery = useQuery({
    queryKey: ['settings-members-branch'],
    queryFn: async () => {
      const { data, error: memberError } = await supabase.from('business_members').select('user_id, branch_id')
      if (memberError) throw memberError
      return data as MemberBranch[]
    }
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['settings-branches'] })
    qc.invalidateQueries({ queryKey: ['settings-members-branch'] })
    qc.invalidateQueries({ queryKey: ['dashboard_branches'] })
    qc.invalidateQueries({ queryKey: ['branches-active'] })
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error('Negocio no disponible')
      const { error: insertError } = await supabase.from('branches').insert({
        business_id: business.id, name: name.trim(), address: address.trim() || null, phone: phone.trim() || null
      })
      if (insertError) throw insertError
    },
    onSuccess: () => { setName(''); setAddress(''); setPhone(''); setError(null); refresh(); toast.success('Sucursal creada') },
    onError: (e: any) => setError(
      planErrorMessage(e.message) ?? (String(e.message).includes('duplicate') ? 'Ya existe una sucursal con ese nombre.' : e.message ?? 'No se pudo crear la sucursal.')
    )
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error: updateError } = await supabase.from('branches').update({ is_active: active }).eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: refresh,
    onError: (e: any) => setError(e.message ?? 'No se pudo actualizar la sucursal.')
  })

  const assign = useMutation({
    mutationFn: async ({ userId, branchId }: { userId: string; branchId: string }) => {
      const { error: rpcError } = await supabase.rpc('set_member_branch', { p_user_id: userId, p_branch: branchId || null })
      if (rpcError) throw rpcError
    },
    onSuccess: refresh,
    onError: (e: any) => setError(planErrorMessage(e.message) ?? e.message ?? 'No se pudo asignar la sucursal.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Escribe el nombre de la sucursal.'); return }
    create.mutate()
  }

  const branches = branchesQuery.data ?? []
  const activeBranches = branches.filter((b) => b.is_active)
  const branchOf = new Map<string, string>((membersQuery.data ?? []).map((m): [string, string] => [m.user_id, m.branch_id ?? '']))

  return (
    <div className="space-y-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="field-label">Nombre</label><input aria-label="Nombre" className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Santiago" /></div>
          <div><label className="field-label">Dirección</label><input aria-label="Dirección" className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><label className="field-label">Teléfono</label><input aria-label="Teléfono" className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <button type="submit" disabled={create.isPending} className="btn-solid">{create.isPending ? 'Creando…' : 'Agregar sucursal'}</button>
      </form>

      {branches.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {branches.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className={`text-sm ${b.is_active ? 'text-content' : 'text-content-muted'}`}>{b.name}{b.is_active ? '' : ' (inactiva)'}</p>
                <p className="text-xs text-content-muted">{[b.address, b.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>
              </div>
              <button onClick={() => toggleActive.mutate({ id: b.id, active: !b.is_active })} className="text-xs font-medium text-primary hover:underline">
                {b.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(collaboratorsQuery.data ?? []).length > 0 && activeBranches.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-content">Sucursal de cada colaborador</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(collaboratorsQuery.data ?? []).map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-content">{c.full_name || c.email}</span>
                <select
                  aria-label={`Sucursal de ${c.full_name || c.email}`}
                  className="field-input !w-auto text-sm"
                  value={branchOf.get(c.user_id) ?? ''}
                  onChange={(e) => assign.mutate({ userId: c.user_id, branchId: e.target.value })}
                >
                  <option value="">Sin sucursal</option>
                  {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-content-muted">Los clientes que registre cada colaborador quedan en su sucursal. Solo tú puedes cambiar la sucursal de un cliente (desde su ficha).</p>
        </div>
      )}
      <p className="text-xs text-content-muted">
        Nota: las sucursales sirven para organizar y comparar resultados. No separan lo que cada colaborador puede ver; eso sigue definido por sus permisos.
      </p>
    </div>
  )
}
