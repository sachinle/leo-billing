import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Dashboard from '../pages/Dashboard';
import Customers from '../pages/Customers';
import Products from '../pages/Products';
import Invoices from '../pages/Invoices';
import CreateInvoice from '../pages/CreateInvoice';
import EditInvoice from '../pages/EditInvoice';
import ViewInvoice from '../pages/ViewInvoice';
import ThermalPrint from '../pages/ThermalPrint';
import PrinterSettings from '../pages/PrinterSettings';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import Analytics from '../pages/Analytics';
import Website from '../pages/Website';
import { useAuth } from '../hooks/useAuth';
import { canManageWebsite } from '../services/permissions';
import './Layout.css';

export default function Layout() {
  const { user } = useAuth();
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [isMobile, setIsMobile]       = useState(window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close sidebar on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sidebarWidth = isMobile ? 0 : (collapsed ? 64 : 220);

  return (
    <div className="layout">
      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div className="layout__overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* ── Main Content ── */}
      <div
        className="layout__main"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* ── Mobile Topbar ── */}
        {isMobile && (
          <div className="layout__topbar">
            <button
              className="layout__hamburger"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Open menu"
            >
              <span /><span /><span />
            </button>
            <div className="layout__topbar-logo">
              Leo Billing<span className="layout__topbar-dot">.</span>
            </div>
            <div style={{ width: 40 }} />
          </div>
        )}

        {/* ── Page Routes ── */}
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/create" element={<CreateInvoice />} />
          <Route path="/invoices/edit/:id" element={<EditInvoice />} />
          <Route path="/invoices/view/:id" element={<ViewInvoice />} />
          <Route path="/invoices/view/:id/print" element={<ThermalPrint />} />
          <Route
            path="/website"
            element={canManageWebsite(user) ? <Website /> : <Navigate to="/dashboard" replace />}
          />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/printer" element={<PrinterSettings />} />
          <Route path="/profile" element={<Profile />} />
          {/* legacy compat */}
          <Route path="/create-invoice" element={<CreateInvoice />} />
        </Routes>
      </div>
    </div>
  );
}