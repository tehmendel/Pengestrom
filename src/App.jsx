import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Import from './pages/Import'
import Settings from './pages/Settings'

function Protected({ children }) {
  const { session, household, loading } = useAuth()
  if (loading) return <div className="page-loading">Laster…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!household) return <Navigate to="/onboarding" replace />
  return children
}

function AppRoutes() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/onboarding"
        element={
          loading ? (
            <div className="page-loading">Laster…</div>
          ) : session ? (
            <Onboarding />
          ) : (
            <Navigate to="/login" replace />
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
        <Route path="importer" element={<Import />} />
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
