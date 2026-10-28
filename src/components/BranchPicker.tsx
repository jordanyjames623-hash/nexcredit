import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Selector de sucursal para el propietario del plan Business. Si no aplica (otro plan,
// colaborador, o aún no hay sucursales) no se muestra nada.
export function useBranchPickerEnabled() {
  const { isOwner, hasFeature } = useAuth()
  return hasFeature('sucursales') && isOwner
}

export function BranchPicker({ value, onChange, emptyLabel }: { value: string; onChange: (v: string) => void; emptyLabel: string }) {
  const enabled = useBranchPickerEnabled()
  const { data } = useQuery({
    queryKey: ['branches-active'],
    enabled,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name')
      if (error) throw error
      return rows as { id: string; name: string }[]
    }
  })
  if (!enabled || !data || data.length === 0) return null
  return (
    <div>
      <label className="field-label">Sucursal</label>
      <select aria-label="Sucursal" className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  )
}
