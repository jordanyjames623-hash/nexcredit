import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Product = {
  id: string; name: string; loan_type: string; interest_rate: number; frequency: string
  term_installments: number | null; is_active: boolean
}
const FREQ_LABEL: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

export function LoanProductsPanel() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data } = useQuery({
    queryKey: ['loan_products_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_products').select('id, name, loan_type, interest_rate, frequency, term_installments, is_active').order('name')
      if (error) throw error
      return data as Product[]
    }
  })

  const toggleActive = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from('loan_products').update({ is_active: !p.is_active }).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loan_products_admin'] })
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-content-muted">Plantillas que prellenan el formulario de nuevo préstamo.</p>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs font-medium text-primary hover:underline">
          {showForm ? 'Cancelar' : '+ Nuevo producto'}
        </button>
      </div>
      {showForm && <div className="mt-3"><NewProductForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['loan_products_admin'] }) }} /></div>}
      {(data?.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-content-muted">Sin productos creados — los préstamos se seguirán configurando manualmente.</p>}
      <ul className="mt-2 divide-y divide-line">
        {data?.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-3">
            <div>
              <p className={`text-sm font-medium ${p.is_active ? 'text-content' : 'text-content-muted line-through'}`}>{p.name}</p>
              <p className="text-xs text-content-muted">
                {p.interest_rate}% · {FREQ_LABEL[p.frequency] ?? p.frequency}{p.term_installments ? ` · ${p.term_installments} cuotas` : ''}
              </p>
            </div>
            <button onClick={() => toggleActive.mutate(p)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.is_active ? 'bg-success/10 text-success-text' : 'bg-navy/5 text-content-muted'}`}>
              {p.is_active ? 'Activo' : 'Inactivo'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NewProductForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [loanType, setLoanType] = useState<'capital_interest' | 'interest_only'>('capital_interest')
  const [interestRate, setInterestRate] = useState('')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly')
  const [termInstallments, setTermInstallments] = useState('12')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loan_products').insert({
        name: name.trim(), loan_type: loanType, interest_rate: Number(interestRate), frequency,
        term_installments: loanType === 'capital_interest' ? Number(termInstallments) : null
      })
      if (error) throw error
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e.message ?? 'No se pudo crear el producto.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !interestRate) { setError('Completa el nombre y la tasa.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-b border-line px-5 py-4">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label">Nombre</label>
          <input aria-label="Nombre" className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Préstamo personal" />
        </div>
        <div>
          <label className="field-label">Tipo</label>
          <select aria-label="Tipo" className="field-input" value={loanType} onChange={(e) => setLoanType(e.target.value as any)}>
            <option value="capital_interest">Capital + interés</option>
            <option value="interest_only">Solo intereses</option>
          </select>
        </div>
        <div>
          <label className="field-label">Tasa %</label>
          <input aria-label="Tasa %" type="number" className="field-input" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Frecuencia</label>
          <select aria-label="Frecuencia" className="field-input" value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
            <option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="monthly">Mensual</option>
          </select>
        </div>
        {loanType === 'capital_interest' && (
          <div>
            <label className="field-label">Plazo (cuotas)</label>
            <input aria-label="Plazo (cuotas)" type="number" className="field-input" value={termInstallments} onChange={(e) => setTermInstallments(e.target.value)} />
          </div>
        )}
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-solid">{mutation.isPending ? 'Guardando…' : 'Guardar producto'}</button>
    </form>
  )
}
