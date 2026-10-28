import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Template = { id: string; template_key: string; label: string; channel: string; body: string; is_active: boolean }
const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', push: 'Push' }

export function CommunicationTemplatesPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['communication_templates_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('communication_templates').select('*').order('label')
      if (error) throw error
      return data as Template[]
    }
  })
  const save = useMutation({
    mutationFn: async (row: Partial<Template> & { id: string }) => {
      const { error } = await supabase.from('communication_templates').update(row).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['communication_templates_admin'] })
  })

  return (
    <div>
      <p className="mb-3 text-xs text-content-muted">
        Aún no hay un proveedor de WhatsApp/SMS/Email conectado, así que estas plantillas se usan para copiar el mensaje manualmente desde Cobranza. Variables: {'{{nombre}}'}, {'{{monto}}'}, {'{{cuota}}'}, {'{{fecha}}'}, {'{{dias_atraso}}'}, {'{{saldo}}'}, {'{{numero_prestamo}}'}.
      </p>
      <div className="space-y-3">
        {data?.map((t) => (
          <div key={t.id} className="rounded-lg border border-line p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-content">{t.label} <span className="text-xs text-content-muted">({CHANNEL_LABEL[t.channel] ?? t.channel})</span></p>
              <button onClick={() => save.mutate({ id: t.id, is_active: !t.is_active })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.is_active ? 'bg-success/10 text-success-text' : 'bg-navy/5 text-content-muted'}`}>
                {t.is_active ? 'Activa' : 'Inactiva'}
              </button>
            </div>
            <textarea aria-label="Texto de la plantilla" className="field-input" rows={2} defaultValue={t.body} onBlur={(e) => e.target.value !== t.body && save.mutate({ id: t.id, body: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  )
}
