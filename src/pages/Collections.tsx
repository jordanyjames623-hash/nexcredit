import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { AlertTriangle, Search, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { money, shortDate } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

type Account = {
  loan_id: string; client_id: string; client_name: string; loan_number: number
  total_pending: number; days_overdue: number; stage: string; collection_override: string | null
  last_gestion_at: string | null; last_gestion_type: string | null; next_action_date: string | null
  promise_date: string | null; promise_amount: number | null
}
type Dashboard = { total_vencido: number; clientes_vencidos: number; promesas_pendientes: number; recuperado_periodo: number }

const STAGE_FILTERS = ['Todos', 'Próximo a vencer', 'Vencido 1–7', 'Vencido 8–30', 'Vencido 31–60', 'Vencido 61–90', 'Vencido +90', 'Cobranza intensiva', 'Recuperación', 'Legal', 'Castigado']
const STAGE_BADGE: Record<string, string> = {
  'Al día': 'badge-success', 'Próximo a vencer': 'badge-warning', 'Recuperado': 'badge-success', 'Castigado': 'badge-neutral',
  'Cobranza intensiva': 'badge-danger', 'Recuperación': 'badge-danger', 'Legal': 'badge-danger'
}
const GESTION_LABEL: Record<string, string> = {
  call: 'Llamada', visit: 'Visita', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email',
  agreement: 'Acuerdo', promise: 'Promesa', breach: 'Incumplimiento', note: 'Nota', evidence: 'Evidencia'
}

export function Collections() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('Todos')
  const [activeLoan, setActiveLoan] = useState<Account | null>(null)

  const dashboardQuery = useQuery({
    queryKey: ['collection_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collection_dashboard', { p_period: 'month' })
      if (error) throw error
      return data as Dashboard
    }
  })

  const accountsQuery = useQuery({
    queryKey: ['collection_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('collection_accounts').select('*').order('days_overdue', { ascending: false })
      if (error) throw error
      return data as Account[]
    }
  })

  const filtered = (accountsQuery.data ?? []).filter((a) => {
    if (search && !a.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter !== 'Todos' && a.stage !== stageFilter) return false
    if (stageFilter === 'Todos' && a.stage === 'Al día') return false
    return true
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Cobranza</h1>
        <p className="text-sm text-content-muted">Cartera vencida, gestiones y recuperación.</p>
      </div>

      {dashboardQuery.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Total vencido</p>
            <p className="money text-xl font-semibold text-danger">RD$ {money(dashboardQuery.data.total_vencido)}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Clientes vencidos</p>
            <p className="text-xl font-semibold text-content">{dashboardQuery.data.clientes_vencidos}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Promesas pendientes</p>
            <p className="text-xl font-semibold text-warning-text">{dashboardQuery.data.promesas_pendientes}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Recuperado este mes</p>
            <p className="money text-xl font-semibold text-success-text">RD$ {money(dashboardQuery.data.recuperado_periodo)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:max-w-sm sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input aria-label="Buscar cliente…" className="field-input pl-9" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select aria-label="Filtrar por etapa" className="field-input !w-auto" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          {STAGE_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {accountsQuery.isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {filtered.length === 0 && !accountsQuery.isLoading && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Nada en este filtro.</div>
      )}

      <div className="space-y-2">
        {filtered.map((a) => (
          <button key={a.loan_id} onClick={() => setActiveLoan(a)} className="glass-card flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-content">{a.client_name} <span className="text-content-muted">· #{a.loan_number}</span></p>
                <p className="text-xs text-content-muted">
                  {a.days_overdue > 0 ? `${a.days_overdue} días de atraso` : 'Sin atraso'}
                  {a.last_gestion_at && ` · Última gestión: ${GESTION_LABEL[a.last_gestion_type ?? ''] ?? a.last_gestion_type} (${shortDate(a.last_gestion_at.slice(0, 10))})`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={STAGE_BADGE[a.stage] ?? 'badge-neutral'}>{a.stage}</span>
              <p className="money text-sm font-semibold text-content">RD$ {money(a.total_pending)}</p>
            </div>
          </button>
        ))}
      </div>

      {activeLoan && <GestionModal account={activeLoan} onClose={() => setActiveLoan(null)} />}
    </div>
  )
}

function GestionModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const [type, setType] = useState('call')
  const [copied, setCopied] = useState(false)

  const templatesQuery = useQuery({
    queryKey: ['templates-for-gestion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('communication_templates').select('channel, body').eq('is_active', true)
      if (error) throw error
      return data as { channel: string; body: string }[]
    }
  })
  const template = templatesQuery.data?.find((t) => t.channel === type)
  const preview = template ? template.body
    .replace('{{nombre}}', account.client_name)
    .replace('{{numero_prestamo}}', String(account.loan_number))
    .replace('{{saldo}}', money(account.total_pending))
    .replace('{{dias_atraso}}', String(account.days_overdue))
    .replace('{{monto}}', money(account.total_pending))
    .replace('{{fecha}}', shortDate(new Date().toISOString().slice(0, 10))) : null
  const [notes, setNotes] = useState('')
  const [promiseDate, setPromiseDate] = useState('')
  const [promiseAmount, setPromiseAmount] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [writeOffReason, setWriteOffReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['collection_accounts'] })
    qc.invalidateQueries({ queryKey: ['collection_dashboard'] })
  }

  const saveGestion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('record_gestion', {
        p_loan_id: account.loan_id, p_gestion_type: type, p_notes: notes.trim() || null,
        p_promise_date: type === 'promise' ? promiseDate || null : null,
        p_promise_amount: type === 'promise' ? Number(promiseAmount || 0) || null : null,
        p_next_action_date: nextActionDate || null
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); onClose() },
    onError: (e: any) => setError(e.message ?? 'No se pudo registrar la gestión.')
  })

  const escalate = useMutation({
    mutationFn: async (override: string) => {
      const { error } = await supabase.rpc('set_collection_override', {
        p_loan_id: account.loan_id, p_override: override, p_reason: override === 'written_off' ? writeOffReason.trim() : null
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (e: any) => setError(e.message ?? 'No se pudo escalar.')
  })

  return (
    <Modal title={account.client_name} subtitle={`Préstamo #${account.loan_number} · RD$ ${money(account.total_pending)} pendiente`} onClose={onClose}>
      <div className="space-y-4">
        {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Link to={`/prestamos/${account.loan_id}`} className="text-xs text-primary hover:underline">Ver préstamo completo →</Link>

        <div className="border-t border-line pt-4">
          <p className="field-label">Nueva gestión</p>
          <select aria-label="Tipo de gestión" className="field-input mb-2" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(GESTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {preview && (
            <div className="mb-2 rounded-lg border border-line bg-background p-3">
              <p className="mb-1.5 text-xs text-content-muted">{preview}</p>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(preview); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Copy size={12} /> {copied ? 'Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          )}
          <textarea aria-label="Notas" className="field-input mb-2" rows={2} placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {type === 'promise' && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input aria-label="Fecha prometida" type="date" className="field-input" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
              <input aria-label="Monto prometido" type="number" className="field-input money" placeholder="Monto prometido" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} />
            </div>
          )}
          <div className="mb-2">
            <label className="field-label">Próxima gestión (opcional)</label>
            <input aria-label="Próxima gestión (opcional)" type="date" className="field-input" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
          </div>
          <button disabled={!isOnline || saveGestion.isPending} onClick={() => saveGestion.mutate()} className="btn-solid w-full">
            {saveGestion.isPending ? 'Guardando…' : 'Registrar gestión'}
          </button>
        </div>

        <div className="border-t border-line pt-4">
          <p className="field-label">Escalar</p>
          <div className="flex flex-wrap gap-1.5">
            <button disabled={!isOnline} onClick={() => escalate.mutate('intensive')} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-background">Cobranza intensiva</button>
            <button disabled={!isOnline} onClick={() => escalate.mutate('recovery')} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-background">Recuperación</button>
            <button disabled={!isOnline} onClick={() => escalate.mutate('legal')} className="rounded-full border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5">Legal (solo propietario)</button>
          </div>
          <div className="mt-2 flex gap-2">
            <input aria-label="Motivo para castigar" className="field-input" placeholder="Motivo para castigar" value={writeOffReason} onChange={(e) => setWriteOffReason(e.target.value)} />
            <button disabled={!isOnline || !writeOffReason.trim()} onClick={() => escalate.mutate('written_off')} className="shrink-0 rounded-lg border border-danger/30 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/5">Castigar</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
