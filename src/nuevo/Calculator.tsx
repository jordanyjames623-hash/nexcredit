import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { money0, FREQ_LABEL, FREQ_NOUN } from './lib'
import { GreetingHeader } from './GreetingHeader'

// Calculadora con el aspecto exacto de la maqueta (foto 2026-10-25): dos tarjetas azules,
// barra deslizante para el monto, y el desglose con líneas divisorias en rallitas.
// Modelo simple de la maqueta: interes = P x tasa x meses; cuotas = meses x
// (semanal 4, quincenal 2, mensual 1); cuota = total / cuotas. La nota debajo aclara que el
// prestamo creado usa las reglas del motor de la app y puede diferir del simulador.
// Las tarjetas son azules fijas en ambos temas (como la foto); solo título, subtítulo y
// nota usan var(--nc-*).
const FACTOR: Record<string, number> = { weekly: 4, biweekly: 2, monthly: 1 }
const FREQ_OPTIONS = [
  { v: 'weekly', l: 'Semanal' }, { v: 'biweekly', l: 'Quincenal' }, { v: 'monthly', l: 'Mensual' }
]
const TASAS = [3, 5, 8, 10, 12, 15, 18, 20, 25, 30]
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const SLIDER_MIN = 1000
const SLIDER_MAX = 100000
const SLIDER_STEP = 500

export function Calculator() {
  const [monto, setMonto] = useState(25000)
  const [tasa, setTasa] = useState(10)
  const [meses, setMeses] = useState(3)
  const [frecuencia, setFrecuencia] = useState('weekly')

  const calc = useMemo(() => {
    const interes = (monto * tasa * meses) / 100
    const total = monto + interes
    const cuotas = meses * (FACTOR[frecuencia] ?? 1)
    const cuota = cuotas > 0 ? total / cuotas : 0
    const cuotaMensual = meses > 0 ? total / meses : 0
    return { interes, total, cuotas, cuota, cuotaMensual }
  }, [monto, tasa, meses, frecuencia])

  const noun = FREQ_NOUN[frecuencia] ?? 'mensual'
  const label = FREQ_LABEL[frecuencia] ?? 'Mensual'
  const plural = `${noun}es`
  const pct = Math.min(100, Math.max(0, ((monto - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100))
  const darkField = 'w-full rounded-xl bg-black/20 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-white/50'

  return (
    <div className="space-y-4">
      <GreetingHeader />

      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Calculadora de préstamos</h1>
        <p className="text-sm text-[var(--nc-muted)]">Mueve el monto y la cuota se calcula sola, al instante.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tarjeta izquierda: controles */}
        <div className="space-y-4 rounded-[22px] bg-gradient-to-b from-[#1E40AF] to-[#2563EB] p-5">
          <p className="text-base font-bold text-white">¿Cuánto va a prestar? — RD$ {money0(monto)}</p>

          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, monto))}
            onChange={(e) => setMonto(Number(e.target.value))}
            aria-label="Monto a prestar"
            className="nc-slider w-full"
            style={{ background: `linear-gradient(90deg, #7DD3FC ${pct}%, rgba(255,255,255,0.25) ${pct}%)` }}
          />

          <input
            value={monto}
            onChange={(e) => setMonto(Number(e.target.value) || 0)}
            inputMode="numeric"
            type="number"
            min={0}
            aria-label="Monto exacto"
            className={darkField}
          />

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white" htmlFor="calc-tasa">Interés mensual</label>
            <div className="relative">
              <select id="calc-tasa" value={tasa} onChange={(e) => setTasa(Number(e.target.value))} className={`${darkField} appearance-none pr-9`}>
                {TASAS.map((t) => <option key={t} value={t} className="text-black">{t}% mensual</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white" htmlFor="calc-plazo">Plazo</label>
            <div className="relative">
              <select id="calc-plazo" value={meses} onChange={(e) => setMeses(Number(e.target.value))} className={`${darkField} appearance-none pr-9`}>
                {MESES.map((m) => (
                  <option key={m} value={m} className="text-black">
                    {m} {m === 1 ? 'mes' : 'meses'} · {m * (FACTOR[frecuencia] ?? 1)} cuotas {plural}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">Frecuencia</p>
            <div className="flex gap-1.5">
              {FREQ_OPTIONS.map((o) => (
                <button key={o.v} onClick={() => setFrecuencia(o.v)}
                  className={`flex-1 rounded-full py-2 text-xs font-semibold ${frecuencia === o.v ? 'bg-white text-[#1E3A8A]' : 'bg-white/15 text-white'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tarjeta derecha: desglose con líneas en rallitas, exacto a la maqueta:
           degradado 150deg #172554→#2563eb, radio 18px, cifra grande en Sora 800 y filas
           con border-bottom 1px dashed blanco al 25% (la última sin borde). */}
        <div className="space-y-4 rounded-[18px] bg-[linear-gradient(150deg,#172554,#2563eb)] p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Cuota {noun}</p>
            <p className="font-disp mt-1 text-4xl font-extrabold text-white">RD$ {money0(calc.cuota)}</p>
          </div>

          <div className="space-y-[9px] text-sm text-white">
            <p className="flex justify-between border-b border-dashed border-white/25 pb-2"><span>Monto prestado</span><span className="font-disp font-bold">RD$ {money0(monto)}</span></p>
            <p className="flex justify-between border-b border-dashed border-white/25 pb-2"><span>Interés total</span><span className="font-disp font-bold">RD$ {money0(calc.interes)}</span></p>
            <p className="flex justify-between border-b border-dashed border-white/25 pb-2"><span>Total a pagar</span><span className="font-disp font-bold">RD$ {money0(calc.total)}</span></p>
            <p className="flex justify-between"><span>Cuota mensual</span><span className="font-disp font-bold">RD$ {money0(calc.cuotaMensual)}</span></p>
          </div>

          <Link
            to={`/prestamos/nuevo?monto=${monto}&tasa=${tasa}&cuotas=${calc.cuotas}&frecuencia=${frecuencia}`}
            className="block rounded-xl bg-[#FEF3C7] py-3 text-center text-sm font-bold text-[#172554]"
          >
            Crear préstamo con estos números
          </Link>
        </div>
      </div>

      <p className="text-xs text-[var(--nc-faint)]">
        Nota: el préstamo creado usa las reglas del motor de la app ({label.toLowerCase()}), por lo que la cuota final puede diferir de este simulador simple.
      </p>
    </div>
  )
}
