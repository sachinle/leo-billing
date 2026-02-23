import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './hooks/useAuth';
import PullToRefresh from './components/PullToRefresh';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Invoices from './pages/Invoices';
import CreateInvoice from './pages/CreateInvoice';
import EditInvoice from './pages/EditInvoice';
import ViewInvoice from './pages/ViewInvoice';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

function AppRoutes() {
  const { user, loading } = useAuth();

  // Show spinner while Firebase resolves auth state on startup.
  // This prevents the login flash and the immediate redirect-back-to-login bug.
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0a0a0f',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="#c9a96e" strokeWidth="1.5"
          style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/>
          <path d="M21 12a9 9 0 0 0-9-9"/>
        </svg>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public — redirect to dashboard if already logged in */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Protected — all share Layout (Sidebar + Outlet) */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index                     element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"          element={<Dashboard />} />
        <Route path="customers"          element={<Customers />} />
        <Route path="products"           element={<Products />} />
        <Route path="invoices"           element={<Invoices />} />
        <Route path="create-invoice"     element={<CreateInvoice />} />
        <Route path="invoices/view/:id"  element={<ViewInvoice />} />
        <Route path="invoices/edit/:id"  element={<EditInvoice />} />
        <Route path="profile"            element={<Profile />} />
        <Route path="settings"           element={<Settings />} />
        <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PullToRefresh>
          <AppRoutes />
        </PullToRefresh>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;