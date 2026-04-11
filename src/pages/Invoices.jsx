import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { getInvoices, searchInvoices, deleteInvoice, duplicateInvoice } from '../services/invoiceService';
import { markInvoicePaid } from '../services/profileService';
import { generateInvoiceNo } from '../utils/generateInvoiceNo';
import { Link, useNavigate } from 'react-router-dom';
import './Invoices.css';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = String(d).split('T')[0].split('-');
  return `${day}/${m}/${y}`;
};

// ── SVG Icons ────────────────────────────────────────────────
const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19,6l-1,14H6L5,6"/>
    <path d="M9,6V4h6v2"/>
  </svg>
);

// ── Status Badge ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const isPaid = (status || 'unpaid') === 'paid';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 9px', borderRadius:6,
      fontSize:'0.72rem', fontWeight:500, fontFamily:'DM Sans,sans-serif',
      color: isPaid ? '#70c49a' : '#e0aa50',
      background: isPaid ? 'rgba(112,196,154,0.1)' : 'rgba(224,170,80,0.1)',
      border:`1px solid ${isPaid ? 'rgba(112,196,154,0.3)' : 'rgba(224,170,80,0.3)'}`,
      whiteSpace:'nowrap',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:isPaid ? '#70c49a' : '#e0aa50', flexShrink:0 }} />
      {isPaid ? 'Paid' : 'Unpaid'}
    </span>
  );
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  if (!open) return null;
  return createPortal(
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        {title && <p style={{ fontFamily:'Playfair Display,serif', fontSize:'1rem', color:'var(--text-primary,#f0ece4)', marginBottom:8 }}>{title}</p>}
        <p className="dialog__msg">{message}</p>
        <div className="dialog__actions">
          <button className="dialog__cancel" onClick={onCancel}>Cancel</button>
          <button className={`dialog__confirm ${confirmClass || ''}`} onClick={onConfirm}>{confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Invoices() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const searchTimer = useRef(null);

  const [invoices, setInvoices]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey]           = useState('created_at');
  const [sortDir, setSortDir]           = useState('desc');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toasts, setToasts]             = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // ── Fetch ──
  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await getInvoices(user.uid);
      setInvoices(Array.isArray(data) ? data : []);
    } catch { addToast('Error loading invoices', 'error'); }
    finally { setLoading(false); }
  }, [user, addToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── Debounced search ──
  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q.trim()) { fetchInvoices(); return; }
      try {
        const results = await searchInvoices(user.uid, q);
        setInvoices(Array.isArray(results) ? results : []);
      } catch { addToast('Search failed', 'error'); }
    }, 300);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInvoice(deleteTarget, user.uid);
      setDeleteTarget(null);
      addToast('Invoice deleted');
      fetchInvoices();
    } catch { addToast('Error deleting invoice', 'error'); }
  };

  // ── Mark paid ──
  const handleMarkPaid = async (inv) => {
    try {
      await markInvoicePaid(inv.id, user.uid);
      setInvoices(list => list.map(i =>
        i.id === inv.id ? { ...i, payment_status: 'paid', amount_due: 0 } : i
      ));
      addToast(`${inv.customer_name}'s invoice marked as paid`);
    } catch { addToast('Failed to update payment status', 'error'); }
  };

  // ── Duplicate invoice ──
  const handleDuplicate = async (inv) => {
    try {
      const newNo = generateInvoiceNo();
      const newInv = await duplicateInvoice(inv.id, user.uid, newNo);
      addToast(`Invoice duplicated as ${newNo}`);
      fetchInvoices();
      // Navigate to edit the duplicate immediately
      setTimeout(() => navigate(`/invoices/edit/${newInv.id}`), 600);
    } catch (err) {
      addToast('Duplicate failed: ' + (err.message || 'Unknown'), 'error');
    }
  };

  // ── Sort ──
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // ── Filter + Sort ──
  const filtered = invoices.filter(i =>
    statusFilter === 'all' || (i.payment_status || 'unpaid') === statusFilter
  );
  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // ── Stats ──
  const totalRevenue = invoices.reduce((s, i) => s + (Number(i.final_amount) || 0), 0);
  const totalUnpaid  = invoices.reduce((s, i) => s + (Number(i.amount_due)   || 0), 0);
  const unpaidCount  = invoices.filter(i => i.payment_status === 'unpaid').length;
  // use local value so invoices created near midnight show correct day
  const todayStr     = new Date().toLocaleDateString('en-CA');
  const todayCount   = invoices.filter(i => String(i.date || '').startsWith(todayStr)).length;

  // ── Sort icon ──
  const SortIcon = ({ col }) => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ opacity: sortKey === col ? 1 : 0.3, marginLeft: 4, verticalAlign: 'middle',
        transform: sortKey === col && sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
      <polyline points="18,15 12,9 6,15"/>
    </svg>
  );

  return (
    <div className="invoices">
      <Toast toasts={toasts} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Invoice?"
        message="This invoice and all its items will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Header ── */}
      <div className="invoices__header">
        <div>
          <p className="invoices__eyebrow">Billing</p>
          <h1 className="invoices__title">Invoices</h1>
        </div>
        <Link to="/create-invoice" className="invoices__create-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Invoice
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="invoices__stats">
        <div className="istat">
          <p className="istat__label">Total Invoices</p>
          <p className="istat__value">{invoices.length}</p>
        </div>
        <div className="istat">
          <p className="istat__label">Total Revenue</p>
          <p className="istat__value">{fmt(totalRevenue)}</p>
        </div>
        <div className="istat" style={unpaidCount > 0 ? { borderColor:'rgba(224,170,80,0.35)' } : {}}>
          <p className="istat__label">Amount Due</p>
          <p className="istat__value" style={unpaidCount > 0 ? { color:'#e0aa50' } : {}}>{fmt(totalUnpaid)}</p>
        </div>
        <div className="istat">
          <p className="istat__label">Today's Invoices</p>
          <p className="istat__value">{todayCount}</p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="invoices__toolbar">
        <div className="invoices__search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="invoices__search"
            type="text"
            placeholder="Search by invoice no or customer…"
            value={search}
            onChange={handleSearch}
          />
          {search && (
            <button className="invoices__search-clear" onClick={() => { setSearch(''); fetchInvoices(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[
            { key:'all',    label:'All' },
            { key:'paid',   label:'Paid' },
            { key:'unpaid', label: unpaidCount > 0 ? `Unpaid (${unpaidCount})` : 'Unpaid' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`inv-filter-pill${statusFilter === key ? ` inv-filter-pill--active inv-filter-pill--${key}` : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="invoices__count">{sorted.length} {sorted.length === 1 ? 'invoice' : 'invoices'}</span>
      </div>

      {/* ── Table ── */}
      <div className="invoices__table-wrap">
        {loading ? (
          <div className="invoices__loading">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="invoices__skeleton-row" style={{ animationDelay:`${i*80}ms` }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="invoices__empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <p>{search ? 'No invoices match your search.' : statusFilter !== 'all' ? `No ${statusFilter} invoices.` : 'No invoices yet.'}</p>
            {!search && statusFilter === 'all' && (
              <Link to="/create-invoice" className="invoices__empty-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Invoice
              </Link>
            )}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="invoices__table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th className="col-sortable" onClick={() => handleSort('invoice_no')}>
                    Invoice No <SortIcon col="invoice_no"/>
                  </th>
                  <th className="col-sortable" onClick={() => handleSort('customer_name')}>
                    Customer <SortIcon col="customer_name"/>
                  </th>
                  <th className="col-sortable" onClick={() => handleSort('date')}>
                    Date <SortIcon col="date"/>
                  </th>
                  <th className="col-sortable" onClick={() => handleSort('final_amount')}>
                    Amount <SortIcon col="final_amount"/>
                  </th>
                  <th>Status</th>
                  <th className="col-sortable" onClick={() => handleSort('amount_due')}>
                    Due <SortIcon col="amount_due"/>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv, i) => {
                  const unpaid = (inv.payment_status || 'unpaid') === 'unpaid';
                  return (
                    <tr key={inv.id} style={{ animationDelay:`${i*35}ms` }}>
                      <td>
                        <span className="inv-no" style={{ cursor:'pointer' }}
                          onClick={() => navigate(`/invoices/view/${inv.id}`)}>
                          {inv.invoice_no}
                        </span>
                      </td>
                      <td>
                        <div style={{ lineHeight:1.4 }}>
                          <span className="inv-customer">{inv.customer_name}</span>
                          {inv.customer_phone && (
                            <div style={{ fontSize:'0.72rem', color:'var(--text-muted,#4e4b63)', marginTop:2 }}>
                              {inv.customer_phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ lineHeight:1.4 }}>
                          <span style={{ fontSize:'0.82rem' }}>{fmtDate(inv.date)}</span>
                          {inv.time && (
                            <div style={{ fontSize:'0.7rem', color:'var(--text-muted,#4e4b63)', marginTop:1 }}>
                              {inv.time}
                            </div>
                          )}
                        </div>
                      </td>
                      <td><span className="inv-amount">{fmt(inv.final_amount)}</span></td>
                      <td><StatusBadge status={inv.payment_status} /></td>
                      <td>
                        {Number(inv.amount_due) > 0
                          ? <span style={{ color:'#e0aa50', fontSize:'0.85rem', fontFamily:'DM Sans,sans-serif' }}>{fmt(inv.amount_due)}</span>
                          : <span style={{ opacity:0.3, fontSize:'0.8rem' }}>—</span>}
                      </td>
                      <td>
                        {/* ── ACTION BUTTONS — always visible, clear colors ── */}
                        <div className="row-actions">
                          {/* View */}
                          <button className="action-btn action-btn--view" title="View Invoice"
                            onClick={() => navigate(`/invoices/view/${inv.id}`)}>
                            <EyeIcon />
                          </button>
                          {/* Edit */}
                          <button className="action-btn action-btn--edit" title="Edit Invoice"
                            onClick={() => navigate(`/invoices/edit/${inv.id}`)}>
                            <EditIcon />
                          </button>
                          {/* Duplicate */}
                          <button className="action-btn action-btn--duplicate" title="Duplicate Invoice"
                            onClick={() => handleDuplicate(inv)}>
                            <CopyIcon />
                          </button>
                          {/* Mark as Paid — only for unpaid */}
                          {unpaid && (
                            <button className="action-btn action-btn--paid" title="Mark as Paid"
                              onClick={() => handleMarkPaid(inv)}>
                              <CheckIcon />
                            </button>
                          )}
                          {/* Delete */}
                          <button className="action-btn action-btn--delete" title="Delete Invoice"
                            onClick={() => setDeleteTarget(inv.id)}>
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}