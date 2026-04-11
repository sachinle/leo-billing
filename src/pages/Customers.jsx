import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
} from '../services/customerService';
import './Customers.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) =>
  typeof n === 'number' && isFinite(n)
    ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '₹0.00';

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

const initials = (name) =>
  name ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';

const AVATAR_COLORS = [
  '#c9a96e', '#7eb8c9', '#c97e9a', '#7ec98b', '#c9b87e', '#9e7ec9',
];
const avatarColor = (name) =>
  AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// ── Extract real error message from Supabase or JS errors ────
const getErrMsg = (err) => {
  // Supabase wraps errors differently depending on version
  if (!err) return 'Unknown error';
  if (err?.message) return err.message;
  if (err?.error_description) return err.error_description;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
};

// ── Toast ────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          }
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Confirm Dialog ───────────────────────────────────────────
function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <p className="dialog__msg">{message}</p>
        <div className="dialog__actions">
          <button className="dialog__cancel" onClick={onCancel}>Cancel</button>
          <button className="dialog__confirm" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Customer Drawer (Add / Edit) ─────────────────────────────
function CustomerDrawer({ open, onClose, onSave, initial, columns }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  // Two-stage open: mounted puts element in DOM, visible triggers CSS transition.
  // The rAF gap between them gives the browser one paint frame so the
  // transition actually runs instead of jumping straight to the end state.
  const [mounted, setMounted]   = useState(false);
  const [visible, setVisible]   = useState(false);
  const nameRef = useRef();
  const rafRef  = useRef();

  useEffect(() => {
    if (open) {
      // Lock page scroll so drawer stays fixed while open
      document.body.style.overflow = 'hidden';
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setVisible(true);
          setTimeout(() => nameRef.current?.focus(), 180);
        });
      });
      setForm({
        name:    initial?.name    || '',
        phone:   initial?.phone   || '',
        email:   initial?.email   || '',
        address: initial?.address || '',
      });
    } else {
      // Restore page scroll when drawer closes
      document.body.style.overflow = '';
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(t);
    }
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.body.style.overflow = ''; // safety cleanup
    };
  }, [open, initial]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  // Only show email/address fields if those columns exist in the table
  const hasEmail   = columns.includes('email');
  const hasAddress = columns.includes('address');

  if (!mounted) return null;

  return (
    <>
      <div className={`drawer-overlay ${visible ? 'drawer-overlay--open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${visible ? 'drawer--open' : ''}`}>
        <div className="drawer__header">
          <h2 className="drawer__title">
            {initial ? 'Edit Customer' : 'New Customer'}
          </h2>
          <button className="drawer__close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form className="drawer__form" onSubmit={handleSubmit}>
          <div className="drawer__field">
            <label>Full Name <span>*</span></label>
            <input
              ref={nameRef}
              type="text"
              placeholder="e.g. Sachin Tendulkar"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="drawer__field">
            <label>Phone Number <span>*</span></label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>

          {/* Only render if your Supabase table has these columns */}
          {hasEmail && (
            <div className="drawer__field">
              <label>Email <span className="optional">optional</span></label>
              <input
                type="email"
                placeholder="e.g. sachin@example.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
          )}

          {hasAddress && (
            <div className="drawer__field">
              <label>Address <span className="optional">optional</span></label>
              <textarea
                placeholder="Street, City, State"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                rows={3}
              />
            </div>
          )}

          <div className="drawer__actions">
            <button type="button" className="drawer__btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="drawer__btn-save" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Detect which columns your Supabase table actually has ──
  // This prevents "column does not exist" errors.
  // After first successful fetch, we read keys from the first record.
  const [tableColumns, setTableColumns] = useState(['name', 'phone']); // safe defaults
  const searchTimer = useRef(null);

  // ── Toast helper ──
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  // ── Fetch ──
  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getCustomers(user.uid);
      const safe = Array.isArray(data) ? data : [];
      setCustomers(safe);
      // Auto-detect columns from the first record
      if (safe.length > 0) {
        setTableColumns(Object.keys(safe[0]));
      }
    } catch (err) {
      console.error('[Customers] fetch error:', err);
      toast(`Failed to load: ${getErrMsg(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // ── Search (debounced) ──
  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q.trim()) { fetchCustomers(); return; }
      try {
        const results = await searchCustomers(user.uid, q);
        setCustomers(Array.isArray(results) ? results : []);
      } catch (err) {
        toast(`Search failed: ${getErrMsg(err)}`, 'error');
      }
    }, 300);
  };

  // ── Sort ──
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...customers].sort((a, b) => {
    let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // ── Build safe payload — only include columns that exist in the table ──
  const buildPayload = (form) => {
    const payload = {
      name:  form.name.trim(),
      phone: form.phone.trim(),
    };
    // Only add optional fields if the table has those columns AND the value is non-empty
    if (tableColumns.includes('email')   && form.email?.trim())   payload.email   = form.email.trim();
    if (tableColumns.includes('address') && form.address?.trim()) payload.address = form.address.trim();
    return payload;
  };

  // ── Add / Edit ──
  const handleSave = async (form) => {
    try {
      const payload = buildPayload(form);
      console.log('[Customers] saving payload:', payload); // visible in browser console

      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        toast('Customer updated successfully.');
      } else {
        await addCustomer(user.uid, payload);
        toast('Customer added successfully.');
      }
      setDrawerOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err) {
      // Show the REAL Supabase error instead of generic message
      const msg = getErrMsg(err);
      console.error('[Customers] save error:', err);
      toast(`Save failed: ${msg}`, 'error');
    }
  };

  const openAdd  = () => { setEditingCustomer(null); setDrawerOpen(true); };
  const openEdit = (c) => { setEditingCustomer(c);   setDrawerOpen(true); };

  // ── Delete ──
  const confirmDelete = async () => {
    try {
      if (selectedIds.size > 1) {
        await Promise.all([...selectedIds].map(id => deleteCustomer(id)));
        toast(`${selectedIds.size} customers deleted.`);
        setSelectedIds(new Set());
      } else {
        await deleteCustomer(deleteTarget);
        toast('Customer deleted.');
      }
      setDeleteTarget(null);
      fetchCustomers();
    } catch (err) {
      toast(`Delete failed: ${getErrMsg(err)}`, 'error');
    }
  };

  // ── Bulk select ──
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === sorted.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map(c => c.id)));
  };

  // ── Sort icon ──
  const SortIcon = ({ col }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{
        opacity: sortKey === col ? 1 : 0.3,
        transform: sortKey === col && sortDir === 'desc' ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.2s',
        marginLeft: 4,
        verticalAlign: 'middle',
      }}>
      <polyline points="18,15 12,9 6,15"/>
    </svg>
  );

  // ── Stats ──
  const totalRevenue = customers.reduce((s, c) => s + (Number(c.total_purchase) || 0), 0);
  const topCustomer  = [...customers].sort((a, b) => (b.total_purchase || 0) - (a.total_purchase || 0))[0];
  const newThisMonth = customers.filter(c => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at), now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // ── LTV & Loyalty stats ──
  const avgLTV         = customers.length > 0 ? totalRevenue / customers.length : 0;
  const loyaltyReady   = customers.filter(c => Number(c.loyalty_points) >= 1000).length;
  const totalLoyaltyPts = customers.reduce((s, c) => s + (Number(c.loyalty_points) || 0), 0);

  const hasEmail   = tableColumns.includes('email');
  const hasAddress = tableColumns.includes('address');

  return (
    <div className="customers">
      <Toast toasts={toasts} />

      <ConfirmDialog
        open={!!deleteTarget || selectedIds.size > 1}
        message={
          selectedIds.size > 1
            ? `Delete ${selectedIds.size} selected customers? This cannot be undone.`
            : 'Delete this customer? This cannot be undone.'
        }
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteTarget(null); setSelectedIds(new Set()); }}
      />

      <CustomerDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingCustomer(null); }}
        onSave={handleSave}
        initial={editingCustomer}
        columns={tableColumns}
      />

      {/* ── Page Header ── */}
      <header className="customers__header">
        <div>
          <p className="customers__eyebrow">Directory</p>
          <h1 className="customers__title">Customers</h1>
        </div>
        <button className="customers__add-btn" onClick={openAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Customer
        </button>
      </header>

      {/* ── Stats Row ── */}
      <div className="customers__stats">
        <div className="cstat">
          <p className="cstat__label">Total Customers</p>
          <p className="cstat__value">{customers.length}</p>
        </div>
        <div className="cstat">
          <p className="cstat__label">Total Revenue</p>
          <p className="cstat__value">{fmt(totalRevenue)}</p>
        </div>
        <div className="cstat">
          <p className="cstat__label">Avg Lifetime Value</p>
          <p className="cstat__value">{fmt(avgLTV)}</p>
        </div>
        <div className="cstat">
          <p className="cstat__label">New This Month</p>
          <p className="cstat__value">{newThisMonth}</p>
        </div>
        <div className="cstat">
          <p className="cstat__label">Top Customer</p>
          <p className="cstat__value cstat__value--name">{topCustomer?.name || '—'}</p>
        </div>
        {loyaltyReady > 0 && (
          <div className="cstat" style={{ borderColor: 'rgba(201,169,110,0.3)', background: 'rgba(201,169,110,0.05)' }}>
            <p className="cstat__label" style={{ color: '#c9a96e' }}>★ Loyalty Ready</p>
            <p className="cstat__value" style={{ color: '#c9a96e' }}>{loyaltyReady} customer{loyaltyReady !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="customers__toolbar">
        <div className="customers__search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="customers__search"
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={handleSearch}
          />
          {search && (
            <button className="customers__search-clear" onClick={() => { setSearch(''); fetchCustomers(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="customers__toolbar-right">
          {selectedIds.size > 0 && (
            <button className="customers__bulk-delete" onClick={() => setDeleteTarget('bulk')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M9,6V4h6v2"/>
              </svg>
              Delete {selectedIds.size} selected
            </button>
          )}
          <span className="customers__count">
            {sorted.length} {sorted.length === 1 ? 'customer' : 'customers'}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="customers__table-wrap">
        {loading ? (
          <div className="customers__loading">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="customers__skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="customers__empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <p>{search ? 'No customers match your search.' : 'No customers yet. Add your first one.'}</p>
            {!search && <button className="customers__add-btn" onClick={openAdd}>Add Customer</button>}
          </div>
        ) : (
          <table className="customers__table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="col-sortable" onClick={() => handleSort('name')}>
                  Customer <SortIcon col="name" />
                </th>
                <th>Phone</th>
                {hasEmail   && <th>Email</th>}
                <th className="col-sortable" onClick={() => handleSort('total_purchase')}>
                  Total Purchase <SortIcon col="total_purchase" />
                </th>
                <th style={{ color: '#c9a96e' }}>★ Loyalty</th>
                <th className="col-sortable" onClick={() => handleSort('created_at')}>
                  Joined <SortIcon col="created_at" />
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr
                  key={c.id}
                  className={selectedIds.has(c.id) ? 'row--selected' : ''}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="col-check">
                    <input type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)} />
                  </td>
                  <td>
                    <div className="customer-cell">
                      <div className="customer-avatar" style={{ background: avatarColor(c.name) }}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="customer-name">{c.name}</p>
                        {hasAddress && c.address && <p className="customer-address">{c.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="cell-phone">{c.phone}</td>
                  {hasEmail && (
                    <td className="cell-email">{c.email || <span className="cell-empty">—</span>}</td>
                  )}
                  <td className="cell-amount">{fmt(c.total_purchase)}</td>
                  <td>
                    {Number(c.loyalty_points) > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{
                          fontSize: '0.78rem', fontWeight: 700, fontFamily: 'DM Sans',
                          color: Number(c.loyalty_points) >= 1000 ? '#c9a96e' : 'var(--text-secondary,#8a8598)',
                        }}>
                          {Number(c.loyalty_points) >= 1000 ? '★ ' : ''}{c.loyalty_points} pts
                        </span>
                        <div style={{ width: 60, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{
                            height: '100%', borderRadius: 3, background: '#c9a96e',
                            width: `${Math.min(100, (Number(c.loyalty_points) / 1000) * 100)}%`,
                          }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted,#4e4b63)', fontSize: '0.78rem' }}>0 pts</span>
                    )}
                  </td>
                  <td className="cell-date">{fmtDate(c.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="action-btn action-btn--edit" onClick={() => openEdit(c)} title="Edit">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="action-btn action-btn--delete"
                        onClick={() => setDeleteTarget(c.id)} title="Delete">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19,6l-1,14H6L5,6"/>
                          <path d="M9,6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}