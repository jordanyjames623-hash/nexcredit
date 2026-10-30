import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequirePaid } from '@/components/RequirePaid'
import { lazyPage } from '@/lib/lazyPage'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { Settings } from '@/pages/Settings'
import { Layout } from './Layout'
import { Home } from './Home'
import { Loans } from './Loans'
import { Clients } from './Clients'
import { Payments } from './Payments'
import { RegisterPayment } from './RegisterPayment'
import { Calculator } from './Calculator'
import { NewLoanSimple } from './NewLoanSimple'
import { NewClient } from './NewClient'
import { More } from './More'
import { Contracts } from './Contracts'

// Las pantallas de la maqueta (tema oscuro) + entrar/registro. Las funciones actuales que
// no estan en la maqueta viven en Mas y se reutilizan tal cual de la app anterior (mismo
// componente, mismo RequirePaid); tambien se mantienen /clientes/:id y /prestamos/:id para
// que los enlaces internos de esas pantallas sigan funcionando.
const ClientDetail = lazyPage(() => import('@/pages/ClientDetail').then((m) => ({ default: m.ClientDetail })))
const LoanDetail = lazyPage(() => import('@/pages/LoanDetail').then((m) => ({ default: m.LoanDetail })))
const CashRegister = lazyPage(() => import('@/pages/CashRegister').then((m) => ({ default: m.CashRegister })))
const Commissions = lazyPage(() => import('@/pages/Commissions').then((m) => ({ default: m.Commissions })))
const Renewals = lazyPage(() => import('@/pages/Renewals').then((m) => ({ default: m.Renewals })))
const Collections = lazyPage(() => import('@/pages/Collections').then((m) => ({ default: m.Collections })))
const RoutesPage = lazyPage(() => import('@/pages/Routes').then((m) => ({ default: m.RoutesPage })))
const RouteDetail = lazyPage(() => import('@/pages/RouteDetail').then((m) => ({ default: m.RouteDetail })))
const Expenses = lazyPage(() => import('@/pages/Expenses').then((m) => ({ default: m.Expenses })))
const CollectionCalendar = lazyPage(() => import('@/pages/CollectionCalendar').then((m) => ({ default: m.CollectionCalendar })))
const Reports = lazyPage(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const Collaborators = lazyPage(() => import('@/pages/Collaborators').then((m) => ({ default: m.Collaborators })))
const CollaboratorDetail = lazyPage(() => import('@/pages/CollaboratorDetail').then((m) => ({ default: m.CollaboratorDetail })))
const Intelligence = lazyPage(() => import('@/pages/Intelligence').then((m) => ({ default: m.Intelligence })))
const CollateralAdmin = lazyPage(() => import('@/pages/Collateral').then((m) => ({ default: m.CollateralAdmin })))
const Applications = lazyPage(() => import('@/pages/Applications').then((m) => ({ default: m.Applications })))
const ActivityLog = lazyPage(() => import('@/pages/ActivityLog').then((m) => ({ default: m.ActivityLog })))
// Panel SaaS (restaurado 2026-10-25): en el rediseño quedó fuera de las rutas y /superadmin
// caía al inicio. El componente se protege solo con profile.is_platform_admin.
const SuperAdmin = lazyPage(() => import('@/pages/SuperAdmin').then((m) => ({ default: m.SuperAdmin })))
export default function NuevoApp() {
  return (
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route path="/registrar" element={<Signup />} />
      <Route path="/recuperar" element={<ForgotPassword />} />
      <Route path="/restablecer" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/prestamos" element={<Loans />} />
          <Route path="/prestamos/nuevo" element={<NewLoanSimple />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/clientes/nuevo" element={<NewClient />} />
          <Route path="/pagos" element={<Payments />} />
          <Route path="/registrar-pago/:loanId" element={<RegisterPayment />} />
          <Route path="/calculadora" element={<Calculator />} />
          <Route path="/configuracion" element={<Settings />} />
          <Route path="/mas" element={<More />} />
          <Route path="/contratos" element={<Contracts />} />
          <Route path="/clientes/:id" element={<ClientDetail />} />
          <Route path="/prestamos/:id" element={<LoanDetail />} />
          <Route path="/caja" element={<CashRegister />} />
          <Route path="/comisiones" element={<RequirePaid feature="comisiones"><Commissions /></RequirePaid>} />
          <Route path="/renovaciones" element={<RequirePaid feature="renovaciones"><Renewals /></RequirePaid>} />
          <Route path="/cobranza" element={<RequirePaid feature="cobranza"><Collections /></RequirePaid>} />
          <Route path="/rutas" element={<RequirePaid feature="rutas"><RoutesPage /></RequirePaid>} />
          <Route path="/rutas/:id" element={<RequirePaid feature="rutas"><RouteDetail /></RequirePaid>} />
          <Route path="/gastos" element={<RequirePaid feature="gastos"><Expenses /></RequirePaid>} />
          <Route path="/calendario" element={<RequirePaid feature="calendario"><CollectionCalendar /></RequirePaid>} />
          <Route path="/reportes" element={<Reports />} />
          <Route path="/colaboradores" element={<RequirePaid feature="colaboradores"><Collaborators /></RequirePaid>} />
          <Route path="/colaboradores/:id" element={<RequirePaid feature="colaboradores"><CollaboratorDetail /></RequirePaid>} />
          <Route path="/inteligencia" element={<RequirePaid feature="inteligencia"><Intelligence /></RequirePaid>} />
          <Route path="/garantias" element={<RequirePaid feature="garantias"><CollateralAdmin /></RequirePaid>} />
          <Route path="/solicitudes" element={<RequirePaid feature="solicitudes"><Applications /></RequirePaid>} />
          <Route path="/actividad" element={<RequirePaid feature="actividad"><ActivityLog /></RequirePaid>} />
          <Route path="/superadmin" element={<SuperAdmin />} />
          <Route path="/recordatorios" element={<Navigate to="/calendario" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
