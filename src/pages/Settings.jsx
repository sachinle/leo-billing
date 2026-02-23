import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { getInvoices } from '../services/invoiceService';
import { getCustomers } from '../services/customerService';
import { getProducts } from '../services/productService';
import './Settings.css';

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isDark = theme === 'dark';

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch { addToast('Logout failed', 'error'); }
  };

  // ── Enterprise: Export all data as CSV ──────────────────────────────────
  const handleExportData = async () => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const [invoices, customers, products] = await Promise.all([
        getInvoices(user.uid),
        getCustomers(user.uid),
        getProducts(user.uid),
      ]);

      // Build CSV for invoices
      const invHeaders = ['Invoice No', 'Date', 'Customer', 'Phone', 'Amount', 'Status', 'Due'];
      const invRows = invoices.map(inv => [
        inv.invoice_no, inv.date, inv.customer_name, inv.customer_phone,
        inv.final_amount, inv.payment_status, inv.amount_due
      ]);

      // Build CSV for customers
      const custHeaders = ['Name', 'Phone', 'Email', 'Total Purchase', 'Joined'];
      const custRows = customers.map(c => [c.name, c.phone, c.email || '', c.total_purchase || 0, c.created_at?.split('T')[0]]);

      // Build CSV for products
      const prodHeaders = ['Name', 'Price', 'Unit', 'Stock', 'Category'];
      const prodRows = products.map(p => [p.name, p.price, p.unit || '', p.stock || 0, p.category || '']);

      const toCSV = (headers, rows) => [
        headers.join(','),
        ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Combine into one file with sections
      const content = [
        '=== INVOICES ===', toCSV(invHeaders, invRows),
        '', '=== CUSTOMERS ===', toCSV(custHeaders, custRows),
        '', '=== PRODUCTS ===',  toCSV(prodHeaders, prodRows),
      ].join('\n');

      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `billing-export-${new Date().toLocaleDateString('en-CA')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Exported ${invoices.length} invoices, ${customers.length} customers, ${products.length} products`);
    } catch (err) {
      addToast('Export failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const Row = ({ label, sub, children }) => (
    <div className="settings__row">
      <div className="settings__row-info">
        <span className="settings__row-label">{label}</span>
        {sub && <span className="settings__row-sub">{sub}</span>}
      </div>
      <div className="settings__row-control">{children}</div>
    </div>
  );

  const shortcuts = [
    { label: 'New Invoice',   key: 'N (from /invoices)' },
    { label: 'Back',          key: 'Backspace' },
    { label: 'Search',        key: '/' },
    { label: 'Save Invoice',  key: 'Ctrl + S' },
  ];

  return (
    <div className="settings-page">
      <Toast toasts={toasts} />

      {/* THE FIX: wrap everything in settings-inner to center it */}
      <div className="settings-inner">

        {/* Header */}
        <div className="settings__header">
          <p className="settings__eyebrow">Preferences</p>
          <h1 className="settings__title">Settings</h1>
          <div className="settings__version">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            Leo Billing v1.0.0
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="settings__group">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <h3 className="settings__group-title">Appearance</h3>
          </div>
          <div className="settings__group-body">
            <Row label="Theme" sub={isDark ? 'Dark mode is on' : 'Light mode is on'}>
              <div className="settings__theme-toggle">
                <span className="settings__theme-opt">{isDark ? '🌙 Dark' : '☀️ Light'}</span>
                <button
                  className={`settings__pill${isDark ? ' settings__pill--dark' : ' settings__pill--light'}`}
                  onClick={toggleTheme} aria-label="Toggle theme"
                >
                  <span className="settings__pill-thumb" />
                </button>
              </div>
            </Row>
          </div>
        </div>

        {/* ── Account ── */}
        <div className="settings__group">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <h3 className="settings__group-title">Account</h3>
          </div>
          <div className="settings__group-body">
            <Row label="Signed in as" sub={user?.email}>
              <div className="settings__google-pill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
                Google
              </div>
            </Row>
            <Row label="Display Name" sub="From your Google account">
              <span className="settings__val">{user?.displayName || 'Not set'}</span>
            </Row>
            <Row label="Business Profile" sub="Shop name, address, GST, bank details">
              <button className="settings__link-btn" onClick={() => navigate('/profile')}>Edit Profile →</button>
            </Row>
          </div>
        </div>

        {/* ── Data & Export (Enterprise feature) ── */}
        <div className="settings__group">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <h3 className="settings__group-title">Data &amp; Export</h3>
          </div>
          <div className="settings__group-body">
            <Row label="Export All Data" sub="Download invoices, customers and products as CSV">
              <button className="settings__export-btn" onClick={handleExportData} disabled={exporting}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </Row>
            <Row label="Invoices" sub="Manage all your billing records">
              <button className="settings__link-btn" onClick={() => navigate('/invoices')}>View Invoices →</button>
            </Row>
            <Row label="Products Catalogue" sub="Manage your product list">
              <button className="settings__link-btn" onClick={() => navigate('/products')}>View Products →</button>
            </Row>
          </div>
        </div>

        {/* ── Keyboard shortcuts (Enterprise feature) ── */}
        <div className="settings__group">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
            </svg>
            <h3 className="settings__group-title">Keyboard Shortcuts</h3>
          </div>
          <div className="settings__shortcuts-grid">
            {[
              { label: 'New Invoice',    key: 'Ctrl + N' },
              { label: 'Search',         key: 'Ctrl + K' },
              { label: 'Save Invoice',   key: 'Ctrl + S' },
              { label: 'Go Back',        key: 'Alt + ←' },
              { label: 'Toggle Theme',   key: 'Ctrl + D' },
              { label: 'Dashboard',      key: 'Ctrl + H' },
            ].map(s => (
              <div key={s.label} className="settings__shortcut-item">
                <span>{s.label}</span>
                <kbd>{s.key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* ── System ── */}
        <div className="settings__group">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3 className="settings__group-title">System</h3>
          </div>
          <div className="settings__group-body">
            <Row label="App Version" sub="Leo Billing">
              <span className="settings__val">v1.0.0</span>
            </Row>
            <Row label="Database" sub="Supabase (PostgreSQL)">
              <span className="settings__status-dot">
                <span className="settings__dot settings__dot--green" />
                <span className="settings__val settings__val--ok">Connected</span>
              </span>
            </Row>
            <Row label="Auth Provider" sub="Firebase Google OAuth">
              <span className="settings__val settings__val--ok">Active</span>
            </Row>
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div className="settings__group settings__group--danger">
          <div className="settings__group-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <h3 className="settings__group-title settings__group-title--danger">Session</h3>
          </div>
          <div className="settings__group-body">
            <Row label="Sign Out" sub="You'll be taken back to the login screen">
              <button className="settings__danger-btn" onClick={() => setShowLogoutConfirm(true)}>Sign Out</button>
            </Row>
          </div>
        </div>

        {/* Logout confirm dialog */}
        {showLogoutConfirm && (
          <div className="settings__overlay" onClick={() => setShowLogoutConfirm(false)}>
            <div className="settings__dialog" onClick={e => e.stopPropagation()}>
              <div className="settings__dialog-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16,17 21,12 16,7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </div>
              <p className="settings__dialog-title">Sign out?</p>
              <p className="settings__dialog-sub">You'll need to log in again to access your billing data.</p>
              <div className="settings__dialog-actions">
                <button className="settings__dialog-cancel" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
                <button className="settings__dialog-confirm" onClick={handleLogout}>Sign Out</button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end settings-inner */}
    </div>
  );
}