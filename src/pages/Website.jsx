import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getWebsiteOrders, setOrderStatus, deleteOrder,
  getPincodes, addPincode, updatePincode, deletePincode,
  getStoreSettings, setStoreOpen,
  getWebsiteStats,
} from '../services/websiteService';
import './Website.css';

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_API_URL || 'http://localhost:3000';

const ORDER_STATUSES = [
  'received', 'confirmed', 'preparing', 'ready',
  'out_for_delivery', 'completed', 'cancelled',
];

const STATUS_LABELS = {
  received: 'Request received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const getErrMsg = (e) => e?.message || String(e) || 'Something went wrong';

const fmt = (n) =>
  typeof n === 'number' && isFinite(n)
    ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : '—';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Toast ────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}






// ── Orders tab ───────────────────────────────────────────────
function OrdersTab({ toast }) {
  const navigate = useNavigate();
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup]     = useState('active');

  // Hands the order over to the normal Create Invoice screen, pre-filled.
  // Nothing is saved here — the owner still reviews, edits, adds delivery
  // or extra charges, and saves through the usual billing flow.
  const makeInvoice = (o) => {
    // Basket orders carry their cakes in order_items. Older single-cake
    // orders fall back to the columns on the order row itself.
    const lines = (o.order_items && o.order_items.length > 0)
      ? o.order_items
      : [{
          product_id:    o.product_id,
          product_name:  o.product_name,
          variant_label: o.variant_label,
          unit_price:    o.unit_price,
          quantity:      o.quantity,
          colour:        (o.variant || {}).colour,
          cake_message:  o.cake_message,
        }];

    navigate('/create-invoice', {
      state: {
        fromOrder: {
          orderId: o.id,
          orderNo: o.order_no,
          customerName: o.contact_name,
          customerPhone: o.contact_phone,
          items: lines.map(li => {
            const descriptors = [li.variant_label, li.colour].filter(Boolean).join(', ');
            const qty   = Number(li.quantity)   || 1;
            const price = Number(li.unit_price) || 0;
            return {
              product_id: li.product_id || null,
              product_name: descriptors
                ? `${li.product_name} (${descriptors})`
                : li.product_name,
              isNewProduct: false,
              quantity: qty,
              unit: 'piece',
              price,
              discount: 0,
              total: price * qty,
            };
          }),
        },
      },
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await getWebsiteOrders()); }
    catch (e) { toast(`Couldn't load orders: ${getErrMsg(e)}`, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    try {
      const res = await setOrderStatus(id, status);
      setOrders(os => os.map(o => (o.id === id ? { ...o, status } : o)));
      // Say plainly whether the customer was emailed, rather than
      // leaving the owner to wonder.
      toast(
        res?.emailed
          ? `Marked "${STATUS_LABELS[status]}" — customer emailed.`
          : `Marked "${STATUS_LABELS[status]}" — the customer sees this on their order page.`
      );
    } catch (e) { toast(`Failed: ${getErrMsg(e)}`, 'error'); }
  };

  const removeOrder = async (o) => {
    const warning = o.invoice_id
      ? `Delete order ${o.order_no}?\n\nIt disappears from the customer's account. The bill stays in your Invoices — delete that separately if you want it gone too.`
      : `Delete order ${o.order_no}? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    try {
      await deleteOrder(o.id);
      setOrders(os => os.filter(x => x.id !== o.id));
      toast('Order deleted.');
    } catch (e) { toast(getErrMsg(e), 'error'); }
  };

  // Grouped rather than one long list: what the owner needs to act on
  // first is "new", and finished orders shouldn't be in the way.
  const GROUPS = [
    { id: 'active',    label: 'Needs action', match: s => ['received', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(s) },
    { id: 'completed', label: 'Completed',    match: s => s === 'completed' },
    { id: 'cancelled', label: 'Cancelled',    match: s => s === 'cancelled' },
  ];

  const visible = orders.filter(o =>
    GROUPS.find(g => g.id === group)?.match(o.status)
  );

  if (loading) return <p className="web__loading">Loading…</p>;
  if (orders.length === 0) {
    return <p className="web__empty">No website orders yet.</p>;
  }

  return (
    <div className="web__stack">
      <div className="web__subtabs">
        {GROUPS.map(g => {
          const count = orders.filter(o => g.match(o.status)).length;
          return (
            <button
              key={g.id}
              className={`web__subtab${group === g.id ? ' web__subtab--active' : ''}`}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
              <span className="web__subtab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="web__empty">Nothing here right now.</p>
      )}
      {visible.map(o => {
        const v = o.variant || {};
        const address = [o.address, o.landmark, o.city, o.pincode].filter(Boolean).join(', ');
        return (
          <div className="web__card" key={o.id}>
            <div className="web__card--row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="web__item-title">
                  {o.product_name}
                  {o.variant_label && <span className="web__badge">{o.variant_label}</span>}
                  {o.quantity > 1 && <span className="web__badge">× {o.quantity}</span>}
                </p>
                <p className="web__item-sub">
                  {o.order_no} · {o.contact_name} ·{' '}
                  <a href={`tel:${String(o.contact_phone || '').replace(/[^\d+]/g, '')}`}>
                    {o.contact_phone}
                  </a>
                </p>

                {o.estimated_total != null && (
                  <p className="web__order-price">
                    {fmt(Number(o.estimated_total))}
                    {o.unit_price != null && o.quantity > 1 && (
                      <span className="web__item-meta"> ({fmt(Number(o.unit_price))} each)</span>
                    )}
                  </p>
                )}

                <p className="web__item-meta">
                  {o.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup'}
                  {o.preferred_date && ` · ${fmtDate(o.preferred_date)}`}
                  {o.preferred_time && ` · ${o.preferred_time}`}
                </p>

                {/* Each cake in a basket order, with its own message */}
                {o.order_items && o.order_items.length > 0 ? (
                  <ul className="web__order-lines">
                    {o.order_items.map(li => (
                      <li key={li.id}>
                        <strong>{li.quantity} ×</strong> {li.product_name}
                        {li.variant_label && ` · ${li.variant_label}`}
                        {li.colour && ` · ${li.colour}`}
                        {li.cake_message && (
                          <em> — “{li.cake_message}”</em>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {v.colour && <p className="web__item-meta">{v.colour}</p>}
                    {o.cake_message && (
                      <p className="web__item-meta">On the cake: “{o.cake_message}”</p>
                    )}
                  </>
                )}
                {o.special_instructions && (
                  <p className="web__item-meta">Notes: {o.special_instructions}</p>
                )}

                {o.fulfillment_type === 'delivery' && (
                  <p className="web__item-meta">
                    {address || 'No address given'}
                    {o.latitude && o.longitude && (
                      <>
                        {' · '}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          Open exact location ↗
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="web__item-actions web__item-actions--stack">
                <select value={o.status} onChange={e => changeStatus(o.id, e.target.value)}>
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                {o.invoice_id ? (
                  <Link className="web__btn" to={`/invoices/view/${o.invoice_id}`}>
                    View Bill
                  </Link>
                ) : (
                  <button className="web__btn web__btn--primary" onClick={() => makeInvoice(o)}>
                    Make Invoice
                  </button>
                )}
                <button className="web__btn web__btn--danger" onClick={() => removeOrder(o)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Delivery areas tab ───────────────────────────────────────
function DeliveryTab({ toast }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ pincode: '', area_name: '', delivery_fee: '' });
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getPincodes()); }
    catch (e) { toast(`Couldn't load areas: ${getErrMsg(e)}`, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.pincode.trim())) {
      toast('Pincode must be 6 digits.', 'error');
      return;
    }
    setSaving(true);
    try {
      await addPincode(form);
      setForm({ pincode: '', area_name: '', delivery_fee: '' });
      toast('Delivery area added.');
      load();
    } catch (err) { toast(getErrMsg(err), 'error'); }
    finally { setSaving(false); }
  };

  const toggle = async (r) => {
    try {
      await updatePincode(r.id, { is_active: !r.is_active });
      setRows(rs => rs.map(x => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (e) { toast(getErrMsg(e), 'error'); }
  };

  const remove = async (r) => {
    try {
      await deletePincode(r.id);
      setRows(rs => rs.filter(x => x.id !== r.id));
      toast('Area removed.');
    } catch (e) { toast(getErrMsg(e), 'error'); }
  };

  return (
    <div className="web__stack">
      <p className="web__note">
        Customers can only choose delivery if their pincode is listed and
        switched on here. Everyone else is asked to collect, or to arrange
        their own courier.
      </p>

      <form className="web__card" onSubmit={add}>
        <div className="web__row">
          <div>
            <label className="web__label">Pincode</label>
            <input type="text" inputMode="numeric" maxLength={6} placeholder="641032"
              value={form.pincode}
              onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }))} />
          </div>
          <div>
            <label className="web__label">Area name <span className="web__opt">optional</span></label>
            <input type="text" placeholder="Saravanampatti"
              value={form.area_name}
              onChange={e => setForm(f => ({ ...f, area_name: e.target.value }))} />
          </div>
          <div>
            <label className="web__label">Delivery fee <span className="web__opt">optional</span></label>
            <input type="number" min="0" step="1" placeholder="0"
              value={form.delivery_fee}
              onChange={e => setForm(f => ({ ...f, delivery_fee: e.target.value }))} />
          </div>
        </div>
        <div className="web__card-actions">
          <button type="submit" className="web__btn web__btn--primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add Area'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="web__loading">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="web__empty">
          No delivery areas yet — customers will only be offered pickup.
        </p>
      ) : (
        rows.map(r => (
          <div className="web__card web__card--row" key={r.id}>
            <div>
              <p className="web__item-title">
                {r.pincode}
                <span className={`web__badge ${r.is_active ? 'web__badge--live' : ''}`}>
                  {r.is_active ? 'Delivering' : 'Paused'}
                </span>
              </p>
              {r.area_name && <p className="web__item-sub">{r.area_name}</p>}
              {Number(r.delivery_fee) > 0 && (
                <p className="web__item-meta">Delivery fee {fmt(Number(r.delivery_fee))}</p>
              )}
            </div>
            <div className="web__item-actions">
              <button className="web__btn" onClick={() => toggle(r)}>
                {r.is_active ? 'Pause' : 'Resume'}
              </button>
              <button className="web__btn web__btn--danger" onClick={() => remove(r)}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Store open / closed ──────────────────────────────────────
// A single switch that stops the website taking orders. Used when the
// kitchen is full, on holiday, or simply closed for the day — better
// than silently receiving requests nobody is going to bake.
function StoreToggle({ toast }) {
  const [store, setStore]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStoreSettings().then(setStore).catch(() => {});
  }, []);

  const toggle = async () => {
    if (!store) return;
    const next = !store.accepting_orders;
    setSaving(true);
    try {
      await setStoreOpen(next, store.offline_message || '');
      setStore(s => ({ ...s, accepting_orders: next }));
      toast(next
        ? 'Store is open — the website is taking orders.'
        : 'Store is closed — the website will not take new orders.');
    } catch (e) {
      toast(getErrMsg(e), 'error');
    } finally { setSaving(false); }
  };

  if (!store) return null;
  const open = store.accepting_orders;

  return (
    <div className={`web__store${open ? '' : ' web__store--closed'}`}>
      <div>
        <p className="web__store-title">
          <span className={`web__dot${open ? ' web__dot--on' : ''}`} />
          {open ? 'Open — taking orders' : 'Closed — not taking orders'}
        </p>
        <p className="web__store-sub">
          {open
            ? 'Customers can place orders on the website right now.'
            : 'The website shows a "not taking orders" notice instead of the order buttons.'}
        </p>
      </div>
      <button
        className={`web__btn${open ? ' web__btn--danger' : ' web__btn--primary'}`}
        onClick={toggle}
        disabled={saving}
      >
        {saving ? 'Saving…' : open ? 'Close Store' : 'Open Store'}
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
const TABS = [
  { id: 'orders',   label: 'Orders' },
  { id: 'delivery', label: 'Delivery Areas' },
];

export default function Website() {
  const [tab, setTab]       = useState('orders');
  const [toasts, setToasts] = useState([]);
  const [stats, setStats]   = useState(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    getWebsiteStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="web">
      <Toast toasts={toasts} />

      <header className="web__header">
        <div>
          <p className="web__eyebrow">Control</p>
          <h1 className="web__title">Website</h1>
        </div>
        <a className="web__btn" href={WEBSITE_URL} target="_blank" rel="noopener noreferrer">
          View site ↗
        </a>
      </header>

      <StoreToggle toast={toast} />

      {stats && (
        <div className="web__stats">
          <div className="web__stat">
            <p className="web__stat-label">Cakes Live</p>
            <p className="web__stat-value">{stats.publishedProducts}</p>
          </div>
          <div className="web__stat">
            <p className="web__stat-label">Website Orders</p>
            <p className="web__stat-value">{stats.totalOrders}</p>
          </div>
          <div className="web__stat">
            <p className="web__stat-label">Registered Customers</p>
            <p className="web__stat-value">{stats.registeredUsers}</p>
          </div>
        </div>
      )}

      <nav className="web__tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`web__tab${tab === t.id ? ' web__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="web__body">
        {tab === 'orders'   && <OrdersTab   toast={toast} />}
        {tab === 'delivery' && <DeliveryTab toast={toast} />}
      </div>
    </div>
  );
}
