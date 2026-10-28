import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Selector "Asignar a" — solo lo ve el propietario. Un colaborador nunca lo ve:
 * lo que él crea queda asignado a sí mismo automáticamente (por defecto en la base de datos).
 */
export function AssigneePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { isOwner, session, profile } = useAuth()

  const { data: collaborators } = useQuery({
    queryKey: ['collaborators-for-picker'],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_collaborators')
      if (error) throw error
      return data as { user_id: string; full_name: string; email: string; is_active: boolean }[]
    }
  })

  if (!isOwner) return null

  return (
    <div>
      <label className="field-label">{label ?? 'Asignar a'}</label>
      <select aria-label={label ?? 'Asignar a'} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={session?.user.id ?? ''}>{profile?.full_name || 'Yo mismo'} (tú)</option>
        {(collaborators ?? []).filter((c) => c.is_active).map((c) => (
          <option key={c.user_id} value={c.user_id}>{c.full_name || c.email}</option>
        ))}
      </select>
    </div>
  )
}
