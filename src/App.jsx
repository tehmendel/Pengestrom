import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import MfaVerify from './pages/MfaVerify'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Vendors from './pages/Vendors'
import Import from './pages/Import'
import Settings from './pages/Settings'
import Wealth from './pages/Wealth'
import Investments from './pages/Investments'
import Pension from './pages/Pension'
import Loans from './pages/Loans'
import RecurringExpenses from './pages/RecurringExpenses'
import Tax from './pages/Tax'

function needsMfaChallenge(mfaLevel) {
  return Boolean(mfaLevel.current && mfaLevel.next && mfaLevel.current !== mfaLevel.next)
}

function Protected({ children }) {
  const { session, household, mfaLevel, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page-loading">Laster…</div>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (needsMfaChallenge(mfaLevel)) return <Navigate to="/mfa-verifiser" state={{ from: location }} replace />
  if (!household) return <Navigate to="/onboarding" replace />
  return children
}

function AppRoutes() {
  const { session, household, mfaLevel, loading } = useAuth()
  const location = useLocation()
  // Direkte navigering til en undersside mens man er utlogget skal ta deg
  // dit etter innlogging (og eventuell tofaktor-verifisering) — ikke bare
  // dumpe deg på Oversikt og miste hvor du egentlig var på vei.
  const from = location.state?.from?.pathname || '/'

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to={from} replace /> : <Login />} />
      <Route path="/tilbakestill-passord" element={session ? <ResetPassword /> : <Navigate to="/login" replace />} />
      <Route
        path="/mfa-verifiser"
        element={
          loading ? (
            <div className="page-loading">Laster…</div>
          ) : !session ? (
            <Navigate to="/login" replace />
          ) : needsMfaChallenge(mfaLevel) ? (
            <MfaVerify />
          ) : (
            <Navigate to={from} replace />
          )
        }
      />
      <Route
        path="/onboarding"
        element={
          loading ? (
            <div className="page-loading">Laster…</div>
          ) : !session ? (
            <Navigate to="/login" replace />
          ) : needsMfaChallenge(mfaLevel) ? (
            <Navigate to="/mfa-verifiser" replace />
          ) : household ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding />
          )
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="kontoer" element={<Accounts />} />
        <Route path="transaksjoner" element={<Transactions />} />
        <Route path="kategorier" element={<Categories />} />
        <Route path="leverandorer" element={<Vendors />} />
        <Route path="importer" element={<Import />} />
        <Route path="formue" element={<Wealth />} />
        <Route path="investeringer" element={<Investments />} />
        <Route path="pensjon" element={<Pension />} />
        <Route path="lan" element={<Loans />} />
        <Route path="faste-utgifter" element={<RecurringExpenses />} />
        <Route path="skatt" element={<Tax />} />
        <Route path="innstillinger" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
