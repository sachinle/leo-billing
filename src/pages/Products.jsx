import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from '../services/productService';
import { getStockEnabled } from './Settings';
import { uploadProductImage, deleteProductImage } from '../services/productImageService';
import { formatBytes } from '../utils/imageCompress';
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

// Storefront categories — used only by the public website, kept separate
// from the billing `category` above so existing invoices/filters are
// unaffected.
const WEBSITE_CATEGORIES = [
  'Ice Cakes', 'Regular Cakes', 'Bento Cakes', 'Cup Cakes',
  'Brownies', 'Tea Cakes', 'Biscuits', 'Chocolates', 'Other',
];

// Common HSN codes for a home bakery. Free text is still allowed —
// this is a convenience list, not a restriction.
const HSN_SUGGESTIONS = [
  { code: '1905', label: '1905 — Bakery: cakes, biscuits, pastries' },
  { code: '1806', label: '1806 — Chocolate & cocoa preparations' },
  { code: '2106', label: '2106 — Other food preparations' },
];

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
  // ── Tax / inventory ──
  hsn_code: '', track_stock: false, low_stock_threshold: '5',
  // ── Website fields ──
  is_published: false, is_featured: false,
  slug: '', short_description: '', website_category: '',
  variants: [], image_url: '', image_path: '',
};

