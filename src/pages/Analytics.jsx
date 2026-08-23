import { useState, useEffect, useMemo } from 'react';
import WebsiteAnalytics from '../components/WebsiteAnalytics';
import { useAuth } from '../hooks/useAuth';
import { getInvoices } from '../services/invoiceService';
import { getCustomers } from '../services/customerService';
import { getProducts } from '../services/productService';
import './Analytics.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  typeof n === 'number' && isFinite(n)
    ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '₹0';

const fmtFull = (n) =>
  typeof n === 'number' && isFinite(n)
    ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '₹0.00';

const todayStr = () => new Date().toLocaleDateString('en-CA');

const getMonthKey = (dateStr) => {
  if (!dateStr) return null;
  const d = String(dateStr).split('T')[0];
  return d.slice(0, 7); // YYYY-MM
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtMonth = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m)-1]} ${y.slice(2)}`;
};

// ── Pure-SVG area/line chart ───────────────────────────────────────────────────
function AreaChart({ data, color = '#c9a96e', height = 160 }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted,#6b6887)', fontSize: '0.8rem', fontFamily: 'DM Sans' }}>
      Not enough data yet
    </div>
  );

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const W = 600, H = height;
  const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const pts = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1)) * chartW,
    y: PAD.top + chartH - (d.value / maxVal) * chartH,
    ...d,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${pts[pts.length-1].x.toFixed(1)},${(PAD.top+chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PAD.top+chartH).toFixed(1)} Z`;

  // Y axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(r => ({
    y: PAD.top + chartH - r * chartH,
    val: r * maxVal,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W-PAD.right} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={PAD.left-6} y={t.y+4} textAnchor="end"
            fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="DM Sans">
            {t.val >= 1000 ? `₹${(t.val/1000).toFixed(0)}k` : `₹${t.val.toFixed(0)}`}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points + labels */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="rgba(10,10,15,0.8)" strokeWidth="2" />
          {/* X label */}
          <text x={p.x} y={H - 4} textAnchor="middle"
            fontSize="9" fill="rgba(255,255,255,0.45)" fontFamily="DM Sans">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Bar chart ──────────────────────────────────────────────────────────────────
