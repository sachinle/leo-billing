import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getInvoices } from '../services/invoiceService';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const fmt = (n) =>
  typeof n === 'number' && isFinite(n)
    ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '₹0.00';

// Parse YYYY-MM-DD safely as local (avoids UTC midnight offset shifting the date)
const todayStr = () => new Date().toLocaleDateString('en-CA');

const isToday = (dateStr) => {
  if (!dateStr) return false;
  return String(dateStr).split('T')[0] === todayStr();
};

// Format date "YYYY-MM-DD" → "21 Feb 2026"
const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = String(d).split('T')[0].split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
};

// Get first name from Google display name
const firstName = (displayName) => {
  if (!displayName) return '';
  return displayName.split(' ')[0];
};

// Greeting based on time of day
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const StatCard = ({ label, value, sub, icon, delay, accent }) => (
  <div className="stat-card" style={{ animationDelay:`${delay}ms` }}>
    <div className="stat-card__icon" style={accent ? { borderColor:accent, color:accent, background:`${accent}18` } : {}}>
      {icon}
    </div>
    <div className="stat-card__body">
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value" style={accent ? { color:accent } : {}}>{value}</p>
      {sub && <p className="stat-card__sub">{sub}</p>}
    </div>
    <div className="stat-card__glow" />
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [stats, setStats]       = useState({
    totalRevenue: 0, todayRevenue: 0, invoiceCount: 0,
    avgInvoice: 0,  unpaidCount: 0,  amountDue: 0,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getInvoices(user.uid);
        if (cancelled) return;
        const safe = Array.isArray(data) ? data : [];
        setInvoices(safe);

        const totalRevenue  = safe.reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
        const todayRevenue  = safe.filter(i => isToday(i.date)).reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
        const unpaidCount   = safe.filter(i => i.payment_status === 'unpaid').length;
        const amountDue     = safe.reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

        setStats({
          totalRevenue,
          todayRevenue,
          invoiceCount: safe.length,
          avgInvoice:   safe.length > 0 ? totalRevenue / safe.length : 0,
          unpaidCount,
          amountDue,
        });
      } catch (err) {
        if (!cancelled) setError('Failed to load dashboard data. Please refresh.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [user]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard__skeleton">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton-card" style={{ animationDelay:`${i*100}ms` }} />
          ))}
        </div>
        <div className="skeleton-table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard__error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const recent = invoices.slice(0, 6);
  const name   = firstName(user?.displayName);
  const greeting = getGreeting();

  return (
    <div className="dashboard">

      {/* ── Welcome Header ── */}
      <header className="dashboard__header">
        <div>
          <p className="dashboard__eyebrow">Overview</p>
          <h1 className="dashboard__title">
            {greeting}{name ? `, ${name}` : ''}
            <span className="dashboard__wave"> 👋</span>
          </h1>
          <p className="dashboard__subtitle">
            Here's what's happening with your business today.
          </p>
        </div>
        <div className="dashboard__header-right">
          <div className="dashboard__date">
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
          <Link to="/create-invoice" className="dashboard__new-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Invoice
          </Link>
        </div>
      </header>

      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        <StatCard
          label="Total Revenue"
          value={fmt(stats.totalRevenue)}
          sub={`${stats.invoiceCount} invoice${stats.invoiceCount !== 1 ? 's' : ''} total`}
          delay={0}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="5" x2="18" y2="5"/><line x1="6" y1="9" x2="18" y2="9"/><path d="M6 5c4 0 7 0 7 4s-3 4-7 4l7 7"/></svg>}/>
        <StatCard
          label="Today's Revenue"
          value={fmt(stats.todayRevenue)}
          sub={new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
          delay={80}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
        />
        <StatCard
          label="Amount Due"
          value={fmt(stats.amountDue)}
          sub={`${stats.unpaidCount} unpaid invoice${stats.unpaidCount !== 1 ? 's' : ''}`}
          delay={160}
          accent={stats.unpaidCount > 0 ? '#e0aa50' : undefined}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        />
        <StatCard
          label="Avg Invoice"
          value={fmt(stats.avgInvoice)}
          sub="Per invoice"
          delay={240}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>}
        />
      </div>

      {/* ── Recent Invoices ── */}
      <section className="recent-section">
        <div className="recent-section__header">
          <h2 className="recent-section__title">Recent Invoices</h2>
          <Link to="/invoices" className="recent-section__link">View all →</Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <p>No invoices yet. Create your first one.</p>
            <Link to="/create-invoice" className="empty-state__btn">Create Invoice</Link>
          </div>
        ) : (
          <div className="invoice-table-wrap">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv, i) => {
                  const isPaid = (inv.payment_status || 'paid') === 'paid';
                  return (
                    <tr
                      key={inv.id ?? i}
                      style={{ animationDelay:`${i*60}ms`, cursor:'pointer' }}
                      onClick={() => window.location.href = `/invoices/view/${inv.id}`}
                    >
                      <td className="invoice-table__no">#{inv.invoice_no ?? '—'}</td>
                      <td className="invoice-table__name">{inv.customer_name ?? '—'}</td>
                      <td style={{ fontSize:'0.82rem' }}>{fmtDate(inv.date)}</td>
                      <td className="invoice-table__amount">{fmt(Number(inv.final_amount))}</td>
                      <td>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:5,
                          padding:'3px 9px', borderRadius:6,
                          fontSize:'0.72rem', fontWeight:500, fontFamily:'DM Sans,sans-serif',
                          color:      isPaid ? '#70c49a' : '#e0aa50',
                          background: isPaid ? 'rgba(112,196,154,0.1)' : 'rgba(224,170,80,0.1)',
                          border:`1px solid ${isPaid ? 'rgba(112,196,154,0.3)' : 'rgba(224,170,80,0.3)'}`,
                          whiteSpace:'nowrap',
                        }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:isPaid?'#70c49a':'#e0aa50' }} />
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td style={{ fontSize:'0.82rem', color:Number(inv.amount_due)>0?'#e0aa50':'var(--text-muted,#4e4b63)' }}>
                        {Number(inv.amount_due) > 0 ? fmt(Number(inv.amount_due)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}