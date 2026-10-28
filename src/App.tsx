import { lazyPage } from '@/lib/lazyPage'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { RequirePaid } from '@/components/RequirePaid'

// Las pantallas se descargan cuando se abren (la gráfica, los reportes, etc. no pesan al iniciar sesión).
const Dashboard = lazyPage(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Clients = lazyPage(() => import('@/pages/Clients').then((m) => ({ default: m.Clients })))
const ClientDetail = lazyPage(() => import('@/pages/ClientDetail').then((m) => ({ default: m.ClientDetail })))
const Loans = lazyPage(() => import('@/pages/Loans').then((m) => ({ default: m.Loans })))
const NewLoan = lazyPage(() => import('@/pages/NewLoan').then((m) => ({ default: m.NewLoan })))
const LoanDetail = lazyPage(() => import('@/pages/LoanDetail').then((m) => ({ default: m.LoanDetail })))
const Payments = lazyPage(() => import('@/pages/Payments').then((m) => ({ default: m.Payments })))
const CashRegister = lazyPage(() => import('@/pages/CashRegister').then((m) => ({ default: m.CashRegister })))
const Commissions = lazyPage(() => import('@/pages/Commissions').then((m) => ({ default: m.Commissions })))
const Renewals = lazyPage(() => import('@/pages/Renewals').then((m) => ({ default: m.Renewals })))
const Collections = lazyPage(() => import('@/pages/Collections').then((m) => ({ default: m.Collections })))
const CollaboratorDetail = lazyPage(() => import('@/pages/CollaboratorDetail').then((m) => ({ default: m.CollaboratorDetail })))
const Intelligence = lazyPage(() => import('@/pages/Intelligence').then((m) => ({ default: m.Intelligence })))
const CollateralAdmin = lazyPage(() => import('@/pages/Collateral').then((m) => ({ default: m.CollateralAdmin })))
const Quote = lazyPage(() => import('@/pages/Quote').then((m) => ({ default: m.Quote })))
const SuperAdmin = lazyPage(() => import('@/pages/SuperAdmin').then((m) => ({ default: m.SuperAdmin })))
const Expenses = lazyPage(() => import('@/pages/Expenses').then((m) => ({ default: m.Expenses })))
const RoutesPage = lazyPage(() => import('@/pages/Routes').then((m) => ({ default: m.RoutesPage })))
const RouteDetail = lazyPage(() => import('@/pages/RouteDetail').then((m) => ({ default: m.RouteDetail })))
const Collaborators = lazyPage(() => import('@/pages/Collaborators').then((m) => ({ default: m.Collaborators })))
const CollectionCalendar = lazyPage(() => import('@/pages/CollectionCalendar').then((m) => ({ default: m.CollectionCalendar })))
const Reports = lazyPage(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const ActivityLog = lazyPage(() => import('@/pages/ActivityLog').then((m) => ({ default: m.ActivityLog })))
const Settings = lazyPage(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))
const Applications = lazyPage(() => import('@/pages/Applications').then((m) => ({ default: m.Applications })))

// Portal del cliente: actor distinto (no es staff), rutas públicas propias, fuera de ProtectedRoute.
const PortalLogin = lazyPage(() => import('@/portal/PortalLogin').then((m) => ({ default: m.PortalLogin })))
const PortalSummary = lazyPage(() => import('@/portal/PortalSummary').then((m) => ({ default: m.PortalSummary })))
const PortalLoanDetail = lazyPage(() => import('@/portal/PortalLoanDetail').then((m) => ({ default: m.PortalLoanDetail })))

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route path="/registrar" element={<Signup />} />
      <Route path="/recuperar" element={<ForgotPassword />} />
      <Route path="/restablecer" element={<ResetPassword />} />
      <Route path="/portal/entrar" element={<PortalLogin />} />
      <Route path="/portal" element={<PortalSummary />} />
      <Route path="/portal/prestamos/:id" element={<PortalLoanDetail />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/clientes/:id" element={<ClientDetail />} />
          <Route path="/prestamos" element={<Loans />} />
          <Route path="/prestamos/nuevo" element={<NewLoan />} />
          <Route path="/prestamos/:id" element={<LoanDetail />} />
          <Route path="/pagos" element={<Payments />} />
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
          <Route path="/calculadora" element={<Quote />} />
          <Route path="/solicitudes" element={<RequirePaid feature="solicitudes"><Applications /></RequirePaid>} />
          <Route path="/superadmin" element={<SuperAdmin />} />
          <Route path="/actividad" element={<RequirePaid feature="actividad"><ActivityLog /></RequirePaid>} />
          <Route path="/configuracion" element={<Settings />} />
        </Route>
      </Route>
    </Routes>
  )
}
