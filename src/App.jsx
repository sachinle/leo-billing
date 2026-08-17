import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './hooks/useAuth';
import PullToRefresh from './components/PullToRefresh';
import { useBackButton } from './hooks/useBackButton';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// ── Lazy-loaded pages — only downloaded when first visited ──────────────────
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Customers      = lazy(() => import('./pages/Customers'));
const Products       = lazy(() => import('./pages/Products'));
const Invoices       = lazy(() => import('./pages/Invoices'));
const CreateInvoice  = lazy(() => import('./pages/CreateInvoice'));
const EditInvoice    = lazy(() => import('./pages/EditInvoice'));
const ThermalPrint   = lazy(() => import('./pages/ThermalPrint'));
const ViewInvoice    = lazy(() => import('./pages/ViewInvoice'));
const Profile        = lazy(() => import('./pages/Profile'));
const Settings       = lazy(() => import('./pages/Settings'));
const PrinterSettings = lazy(() => import('./pages/PrinterSettings'));
const AnalyticsPage  = lazy(() => import('./pages/Analytics'));
const WebsitePage    = lazy(() => import('./pages/Website'));

// ── Shared loading spinner ───────────────────────────────────────────────────
function Spinner() {
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

function AppRoutes() {
  const { user, loading } = useAuth();
  useBackButton();

  if (loading) return <Spinner />;

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Public — redirect to dashboard if already logged in */}
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />

        {/* Protected — all share Layout (Sidebar + Outlet) */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index                          element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"               element={<Dashboard />} />
          <Route path="customers"               element={<Customers />} />
          <Route path="products"                element={<Products />} />
          <Route path="invoices"                element={<Invoices />} />
          <Route path="create-invoice"          element={<CreateInvoice />} />
          <Route path="invoices/view/:id/print" element={<ThermalPrint />} />
          <Route path="invoices/view/:id"       element={<ViewInvoice />} />
          <Route path="invoices/edit/:id"       element={<EditInvoice />} />
          <Route path="website"                 element={<WebsitePage />} />
          <Route path="analytics"               element={<AnalyticsPage />} />
          <Route path="profile"                 element={<Profile />} />
          <Route path="settings"                element={<Settings />} />
          <Route path="printer"                 element={<PrinterSettings />} />
          <Route path="*"                       element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PullToRefresh>
          <AppRoutes />
          <Analytics />
          <SpeedInsights />
        </PullToRefresh>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;