function BarChart({ data, color = '#c9a96e', horizontal = false }) {
  if (!data || data.length === 0) return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted,#6b6887)', fontSize: '0.8rem', fontFamily: 'DM Sans' }}>
      No data yet
    </div>
  );

  const maxVal = Math.max(...data.map(d => d.value), 1);

  if (horizontal) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '0.78rem', fontFamily: 'DM Sans', color: 'var(--text-primary,#f0ece4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                {d.label}
              </span>
              <span style={{ fontSize: '0.78rem', fontFamily: 'DM Sans', color: color, fontWeight: 600 }}>
                {typeof d.value === 'number' && d.value > 100 ? fmt(d.value) : d.value}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 6, background: color,
                width: `${(d.value / maxVal) * 100}%`,
                opacity: 0.8 - (i * 0.1),
                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Vertical bars
  const barW = Math.max(24, Math.min(48, 220 / data.length));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{
            width: '100%', borderRadius: '4px 4px 0 0',
            background: color, opacity: 0.75 + (d.value / maxVal) * 0.25,
            height: `${Math.max(4, (d.value / maxVal) * 80)}px`,
            transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)',
          }} />
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans', whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 100 }) {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;

  const r = 38, cx = 50, cy = 50, strokeW = 14;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circ;
        const offset = circ - (cumulative / total) * circ;
        cumulative += seg.value;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform="rotate(-90 50 50)"
          />
        );
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={r - strokeW/2 - 1} fill="var(--card,#14141c)" />
    </svg>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon, loading, delay = 0 }) {
  return (
    <div className="an__kpi" style={{ animationDelay: `${delay}ms` }}>
      <div className="an__kpi-icon" style={{ color: accent, background: `${accent}18`, borderColor: `${accent}33` }}>
        {icon}
      </div>
      <div>
        <p className="an__kpi-label">{label}</p>
        <p className="an__kpi-value" style={{
          color: accent,
          filter: loading ? 'blur(8px)' : 'none',
          opacity: loading ? 0.3 : 1,
          transition: 'filter 0.4s, opacity 0.4s',
        }}>
          {value}
        </p>
        {sub && <p className="an__kpi-sub">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth();
  const [invoices,  setInvoices]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [period,    setPeriod]    = useState('3m'); // '1m' '3m' '6m' '1y' 'all'

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getInvoices(user.uid),
      getCustomers(user.uid),
      getProducts(user.uid),
    ]).then(([inv, cust, prod]) => {
      setInvoices(Array.isArray(inv) ? inv : []);
      setCustomers(Array.isArray(cust) ? cust : []);
      setProducts(Array.isArray(prod) ? prod : []);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, [user]);

  // ── Filter invoices by period ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (period === 'all') return invoices;
    const now = new Date();
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    return invoices.filter(inv => {
      const d = new Date(String(inv.date || inv.created_at).split('T')[0]);
      return d >= cutoff;
    });
  }, [invoices, period]);

  // ── Key metrics ───────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total      = filtered.reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
    const paid       = filtered.filter(i => i.payment_status === 'paid');
    const unpaid     = filtered.filter(i => i.payment_status === 'unpaid');
    const totalDue   = filtered.reduce((s, i) => s + (Number(i.amount_due) || 0), 0);
    const avg        = filtered.length > 0 ? total / filtered.length : 0;
    const todayInv   = filtered.filter(i => String(i.date || '').split('T')[0] === todayStr());
    const todayRev   = todayInv.reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
    const collRate   = total > 0 ? ((total - totalDue) / total * 100) : 0;
    return { total, paid: paid.length, unpaid: unpaid.length, totalDue, avg, todayRev, collRate, count: filtered.length };
  }, [filtered]);

  // ── Monthly revenue trend ─────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const k = getMonthKey(inv.date || inv.created_at);
      if (!k) return;
      map[k] = (map[k] || 0) + (Number(inv.final_amount) || 0);
    });
    const keys = Object.keys(map).sort();
    return keys.map(k => ({ label: fmtMonth(k), value: map[k], key: k }));
  }, [filtered]);

  // ── Daily revenue (last 14 days) ──────────────────────────────────────────
  const dailyTrend = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      const label = i === 0 ? 'Today' : `${d.getDate()}/${d.getMonth()+1}`;
      const value = filtered
        .filter(inv => String(inv.date || '').split('T')[0] === key)
        .reduce((s, inv) => s + (Number(inv.final_amount) || 0), 0);
      days.push({ label, value, key });
    }
    return days;
  }, [filtered]);

  // ── Payment breakdown ─────────────────────────────────────────────────────
  const payBreakdown = useMemo(() => {
    const paidAmt   = filtered.filter(i => i.payment_status === 'paid').reduce((s,i) => s+(Number(i.final_amount)||0), 0);
    const unpaidAmt = filtered.reduce((s,i) => s+(Number(i.amount_due)||0), 0);
    return [
      { label: 'Collected', value: Math.max(0, paidAmt - 0), color: '#70c49a' },
      { label: 'Outstanding', value: unpaidAmt, color: '#e0aa50' },
    ];
  }, [filtered]);

  // ── Top products by revenue ───────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      // We don't have items in getInvoices, so we approximate per invoice
    });
    // Use products list sorted by their price × estimated volume (rough proxy)
    return products
      .map(p => ({ label: p.name, value: Number(p.price) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [invoices, products]);

  // ── Top customers by total purchase ──────────────────────────────────────
  const topCustomers = useMemo(() => {
    return customers
      .filter(c => Number(c.total_purchase) > 0)
      .sort((a, b) => Number(b.total_purchase) - Number(a.total_purchase))
      .slice(0, 8)
      .map(c => ({
        label: c.name,
        value: Number(c.total_purchase) || 0,
        sub: `${c.phone} · ${Number(c.loyalty_points)||0} pts`,
      }));
  }, [customers]);

  // ── Day-of-week distribution ──────────────────────────────────────────────
  const dayDist = useMemo(() => {
    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const map = Object.fromEntries(DOW.map(d => [d, 0]));
    filtered.forEach(inv => {
      const d = new Date(String(inv.date||'').split('T')[0]);
      if (!isNaN(d)) map[DOW[d.getDay()]] += Number(inv.final_amount) || 0;
    });
    return DOW.map(d => ({ label: d, value: map[d] }));
  }, [filtered]);

  // ── Hour distribution (from time field) ──────────────────────────────────
  const hourDist = useMemo(() => {
    const slots = [
      { label: 'Morning\n6–12', range: [6,12], value: 0 },
      { label: 'Afternoon\n12–17', range: [12,17], value: 0 },
      { label: 'Evening\n17–21', range: [17,21], value: 0 },
      { label: 'Night\n21–6', range: [21,30], value: 0 },
    ];
    filtered.forEach(inv => {
      if (!inv.time) return;
      const h = parseInt(inv.time.split(':')[0]) || 0;
      const eff = h < 6 ? h + 24 : h;
      const slot = slots.find(s => eff >= s.range[0] && eff < s.range[1]);
      if (slot) slot.value += Number(inv.final_amount) || 0;
    });
    return slots;
  }, [filtered]);

  // ── Growth: compare this period vs previous period ────────────────────────
  const growth = useMemo(() => {
    if (period === 'all') return null;
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3;
    const now = new Date();
    const curStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - months * 2 + 1, 1);
    const cur  = invoices.filter(i => { const d=new Date(String(i.date||'').split('T')[0]); return d>=curStart; })
                         .reduce((s,i) => s+(Number(i.final_amount)||0), 0);
    const prev = invoices.filter(i => { const d=new Date(String(i.date||'').split('T')[0]); return d>=prevStart && d<curStart; })
                         .reduce((s,i) => s+(Number(i.final_amount)||0), 0);
    if (prev === 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    return { pct: pct.toFixed(1), up: pct >= 0 };
  }, [invoices, period]);

  return (
    <div className="an-page">

      {/* ── Header ── */}
      <header className="an__header">
        <div>
          <p className="an__eyebrow">Business Intelligence</p>
          <h1 className="an__title">Analytics</h1>
          <p className="an__subtitle">Comprehensive insights for your business</p>
        </div>

        {/* Period selector */}
        <div className="an__period-tabs">
          {[
            { id: '1m', label: '1M' },
            { id: '3m', label: '3M' },
            { id: '6m', label: '6M' },
            { id: '1y', label: '1Y' },
            { id: 'all', label: 'All' },
          ].map(p => (
            <button
              key={p.id}
              className={`an__period-tab${period === p.id ? ' an__period-tab--active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── KPI Grid ── */}
      <div className="an__kpi-grid">
        <KpiCard label="Total Revenue" value={fmt(metrics.total)} sub={`${metrics.count} invoices`}
          accent="#c9a96e" loading={loading} delay={0}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="6" y1="5" x2="18" y2="5"/><line x1="6" y1="9" x2="18" y2="9"/><path d="M6 5c4 0 7 0 7 4s-3 4-7 4l7 7"/></svg>} />
        <KpiCard label="Today's Revenue" value={fmt(metrics.todayRev)} sub="vs yesterday"
          accent="#70c49a" loading={loading} delay={60}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
        <KpiCard label="Avg Invoice" value={fmtFull(metrics.avg)} sub="per invoice"
          accent="#7eb8e8" loading={loading} delay={120}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>} />
        <KpiCard label="Collection Rate" value={`${metrics.collRate.toFixed(1)}%`} sub={`₹${(metrics.totalDue/1000).toFixed(1)}k outstanding`}
          accent={metrics.collRate >= 80 ? '#70c49a' : '#e0aa50'} loading={loading} delay={180}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20,6 9,17 4,12"/></svg>} />
        <KpiCard label="Customers" value={customers.length} sub={`${topCustomers.length} active buyers`}
          accent="#c9a96e" loading={loading} delay={240}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <KpiCard label="Unpaid Invoices" value={metrics.unpaid} sub={fmt(metrics.totalDue) + ' due'}
          accent={metrics.unpaid > 0 ? '#e0aa50' : '#70c49a'} loading={loading} delay={300}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
      </div>

      {/* ── Growth badge ── */}
      {growth && (
        <div className={`an__growth-badge${growth.up ? ' an__growth-badge--up' : ' an__growth-badge--down'}`}>
          {growth.up ? '▲' : '▼'} {Math.abs(growth.pct)}% vs previous period
        </div>
      )}

      {/* ── Charts row 1: Revenue trend + Payment breakdown ── */}
      <div className="an__charts-row">

        {/* Revenue trend */}
        <div className="an__chart-card an__chart-card--wide">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Revenue Trend</h3>
              <p className="an__chart-sub">Monthly revenue over time</p>
            </div>
          </div>
          <div style={{ height: 160 }}>
            {loading ? (
              <div className="an__skeleton" style={{ height: 160, borderRadius: 8 }} />
            ) : (
              <AreaChart data={monthlyTrend} color="#c9a96e" height={160} />
            )}
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="an__chart-card">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Collection</h3>
              <p className="an__chart-sub">Paid vs outstanding</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <DonutChart segments={payBreakdown} size={90} />
            <div style={{ flex: 1 }}>
              {payBreakdown.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.78rem', fontFamily: 'DM Sans', color: 'var(--text-muted,#6b6887)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'DM Sans', color: s.color, fontWeight: 600 }}>{fmt(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Charts row 2: Daily trend + Day of week ── */}
      <div className="an__charts-row">

        {/* Daily trend (last 14 days) */}
        <div className="an__chart-card an__chart-card--wide">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Daily Revenue</h3>
              <p className="an__chart-sub">Last 14 days</p>
            </div>
          </div>
          <div style={{ height: 130 }}>
            {loading ? <div className="an__skeleton" style={{ height: 130, borderRadius: 8 }} /> : (
              <AreaChart data={dailyTrend} color="#70c49a" height={130} />
            )}
          </div>
        </div>

        {/* Day of week heatmap */}
        <div className="an__chart-card">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Best Day</h3>
              <p className="an__chart-sub">Revenue by day of week</p>
            </div>
          </div>
          {loading ? <div className="an__skeleton" style={{ height: 80, borderRadius: 8 }} /> : (
            <BarChart data={dayDist} color="#7eb8e8" />
          )}
        </div>

      </div>

      {/* ── Charts row 3: Top customers + Top products ── */}
      <div className="an__charts-row">

        {/* Top customers */}
        <div className="an__chart-card">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Top Customers</h3>
              <p className="an__chart-sub">By lifetime value</p>
            </div>
          </div>
          {loading ? <div className="an__skeleton" style={{ height: 180, borderRadius: 8 }} /> : (
            topCustomers.length === 0 ? (
              <p style={{ color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>
                No customer data yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topCustomers.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: ['#c9a96e','#70c49a','#7eb8e8','#e07070','#9b8ed4'][i % 5] + '33',
                      color: ['#c9a96e','#70c49a','#7eb8e8','#e07070','#9b8ed4'][i % 5],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, fontFamily: 'DM Sans', flexShrink: 0,
                    }}>
                      {c.label[0]?.toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontFamily: 'DM Sans', color: 'var(--text-primary,#f0ece4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.label}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans' }}>
                        {c.sub}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'DM Sans', color: '#c9a96e', fontWeight: 600, flexShrink: 0 }}>
                      {fmt(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Top products */}
        <div className="an__chart-card">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">Products</h3>
              <p className="an__chart-sub">By unit price</p>
            </div>
          </div>
          {loading ? <div className="an__skeleton" style={{ height: 180, borderRadius: 8 }} /> : (
            topProducts.length === 0 ? (
              <p style={{ color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>
                No products yet
              </p>
            ) : (
              <BarChart data={topProducts} color="#c9a96e" horizontal={true} />
            )
          )}
        </div>

      </div>

      {/* ── Business hours ── */}
      <div className="an__chart-card an__chart-card--full">
        <div className="an__chart-header">
          <div>
            <h3 className="an__chart-title">Revenue by Time of Day</h3>
            <p className="an__chart-sub">When does your business earn the most?</p>
          </div>
        </div>
        <div className="an__time-grid">
          {hourDist.map((slot, i) => {
            const icons = ['🌅','☀️','🌆','🌙'];
            const maxSlot = Math.max(...hourDist.map(s => s.value), 1);
            const pct = (slot.value / maxSlot) * 100;
            return (
              <div key={i} style={{
                padding: '14px 12px', borderRadius: 10,
                background: pct > 60 ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${pct > 60 ? 'rgba(201,169,110,0.25)' : 'var(--border,rgba(201,169,110,0.12))'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{icons[i]}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans', marginBottom: 4 }}>
                  {slot.label.split('\n')[0]}<br />{slot.label.split('\n')[1]}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: pct > 60 ? '#c9a96e' : 'var(--text-primary,#f0ece4)', fontFamily: 'DM Sans' }}>
                  {fmt(slot.value)}
                </div>
                <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: '#c9a96e', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Loyalty summary ── */}
      {customers.some(c => Number(c.loyalty_points) > 0) && (
        <div className="an__chart-card an__chart-card--full">
          <div className="an__chart-header">
            <div>
              <h3 className="an__chart-title">★ Loyalty Programme</h3>
              <p className="an__chart-sub">Customer points distribution</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {customers
              .filter(c => Number(c.loyalty_points) > 0)
              .sort((a, b) => Number(b.loyalty_points) - Number(a.loyalty_points))
              .slice(0, 12)
              .map((c, i) => {
                const pts = Number(c.loyalty_points) || 0;
                const pct = Math.min(100, (pts / 1000) * 100);
                return (
                  <div key={i} style={{
                    padding: '12px', borderRadius: 9,
                    background: pts >= 1000 ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${pts >= 1000 ? 'rgba(201,169,110,0.3)' : 'var(--border,rgba(201,169,110,0.12))'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: '#c9a96e33', color: '#c9a96e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 700,
                      }}>{c.name[0]?.toUpperCase()}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary,#f0ece4)', fontFamily: 'DM Sans', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: pts >= 1000 ? '#c9a96e' : 'var(--text-primary)', fontFamily: 'DM Sans' }}>
                      {pts} pts {pts >= 1000 && '★'}
                    </div>
                    <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 6 }}>
                      <div style={{ height: '100%', borderRadius: 3, background: '#c9a96e', width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans', marginTop: 3 }}>
                      {pts >= 1000 ? 'Ready to redeem!' : `${1000 - pts} to reward`}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

    
      {/* Orders coming from the website — a different question to
          invoices, so it gets its own section rather than being mixed
          into the billing charts. */}
      <WebsiteAnalytics />
    </div>
  );
}
