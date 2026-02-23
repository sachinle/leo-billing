import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from '../services/productService';
import './Products.css';

// ── Helpers ──────────────────────────────────────────────────
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

const getErrMsg = (err) => {
  if (!err) return 'Unknown error';
  if (err?.message) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
};

// Unit options for dropdown
const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'dozen', 'meter', 'set'];

// GST rate options
const GST_RATES = [0, 5, 12, 18, 28];

// Category options
const CATEGORIES = ['Electronics', 'Food & Beverage', 'Clothing', 'Stationery', 'Hardware', 'Medicine', 'Other'];

// Stock badge
const StockBadge = ({ stock }) => {
  if (stock === null || stock === undefined) return <span className="cell-empty">—</span>;
  const n = Number(stock);
  if (n <= 0)  return <span className="badge badge--out">Out of Stock</span>;
  if (n <= 10) return <span className="badge badge--low">{n} Low</span>;
  return <span className="badge badge--in">{n}</span>;
};

// ── Toast ────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
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

// ── Product Drawer ───────────────────────────────────────────
const EMPTY_FORM = {
  name: '', price: '', description: '',
  unit: 'pcs', stock: '', category: '', gst_rate: '0',
};

function ProductDrawer({ open, onClose, onSave, initial, columns }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // Two-stage open: mounted puts element in DOM, visible triggers CSS transition.
  // The rAF gap gives the browser one paint frame so the transition actually
  // runs smoothly instead of jumping straight to the end state.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
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
      setForm(initial ? {
        name:        initial.name        || '',
        price:       initial.price       ?? '',
        description: initial.description || '',
        unit:        initial.unit        || 'pcs',
        stock:       initial.stock       ?? '',
        category:    initial.category    || '',
        gst_rate:    initial.gst_rate    ?? '0',
      } : EMPTY_FORM);
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  // Price with GST preview
  const priceNum   = parseFloat(form.price) || 0;
  const gstNum     = parseFloat(form.gst_rate) || 0;
  const priceWithGst = priceNum + (priceNum * gstNum / 100);

  const has = (col) => columns.includes(col);

  if (!mounted) return null;

  return (
    <>
      <div className={`drawer-overlay ${visible ? 'drawer-overlay--open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${visible ? 'drawer--open' : ''}`}>
        <div className="drawer__header">
          <div>
            <p className="drawer__eyebrow">{initial ? 'Edit' : 'New'}</p>
            <h2 className="drawer__title">{initial ? 'Edit Product' : 'Add Product'}</h2>
          </div>
          <button className="drawer__close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form className="drawer__form" onSubmit={handleSubmit}>

          {/* Name */}
          <div className="drawer__field">
            <label>Product Name <span className="req">*</span></label>
            <input ref={nameRef} type="text" placeholder="e.g. Basmati Rice 1kg"
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          {/* Price + Unit row */}
          <div className="drawer__row">
            <div className="drawer__field">
              <label>Price (₹) <span className="req">*</span></label>
              <input type="number" placeholder="0.00" min="0" step="0.01"
                value={form.price} onChange={e => set('price', e.target.value)} required />
            </div>
            {has('unit') && (
              <div className="drawer__field">
                <label>Unit</label>
                <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* GST + Stock row */}
          <div className="drawer__row">
            {has('gst_rate') && (
              <div className="drawer__field">
                <label>GST Rate</label>
                <select value={form.gst_rate} onChange={e => set('gst_rate', e.target.value)}>
                  {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            )}
            {has('stock') && (
              <div className="drawer__field">
                <label>Stock Qty</label>
                <input type="number" placeholder="0" min="0"
                  value={form.stock} onChange={e => set('stock', e.target.value)} />
              </div>
            )}
          </div>

          {/* Category */}
          {has('category') && (
            <div className="drawer__field">
              <label>Category <span className="optional">optional</span></label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">— Select category —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Description */}
          {has('description') && (
            <div className="drawer__field">
              <label>Description <span className="optional">optional</span></label>
              <textarea rows={3} placeholder="Brief product description…"
                value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
          )}

          {/* Price preview */}
          {has('gst_rate') && gstNum > 0 && priceNum > 0 && (
            <div className="drawer__preview">
              <span>Base: {fmt(priceNum)}</span>
              <span className="sep">+</span>
              <span>GST {gstNum}%: {fmt(priceNum * gstNum / 100)}</span>
              <span className="sep">=</span>
              <span className="total">Total: {fmt(priceWithGst)}</span>
            </div>
          )}

          <div className="drawer__actions">
            <button type="button" className="drawer__btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="drawer__btn-save" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [tableColumns, setTableColumns] = useState(['name', 'price']);
  const searchTimer = useRef(null);

  // ── Toast ──
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  // ── Fetch ──
  const fetchProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getProducts(user.uid);
      const safe = Array.isArray(data) ? data : [];
      setProducts(safe);
      if (safe.length > 0) setTableColumns(Object.keys(safe[0]));
    } catch (err) {
      console.error('[Products] fetch:', err);
      toast(`Failed to load: ${getErrMsg(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Search debounced ──
  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q.trim()) { fetchProducts(); return; }
      try {
        const results = await searchProducts(user.uid, q);
        setProducts(Array.isArray(results) ? results : []);
      } catch (err) { toast(`Search failed: ${getErrMsg(err)}`, 'error'); }
    }, 300);
  };

  // ── Sort ──
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Filter + Sort ──
  const filtered = products.filter(p => {
    if (!categoryFilter) return true;
    return p.category === categoryFilter;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // ── Build payload — only send columns that exist ──
  const buildPayload = (form) => {
    const has = (col) => tableColumns.includes(col);
    const payload = {
      name:  form.name.trim(),
      price: parseFloat(form.price) || 0,
    };
    if (has('description') && form.description?.trim()) payload.description = form.description.trim();
    if (has('unit'))        payload.unit     = form.unit || 'pcs';
    if (has('stock'))       payload.stock    = parseInt(form.stock) || 0;
    if (has('category') && form.category)    payload.category = form.category;
    if (has('gst_rate'))    payload.gst_rate = parseFloat(form.gst_rate) || 0;
    return payload;
  };

  // ── Save ──
  const handleSave = async (form) => {
    try {
      const payload = buildPayload(form);
      console.log('[Products] saving:', payload);
      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        toast('Product updated successfully.');
      } else {
        await addProduct(user.uid, payload);
        toast('Product added successfully.');
      }
      setDrawerOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      console.error('[Products] save error:', err);
      toast(`Save failed: ${getErrMsg(err)}`, 'error');
    }
  };

  const openAdd  = () => { setEditingProduct(null); setDrawerOpen(true); };
  const openEdit = (p) => { setEditingProduct(p);   setDrawerOpen(true); };

  // ── Delete ──
  const confirmDelete = async () => {
    try {
      if (selectedIds.size > 1) {
        await Promise.all([...selectedIds].map(id => deleteProduct(id)));
        toast(`${selectedIds.size} products deleted.`);
        setSelectedIds(new Set());
      } else {
        await deleteProduct(deleteTarget);
        toast('Product deleted.');
      }
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) { toast(`Delete failed: ${getErrMsg(err)}`, 'error'); }
  };

  // ── Select ──
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === sorted.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map(p => p.id)));
  };

  // ── Sort icon ──
  const SortIcon = ({ col }) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ opacity: sortKey === col ? 1 : 0.3, marginLeft: 4, verticalAlign: 'middle',
        transform: sortKey === col && sortDir === 'desc' ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.2s' }}>
      <polyline points="18,15 12,9 6,15"/>
    </svg>
  );

  // ── Stats ──
  const has = (col) => tableColumns.includes(col);
  const totalValue     = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const totalStock     = has('stock') ? products.reduce((s, p) => s + (Number(p.stock) || 0), 0) : null;
  const lowStockCount  = has('stock') ? products.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 10).length : null;
  const categories     = has('category') ? [...new Set(products.map(p => p.category).filter(Boolean))] : [];
  const avgPrice       = products.length ? totalValue / products.length : 0;

  return (
    <div className="products">
      <Toast toasts={toasts} />
      <ConfirmDialog
        open={!!deleteTarget || selectedIds.size > 1}
        message={selectedIds.size > 1
          ? `Delete ${selectedIds.size} selected products? This cannot be undone.`
          : 'Delete this product? This cannot be undone.'}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteTarget(null); setSelectedIds(new Set()); }}
      />
      <ProductDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingProduct(null); }}
        onSave={handleSave}
        initial={editingProduct}
        columns={tableColumns}
      />

      {/* ── Header ── */}
      <header className="products__header">
        <div>
          <p className="products__eyebrow">Catalogue</p>
          <h1 className="products__title">Products</h1>
        </div>
        <button className="products__add-btn" onClick={openAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Product
        </button>
      </header>

      {/* ── Stats ── */}
      <div className="products__stats">
        <div className="pstat">
          <p className="pstat__label">Total Products</p>
          <p className="pstat__value">{products.length}</p>
        </div>
        <div className="pstat">
          <p className="pstat__label">Avg Price</p>
          <p className="pstat__value">{fmt(avgPrice)}</p>
        </div>
        {has('stock') && (
          <div className="pstat">
            <p className="pstat__label">Total Stock</p>
            <p className="pstat__value">{totalStock?.toLocaleString()}</p>
          </div>
        )}
        {has('stock') && (
          <div className={`pstat ${lowStockCount > 0 ? 'pstat--warn' : ''}`}>
            <p className="pstat__label">Low Stock</p>
            <p className="pstat__value">{lowStockCount}</p>
          </div>
        )}
        {!has('stock') && (
          <div className="pstat">
            <p className="pstat__label">Categories</p>
            <p className="pstat__value">{categories.length || '—'}</p>
          </div>
        )}
        {!has('stock') && (
          <div className="pstat">
            <p className="pstat__label">Catalogue Value</p>
            <p className="pstat__value">{fmt(totalValue)}</p>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="products__toolbar">
        <div className="products__search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="products__search"
            type="text"
            placeholder="Search products by name…"
            value={search}
            onChange={handleSearch}
          />
          {search && (
            <button className="products__search-clear" onClick={() => { setSearch(''); fetchProducts(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Category filter */}
        {has('category') && categories.length > 0 && (
          <select className="products__filter-select"
            value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <div className="products__toolbar-right">
          {selectedIds.size > 0 && (
            <button className="products__bulk-delete" onClick={() => setDeleteTarget('bulk')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M9,6V4h6v2"/>
              </svg>
              Delete {selectedIds.size}
            </button>
          )}
          <span className="products__count">
            {sorted.length} {sorted.length === 1 ? 'product' : 'products'}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="products__table-wrap">
        {loading ? (
          <div className="products__loading">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="products__skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="products__empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <p>{search ? 'No products match your search.' : 'No products yet. Add your first one.'}</p>
            {!search && <button className="products__add-btn" onClick={openAdd}>Add Product</button>}
          </div>
        ) : (
          <table className="products__table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="col-sortable" onClick={() => handleSort('name')}>
                  Product <SortIcon col="name" />
                </th>
                {has('category') && <th>Category</th>}
                <th className="col-sortable" onClick={() => handleSort('price')}>
                  Price <SortIcon col="price" />
                </th>
                {has('unit')     && <th>Unit</th>}
                {has('gst_rate') && <th>GST</th>}
                {has('stock')    && (
                  <th className="col-sortable" onClick={() => handleSort('stock')}>
                    Stock <SortIcon col="stock" />
                  </th>
                )}
                <th className="col-sortable" onClick={() => handleSort('created_at')}>
                  Added <SortIcon col="created_at" />
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const priceNum  = Number(p.price) || 0;
                const gstRate   = Number(p.gst_rate) || 0;
                const priceGst  = priceNum + (priceNum * gstRate / 100);
                return (
                  <tr
                    key={p.id}
                    className={selectedIds.has(p.id) ? 'row--selected' : ''}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <td className="col-check">
                      <input type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td>
                      <div className="product-cell">
                        <div className="product-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="product-name">{p.name}</p>
                          {has('description') && p.description && (
                            <p className="product-desc">{p.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {has('category') && (
                      <td>
                        {p.category
                          ? <span className="category-badge">{p.category}</span>
                          : <span className="cell-empty">—</span>}
                      </td>
                    )}
                    <td>
                      <div className="price-cell">
                        <span className="price-base">{fmt(priceNum)}</span>
                        {has('gst_rate') && gstRate > 0 && (
                          <span className="price-gst">+GST → {fmt(priceGst)}</span>
                        )}
                      </div>
                    </td>
                    {has('unit')     && <td className="cell-unit">{p.unit || 'pcs'}</td>}
                    {has('gst_rate') && <td className="cell-gst">{gstRate > 0 ? `${gstRate}%` : <span className="cell-empty">0%</span>}</td>}
                    {has('stock')    && <td><StockBadge stock={p.stock} /></td>}
                    <td className="cell-date">{fmtDate(p.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="action-btn action-btn--edit" onClick={() => openEdit(p)} title="Edit">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="action-btn action-btn--delete" onClick={() => setDeleteTarget(p.id)} title="Delete">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19,6l-1,14H6L5,6"/>
                            <path d="M9,6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}