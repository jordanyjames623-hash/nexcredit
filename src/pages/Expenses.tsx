import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { money, shortDate } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'

type Expense = { id: string; concept: string; category: string; amount: number; expense_date: string }

const CATEGORIES: Record<string, string> = {
  fuel: 'Combustible', transport: 'Transporte', payroll: 'Nómina', office: 'Oficina',
  commissions: 'Comisiones', services: 'Servicios', other: 'Otro'
}
// Colores de categoría: paleta de gráficas (tokens), sin colores fijos.
const CATEGORY_COLORS: Record<string, string> = {
  fuel: 'rgb(var(--chart-1))', transport: 'rgb(var(--chart-2))', payroll: 'rgb(var(--chart-3))', office: 'rgb(var(--chart-4))',
  commissions: 'rgb(var(--chart-5))', services: 'rgb(var(--c-primary-dark))', other: 'rgb(var(--c-text-muted))'
}

export function Expenses() {
  const qc = useQueryClient()
  const toast = useToast()
  const isOnline = useOnlineStatus()
  const { isOwner, hasPermission } = useAuth()
  const seesAll = isOwner || hasPermission('expenses.view_all')
  const [showForm, setShowForm] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', expenseId)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Gasto eliminado'); qc.invalidateQueries({ queryKey: ['expenses'] }) },
    onError: () => toast.error('No se pudo eliminar el gasto.')
  })

  function handleDelete(e: Expense) {
    if (window.confirm(`¿Eliminar el gasto "${e.concept}"?`)) deleteMutation.mutate(e.id)
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, concept, category, amount, expense_date')
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as Expense[]
    }
  })

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    ;(data ?? []).forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const total = (data ?? []).reduce((sum, e) => sum + Number(e.amount), 0)
  const filtered = (data ?? []).filter((e) => categoryFilter === 'all' || e.category === categoryFilter)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Gastos</h1>
          <p className="text-sm text-content-muted">
            {seesAll ? 'Controla tus gastos operativos.' : 'Viendo solo los gastos que tú registraste o que te compartieron.'}
          </p>
        </div>
        <button className="btn-solid" disabled={!isOnline} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Nuevo gasto'}
        </button>
      </div>

      {showForm && (
        <NewExpenseForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['expenses'] }) }} />
      )}

      {byCategory.length > 0 && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content">Por categoría</h2>
            <p className="money text-sm font-semibold text-danger">RD$ {money(total)}</p>
          </div>
          <div className="space-y-3">
            {byCategory.map(([cat, amt]) => {
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-content/80">{CATEGORIES[cat] ?? cat}</span>
                    <span className="money text-content-muted">RD$ {money(amt)} · {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] ?? 'rgb(var(--c-text-muted))' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setCategoryFilter('all')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === 'all' ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>Todos</button>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <button key={k} onClick={() => setCategoryFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === k ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>{v}</button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar la lista de gastos.</p>}
      {!isLoading && filtered.length === 0 && <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Sin gastos en este filtro.</div>}

      <div className="glass-card divide-y divide-line">
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-medium text-content">{e.concept}</p>
              <p className="text-xs text-content-muted">{CATEGORIES[e.category] ?? e.category} · {shortDate(e.expense_date)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="money text-sm font-semibold money-due">RD$ {money(e.amount)}</p>
              {isOwner && (
                <button onClick={() => handleDelete(e)} disabled={deleteMutation.isPending} className="rounded p-1.5 text-danger/70 hover:bg-danger/10 hover:text-danger" aria-label="Eliminar gasto">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NewExpenseForm({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [concept, setConcept] = useState('')
  const [category, setCategory] = useState('other')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').insert({
        concept: concept.trim(), category, amount: Number(amount), expense_date: expenseDate
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Gasto registrado'); onDone() },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar el gasto.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!concept.trim() || !amount) { setError('Completa el concepto y el monto.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 glass-card p-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="field-label" htmlFor="concept">Concepto</label>
          <input id="concept" required className="field-input" value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="category">Categoría</label>
          <select id="category" className="field-input w-full min-w-0" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="amount">Monto (RD$)</label>
          <input id="amount" required type="number" min="0.01" step="0.01" className="field-input money w-full min-w-0"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1 min-w-0">
          <label className="field-label" htmlFor="date">Fecha</label>
          <input id="date" required type="date" className="field-input w-full min-w-0" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-solid">
        {mutation.isPending ? 'Guardando…' : 'Guardar gasto'}
      </button>
    </form>
  )
}