function ProductDrawer({ open, onClose, onSave, initial, columns }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [uploadError, setUploadError] = useState('');
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
        hsn_code:            initial.hsn_code            || '',
        track_stock:         initial.track_stock         ?? false,
        low_stock_threshold: initial.low_stock_threshold ?? '5',
        is_published:        initial.is_published        ?? false,
        is_featured:         initial.is_featured         ?? false,
        slug:                initial.slug                || '',
        short_description:   initial.short_description   || '',
        website_category:    initial.website_category    || '',
        variants:   Array.isArray(initial.variants) ? initial.variants : [],
        image_url:  initial.image_url  || '',
        image_path: initial.image_path || '',
      } : EMPTY_FORM);
      setUploadNote('');
      setUploadError('');
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

  // ── Product photo (website) ──
  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;

    setUploadError('');
    setUploadNote('');
    setUploading(true);
    try {
      const res = await uploadProductImage(file);
      const oldPath = form.image_path;
      set('image_url', res.publicUrl);
      set('image_path', res.path);
      setUploadNote(
        `Optimised ${formatBytes(res.originalBytes)} → ${formatBytes(res.compressedBytes)}`
      );
      // Clean up the replaced file so storage doesn't fill with orphans.
      if (oldPath) deleteProductImage(oldPath).catch(() => {});
    } catch (err) {
      setUploadError(getErrMsg(err));
    } finally {
      setUploading(false);
    }
  };

  const handleImageRemove = () => {
    const oldPath = form.image_path;
    set('image_url', '');
    set('image_path', '');
    setUploadNote('');
    if (oldPath) deleteProductImage(oldPath).catch(() => {});
  };

  // ── Website size options ──
  const addVariant    = () => set('variants', [...form.variants, { label: '', price: '' }]);
  const removeVariant = (i) => set('variants', form.variants.filter((_, idx) => idx !== i));
  const setVariant    = (i, key, val) =>
    set('variants', form.variants.map((v, idx) => (idx === i ? { ...v, [key]: val } : v)));

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

          {/* ── Tax & inventory ────────────────────────────── */}
          {(has('hsn_code') || has('track_stock')) && (
            <div className="drawer__section">
              <p className="drawer__section-title">Tax &amp; Inventory</p>

              {has('hsn_code') && (
                <div className="drawer__field">
                  <label>HSN Code <span className="optional">for GST invoices</span></label>
                  <input type="text" list="hsn-list" placeholder="e.g. 1905"
                    value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} />
                  <datalist id="hsn-list">
                    {HSN_SUGGESTIONS.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
                  </datalist>
                </div>
              )}

              {has('track_stock') && (
                <>
                  <label className="drawer__check">
                    <input type="checkbox" checked={!!form.track_stock}
                      onChange={e => set('track_stock', e.target.checked)} />
                    <span>
                      Track stock for this product
                      <em>Invoicing it will reduce the stock count. Leave off for made-to-order cakes.</em>
                    </span>
                  </label>

                  {form.track_stock && (
                    <div className="drawer__field">
                      <label>Low stock warning at</label>
                      <input type="number" min="0" placeholder="5"
                        value={form.low_stock_threshold}
                        onChange={e => set('low_stock_threshold', e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Website ────────────────────────────────────── */}
          {has('is_published') && (
            <div className="drawer__section">
              <p className="drawer__section-title">Website</p>

              <label className="drawer__check">
                <input type="checkbox" checked={!!form.is_published}
                  onChange={e => {
                    const on = e.target.checked;
                    set('is_published', on);
                    // Generate a URL slug on first publish if empty.
                    if (on && !form.slug && form.name) set('slug', slugify(form.name));
                  }} />
                <span>
                  Show this product on the website
                  <em>Off by default. Delivery charges, toppers and test items should stay off.</em>
                </span>
              </label>

              {form.is_published && (
                <>
                  <label className="drawer__check">
                    <input type="checkbox" checked={!!form.is_featured}
                      onChange={e => set('is_featured', e.target.checked)} />
                    <span>Feature on the homepage</span>
                  </label>

                  {/* Photo */}
                  <div className="drawer__field">
                    <label>Product Photo</label>
                    {form.image_url ? (
                      <div className="img-preview">
                        <img src={form.image_url} alt="" />
                        <button type="button" className="img-preview__remove"
                          onClick={handleImageRemove}>Remove</button>
                      </div>
                    ) : (
                      <p className="drawer__hint">No photo yet — the website will show a placeholder.</p>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp"
                      disabled={uploading} onChange={handleImagePick} />
                    {uploading  && <p className="drawer__hint">Optimising and uploading…</p>}
                    {uploadNote && <p className="drawer__hint drawer__hint--ok">{uploadNote}</p>}
                    {uploadError && <p className="drawer__hint drawer__hint--err">{uploadError}</p>}
                  </div>

                  <div className="drawer__field">
                    <label>Website Category</label>
                    <select value={form.website_category}
                      onChange={e => set('website_category', e.target.value)}>
                      <option value="">— Select —</option>
                      {WEBSITE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="drawer__field">
                    <label>Short Description <span className="optional">shown under the name</span></label>
                    <input type="text" maxLength={140} placeholder="e.g. Fresh cream, layered with black currant"
                      value={form.short_description}
                      onChange={e => set('short_description', e.target.value)} />
                  </div>

                  <div className="drawer__field">
                    <label>Page URL</label>
                    <input type="text" placeholder="black-currant-ice-cake"
                      value={form.slug} onChange={e => set('slug', slugify(e.target.value))} />
                    <p className="drawer__hint">/cakes/{form.slug || '…'}</p>
                  </div>

                  {/* Sizes the customer can choose */}
                  <div className="drawer__field">
                    <label>Sizes &amp; Prices <span className="optional">what the customer actually pays</span></label>
                    {form.variants.length === 0 && (
                      <p className="drawer__hint">
                        No sizes added — the website shows the single price above.
                      </p>
                    )}
                    {form.variants.map((v, i) => (
                      <div className="variant-row" key={i}>
                        <input type="text" placeholder="1 kg"
                          value={v.label} onChange={e => setVariant(i, 'label', e.target.value)} />
                        <input type="number" min="0" step="0.01" placeholder="800"
                          value={v.price} onChange={e => setVariant(i, 'price', e.target.value)} />
                        <button type="button" className="variant-row__remove"
                          onClick={() => removeVariant(i)} aria-label="Remove size">×</button>
                      </div>
                    ))}
                    <button type="button" className="variant-add" onClick={addVariant}>
                      + Add a size
                    </button>
                  </div>
                </>
              )}
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
  const stockEnabled = getStockEnabled();
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
    const has = (col) => tableColumns.includes(col); // for payload: always include stock if column exists
    const payload = {
      name:  form.name.trim(),
      price: parseFloat(form.price) || 0,
    };
    if (has('description') && form.description?.trim()) payload.description = form.description.trim();
    if (has('unit'))        payload.unit     = form.unit || 'pcs';
    if (has('stock'))       payload.stock    = parseInt(form.stock) || 0;
    if (has('category') && form.category)    payload.category = form.category;
    if (has('gst_rate'))    payload.gst_rate = parseFloat(form.gst_rate) || 0;

    // ── Tax / inventory ──
    if (has('hsn_code'))    payload.hsn_code    = form.hsn_code?.trim() || null;
    if (has('track_stock')) payload.track_stock = !!form.track_stock;
    if (has('low_stock_threshold')) {
      payload.low_stock_threshold = parseInt(form.low_stock_threshold) || 5;
    }

    // ── Website ──
    if (has('is_published')) payload.is_published = !!form.is_published;
    if (has('is_featured'))  payload.is_featured  = !!form.is_featured;
    if (has('slug'))              payload.slug              = form.slug?.trim() || null;
    if (has('short_description')) payload.short_description = form.short_description?.trim() || null;
    if (has('website_category'))  payload.website_category  = form.website_category || null;
    if (has('image_url'))         payload.image_url         = form.image_url  || null;
    if (has('image_path'))        payload.image_path        = form.image_path || null;
    if (has('variants')) {
      // Drop incomplete rows and coerce prices, so the website never
      // receives a size with a blank or non-numeric price.
      payload.variants = (form.variants || [])
        .filter(v => String(v.label).trim() && v.price !== '' && v.price !== null)
        .map(v => ({ label: String(v.label).trim(), price: parseFloat(v.price) || 0 }));
    }
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
  // has() respects the stock toggle from Settings
  const has = (col) => {
    if (col === 'stock' && !stockEnabled) return false;
    return tableColumns.includes(col);
  };
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
                          <p className="product-name">
                            {p.name}
                            {p.is_published && <span className="badge badge--live">Live</span>}
                          </p>
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