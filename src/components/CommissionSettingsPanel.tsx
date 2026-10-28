import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Rule = { id: string; action_key: string; category: string; label: string; points: number; is_active: boolean }
type Level = { id: string; name: string; min_points: number; max_points: number | null; point_value: number; sort_order: number }
type Quality = { id: string; label: string; min_percent: number; max_percent: number | null; points: number; factor_percent: number; sort_order: number }
type Release = { id: string; installment_count: number; release_percent: number; sort_order: number }
type Settings = { business_id: string; commission_cap_percent: number; period_frequency: string }

const TABS = ['reglas', 'niveles', 'calidad', 'liberacion', 'limite'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  reglas: 'Reglas de puntos', niveles: 'Niveles', calidad: 'Calidad de cartera', liberacion: 'Liberación', limite: 'Límite'
}
const CATEGORY_LABEL: Record<string, string> = {
  captacion: 'Captación', pagos: 'Pagos', renovaciones: 'Renovaciones', recuperacion: 'Recuperación', penalizacion: 'Penalizaciones'
}

export function CommissionSettingsPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('reglas')

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${tab === t ? 'bg-primary-fill text-white' : 'border border-line text-content-muted'}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === 'reglas' && <RulesTab />}
        {tab === 'niveles' && <LevelsTab />}
        {tab === 'calidad' && <QualityTab />}
        {tab === 'liberacion' && <ReleaseTab />}
        {tab === 'limite' && <CapTab />}
      </div>
    </div>
  )
}

function RulesTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['point_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('point_rules').select('*').order('category')
      if (error) throw error
      return data as Rule[]
    }
  })
  const save = useMutation({
    mutationFn: async (row: Rule) => {
      const { error } = await supabase.from('point_rules').update({ points: row.points, is_active: row.is_active }).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['point_rules'] })
  })

  const grouped = new Map<string, Rule[]>()
  ;(data ?? []).forEach((r) => { const arr = grouped.get(r.category) ?? []; arr.push(r); grouped.set(r.category, arr) })

  return (
    <div className="space-y-5">
      {Array.from(grouped.entries()).map(([cat, rules]) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">{CATEGORY_LABEL[cat] ?? cat}</p>
          <div className="space-y-1.5">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <span className={`flex-1 text-sm ${r.is_active ? 'text-content' : 'text-content-muted line-through'}`}>{r.label}</span>
                <input
                  type="number" className="field-input !w-24 text-right"
                  aria-label={`Puntos de ${r.label}`} defaultValue={r.points}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== r.points) save.mutate({ ...r, points: v }) }}
                />
                <button onClick={() => save.mutate({ ...r, is_active: !r.is_active })}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.is_active ? 'bg-success/10 text-success-text' : 'bg-navy/5 text-content-muted'}`}>
                  {r.is_active ? 'Activa' : 'Inactiva'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LevelsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['commission_levels_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commission_levels').select('*').order('sort_order')
      if (error) throw error
      return data as Level[]
    }
  })
  const save = useMutation({
    mutationFn: async (row: Partial<Level> & { id: string }) => {
      const { error } = await supabase.from('commission_levels').update(row).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_levels_edit'] })
  })

  return (
    <div className="overflow-x-auto">
      <table className="table-modern min-w-[480px]">
        <thead><tr className="text-left text-xs text-content-muted">
          <th className="pb-2">Nivel</th><th className="pb-2">Desde</th><th className="pb-2">Hasta</th><th className="pb-2">RD$/punto</th>
        </tr></thead>
        <tbody>
          {data?.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <td className="py-2 pr-2 font-medium text-content">{l.name}</td>
              <td className="py-2 pr-2"><input type="number" className="field-input !w-20" aria-label={`Puntos mínimos de ${l.name}`} defaultValue={l.min_points}
                onBlur={(e) => save.mutate({ id: l.id, min_points: Number(e.target.value) })} /></td>
              <td className="py-2 pr-2"><input aria-label="sin tope" type="number" className="field-input !w-20" defaultValue={l.max_points ?? ''} placeholder="sin tope"
                onBlur={(e) => save.mutate({ id: l.id, max_points: e.target.value ? Number(e.target.value) : null })} /></td>
              <td className="py-2"><input type="number" className="field-input !w-24" aria-label={`Valor por punto de ${l.name}`} defaultValue={l.point_value}
                onBlur={(e) => save.mutate({ id: l.id, point_value: Number(e.target.value) })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QualityTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['quality_tiers_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('quality_tiers').select('*').order('sort_order')
      if (error) throw error
      return data as Quality[]
    }
  })
  const save = useMutation({
    mutationFn: async (row: Partial<Quality> & { id: string }) => {
      const { error } = await supabase.from('quality_tiers').update(row).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality_tiers_edit'] })
  })

  return (
    <div className="overflow-x-auto">
      <table className="table-modern min-w-[560px]">
        <thead><tr className="text-left text-xs text-content-muted">
          <th className="pb-2">Calidad</th><th className="pb-2">Morosidad desde %</th><th className="pb-2">hasta %</th>
          <th className="pb-2">Puntos</th><th className="pb-2">Factor %</th>
        </tr></thead>
        <tbody>
          {data?.map((q) => (
            <tr key={q.id} className="border-t border-line">
              <td className="py-2 pr-2 font-medium text-content">{q.label}</td>
              <td className="py-2 pr-2"><input type="number" className="field-input !w-20" aria-label={`Porcentaje mínimo de ${q.label}`} defaultValue={q.min_percent}
                onBlur={(e) => save.mutate({ id: q.id, min_percent: Number(e.target.value) })} /></td>
              <td className="py-2 pr-2"><input aria-label="sin tope" type="number" className="field-input !w-20" defaultValue={q.max_percent ?? ''} placeholder="sin tope"
                onBlur={(e) => save.mutate({ id: q.id, max_percent: e.target.value ? Number(e.target.value) : null })} /></td>
              <td className="py-2 pr-2"><input type="number" className="field-input !w-20" aria-label={`Puntos de ${q.label}`} defaultValue={q.points}
                onBlur={(e) => save.mutate({ id: q.id, points: Number(e.target.value) })} /></td>
              <td className="py-2"><input type="number" className="field-input !w-20" aria-label={`Factor de ${q.label}`} defaultValue={q.factor_percent}
                onBlur={(e) => save.mutate({ id: q.id, factor_percent: Number(e.target.value) })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReleaseTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['point_release_rules_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('point_release_rules').select('*').order('sort_order')
      if (error) throw error
      return data as Release[]
    }
  })
  const save = useMutation({
    mutationFn: async (row: Partial<Release> & { id: string }) => {
      const { error } = await supabase.from('point_release_rules').update(row).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['point_release_rules_edit'] })
  })
  const total = (data ?? []).reduce((s, r) => s + Number(r.release_percent), 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-content-muted">Qué porcentaje de los puntos pendientes del desembolso se libera al llegar a cada cantidad de cuotas pagadas.</p>
      {data?.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
          <span className="flex-1 text-sm text-content">Al pagar {r.installment_count} cuota{r.installment_count === 1 ? '' : 's'}</span>
          <input type="number" className="field-input !w-20 text-right" aria-label={`Porcentaje liberado al pagar ${r.installment_count} cuota(s)`} defaultValue={r.release_percent}
            onBlur={(e) => save.mutate({ id: r.id, release_percent: Number(e.target.value) })} />
          <span className="text-sm text-content-muted">%</span>
        </div>
      ))}
      <p className={`text-xs ${total === 100 ? 'text-content-muted' : 'text-danger'}`}>Suma total: {total}% {total !== 100 && '(debería sumar 100%)'}</p>
    </div>
  )
}

export function RiskSettingsPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['risk_factors_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('risk_factors').select('*').order('sort_order')
      if (error) throw error
      return data as { id: string; label: string; weight_percent: number; computable: boolean; is_active: boolean }[]
    }
  })
  const { data: levels } = useQuery({
    queryKey: ['risk_levels_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('risk_levels').select('*').order('sort_order')
      if (error) throw error
      return data as { id: string; label: string; min_score: number; max_score: number | null }[]
    }
  })
  const saveFactor = useMutation({
    mutationFn: async (row: { id: string; weight_percent: number }) => {
      const { error } = await supabase.from('risk_factors').update({ weight_percent: row.weight_percent }).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk_factors_edit'] })
  })
  const saveLevel = useMutation({
    mutationFn: async (row: { id: string; min_score?: number; max_score?: number | null }) => {
      const { error } = await supabase.from('risk_levels').update(row).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk_levels_edit'] })
  })
  const totalWeight = (data ?? []).reduce((s, f) => s + Number(f.weight_percent), 0)

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Peso de cada factor</p>
        <div className="space-y-1.5">
          {data?.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 text-sm text-content">{f.label}</span>
              {!f.computable && <span className="text-xs text-content-muted">(sin datos disponibles)</span>}
              <input type="number" className="field-input !w-20 text-right" aria-label={`Peso de ${f.label}`} defaultValue={f.weight_percent}
                onBlur={(e) => saveFactor.mutate({ id: f.id, weight_percent: Number(e.target.value) })} />
              <span className="text-sm text-content-muted">%</span>
            </div>
          ))}
        </div>
        <p className={`mt-1.5 text-xs ${totalWeight === 100 ? 'text-content-muted' : 'text-danger'}`}>Suma: {totalWeight}% {totalWeight !== 100 && '(debería sumar 100%)'}</p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Niveles de riesgo</p>
        <div className="space-y-1.5">
          {levels?.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 text-sm text-content">{l.label}</span>
              <input type="number" className="field-input !w-16" aria-label={`Puntaje mínimo de ${l.label}`} defaultValue={l.min_score}
                onBlur={(e) => saveLevel.mutate({ id: l.id, min_score: Number(e.target.value) })} />
              <span className="text-xs text-content-muted">a</span>
              <input aria-label="100" type="number" className="field-input !w-16" defaultValue={l.max_score ?? ''} placeholder="100"
                onBlur={(e) => saveLevel.mutate({ id: l.id, max_score: e.target.value ? Number(e.target.value) : null })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CapTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['commission_settings_edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commission_settings').select('*').maybeSingle()
      if (error) throw error
      return data as Settings | null
    }
  })
  const save = useMutation({
    mutationFn: async (row: Partial<Settings>) => {
      const { error } = await supabase.from('commission_settings').update(row).eq('business_id', data!.business_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_settings_edit'] })
  })

  if (!data) return null
  return (
    <div className="max-w-xs space-y-4">
      <div>
        <label className="field-label">Límite de comisión (% del margen)</label>
        <input aria-label="Límite de comisión (% del margen)" type="number" className="field-input" defaultValue={data.commission_cap_percent}
          onBlur={(e) => save.mutate({ commission_cap_percent: Number(e.target.value) })} />
      </div>
      <div>
        <label className="field-label">Frecuencia del período</label>
        <select aria-label="Frecuencia del período" className="field-input" defaultValue={data.period_frequency}
          onChange={(e) => save.mutate({ period_frequency: e.target.value })}>
          <option value="weekly">Semanal</option>
          <option value="biweekly">Quincenal</option>
          <option value="monthly">Mensual</option>
        </select>
      </div>
    </div>
  )
}
