import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchCustomers } from '../services/customerService';
import { useAuth } from '../hooks/useAuth';
import ProductSearch from './ProductSearch';

const UNITS = [
  'piece','nos','kg','gm','litre','ml',
  'dozen','pack','box','bag','bundle',
  'carton','meter','set','bottle','can',
  'plate','cup','pkt','item',
];

/* ── Mobile item card — redesigned for smooth 1-thumb billing ─────── */
function MobileItemCard({ item, idx, onUpdate, onRemove, onSelect, onNew }) {
  const updateField = (field, val) => onUpdate(idx, field, val);
  const total = parseFloat(item.total) || 0;
  const price = parseFloat(item.price) || 0;
  const qty   = parseFloat(item.quantity) || 0;


  return (
    <div className="ci__item-card">
      {/* ── Header: item # + running total ── */}
      <div className="ci__item-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ci__item-card-num">#{idx + 1}</span>
          {item.product_name && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted,#6b6887)', fontFamily: 'DM Sans', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.product_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ci__item-card-total">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <button
            className="ci__item-card-remove-icon"
            onClick={() => onRemove(idx)}
            style={{
              background: 'rgba(224,112,112,0.1)', border: '1px solid rgba(224,112,112,0.2)',
              color: '#e07070', borderRadius: 7, padding: '5px 7px', cursor: 'pointer', lineHeight: 0,
            }}
            title="Remove item"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Product search — full width ── */}
      <div className="ci__item-card-field ci__item-card-field--full" style={{ marginBottom: 8 }}>
        <label>Product / Item</label>
        <ProductSearch
          currentValue={item.product_name}
          onSelect={(product) => onSelect(idx, product)}
          onNewProduct={(name) => onNew(idx, name)}
          onChange={(val) => updateField('product_name', val)}
        />
      </div>

      {/* ── Price row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div className="ci__item-card-field">
          <label>Price (₹)</label>
          <input
            type="number" inputMode="decimal"
            value={item.price}
            onChange={e => updateField('price', e.target.value)}
            min="0" step="0.01" placeholder="0.00"
            style={{ fontSize: '1rem', fontWeight: 600 }}
          />
        </div>
        <div className="ci__item-card-field">
          <label>Discount (₹)</label>
          <input
            type="number" inputMode="decimal"
            value={item.discount}
            onChange={e => updateField('discount', e.target.value)}
            min="0" step="0.01" placeholder="0.00"
          />
        </div>
      </div>

      {/* ── Quantity + Unit row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="ci__item-card-field">
          <label>Quantity</label>
          <input
            type="number" inputMode="decimal"
            value={item.quantity}
            onChange={e => updateField('quantity', e.target.value)}
            min="0" step="any" placeholder="1"
          />
        </div>
        <div className="ci__item-card-field">
          <label>Unit</label>
          <select
            value={item.unit}
            onChange={e => updateField('unit', e.target.value)}
          >
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceForm({ customer, setCustomer, items, setItems, paymentStatus, setPaymentStatus }) {
  const { user } = useAuth();

  const [custQuery, setCustQuery]       = useState('');
  const [custResults, setCustResults]   = useState([]);
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [custDropStyle, setCustDropStyle] = useState({});
  const custInputRef  = useRef();
  const custDropRef   = useRef();
  const custTimer     = useRef();
  const custBlurTimer = useRef();
  const custRafRef    = useRef();
  const custIsOpen    = useRef(false);

  const calcCustPos = useCallback(() => {
    if (!custInputRef.current || !custIsOpen.current) return;
    const rect = custInputRef.current.getBoundingClientRect();
    const vpH  = window.innerHeight;
    const DROP_H = 260;
    const GAP = 4;
    const spaceBelow = vpH - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUp = spaceBelow < DROP_H && spaceAbove > spaceBelow;
    setCustDropStyle({
      position: 'fixed',
      left:  rect.left,
      width: Math.max(rect.width, 260),
      zIndex: 99999,
      ...(openUp
        ? { bottom: vpH - rect.top + GAP, top: 'auto',         maxHeight: Math.min(spaceAbove, DROP_H) }
        : { top:    rect.bottom + GAP,    bottom: 'auto',       maxHeight: Math.min(spaceBelow, DROP_H) }
      ),
    });
  }, []);

  // RAF loop to keep dropdown anchored even while page scrolls
  useEffect(() => {
    if (!showCustDrop) { custIsOpen.current = false; return; }
    custIsOpen.current = true;
    const tick = () => { calcCustPos(); custRafRef.current = requestAnimationFrame(tick); };
    custRafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(custRafRef.current); custIsOpen.current = false; };
  }, [showCustDrop, calcCustPos]);

  // Debounced customer search
  useEffect(() => {
    clearTimeout(custTimer.current);
    if (!custQuery.trim() || !user) { setCustResults([]); return; }
    custTimer.current = setTimeout(async () => {
      try {
        const res = await searchCustomers(user.uid, custQuery);
        setCustResults(Array.isArray(res) ? res : []);
      } catch { setCustResults([]); }
    }, 280);
    return () => clearTimeout(custTimer.current);
  }, [custQuery, user]);

  // Close on outside click only (scroll is handled by RAF position tracker)
  useEffect(() => {
    if (!showCustDrop) return;
    const onMouseDown = (e) => {
      if (custDropRef.current?.contains(e.target)) return;
      if (custInputRef.current?.contains(e.target)) return;
      setShowCustDrop(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showCustDrop]);

  const handleCustNameChange = (e) => {
    const val = e.target.value;
    setCustomer(c => ({ ...c, name: val, id: null, isExisting: false }));
    setCustQuery(val);
    setShowCustDrop(true);
  };

  const selectCustomer = (c) => {
    clearTimeout(custBlurTimer.current);
    setCustomer({ name: c.name, phone: c.phone || '', id: c.id, isExisting: true });
    setCustQuery(c.name);
    setShowCustDrop(false);
  };

  const handleCustBlur = () => {
    custBlurTimer.current = setTimeout(() => setShowCustDrop(false), 200);
  };

  const showCustNew  = custQuery.trim().length > 0
    && custResults.every(c => c.name.toLowerCase() !== custQuery.trim().toLowerCase());
  const shouldShowCustDrop = showCustDrop && (custResults.length > 0 || showCustNew);

  // ── Item operations ─────────────────────────────────────────────────
  const addItem = () => {
    setItems(prev => [...prev, {
      product_id: null, product_name: '', isNewProduct: false,
      quantity: 1, unit: 'piece', price: 0, discount: 0, total: 0,
    }]);
  };

  const updateItem = (idx, field, rawValue) => {
    setItems(prev => {
      const updated = [...prev];
      const item  = { ...updated[idx], [field]: rawValue };
      const qty   = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price)    || 0;
      const disc  = parseFloat(item.discount) || 0;
      item.total  = Math.max(0, (qty * price) - disc);
      updated[idx] = item;
      return updated;
    });
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleProductSelect = (idx, product) => {
    setItems(prev => {
      const updated = [...prev];
      const qty  = parseFloat(updated[idx].quantity) || 1;
      const disc = parseFloat(updated[idx].discount) || 0;
      updated[idx] = {
        ...updated[idx],
        product_id:   product.id,
        product_name: product.name,
        price:        Number(product.price) || 0,
        unit:         product.unit || updated[idx].unit || 'piece',
        isNewProduct: false,
        total: Math.max(0, (qty * (Number(product.price) || 0)) - disc),
      };
      return updated;
    });
  };

  const handleNewProduct = (idx, name) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], product_name: name, product_id: null, isNewProduct: true };
      return updated;
    });
  };

  return (
    <div>
      {/* ── Customer Card ── */}
      <div className="ci__card">
        <div className="ci__card-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <h3>Bill To</h3>
        </div>
        <div className="ci__card-body">
          <div className="ci__customer-row">
            {/* Customer name with autocomplete */}
            <div className="ci__field">
              <label>Customer Name <span className="req">*</span></label>
              <input
                ref={custInputRef}
                type="text"
                placeholder="Search or enter customer name…"
                value={customer.name}
                onChange={handleCustNameChange}
                onFocus={() => { if (custQuery.trim()) setShowCustDrop(true); }}
                onBlur={handleCustBlur}
                autoComplete="off"
              />
              {shouldShowCustDrop && createPortal(
                <div
                  ref={custDropRef}
                  className="ci__autocomplete"
                  style={custDropStyle}
                  onMouseDown={e => e.preventDefault()}
                >
                  {custResults.map(c => (
                    <div key={c.id} className="ci__autocomplete-item" onMouseDown={() => selectCustomer(c)}>
                      <span className="ci__autocomplete-name">{c.name}</span>
                      <span className="ci__autocomplete-phone">{c.phone}</span>
                    </div>
                  ))}
                  {showCustNew && (
                    <div className="ci__autocomplete-new" onMouseDown={() => {
                      clearTimeout(custBlurTimer.current);
                      setCustomer(c => ({ ...c, name: custQuery.trim(), isExisting: false }));
                      setShowCustDrop(false);
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      New customer: "{custQuery.trim()}"
                    </div>
                  )}
                </div>,
                document.body
              )}
            </div>

            {/* Phone */}
            <div className="ci__field">
              <label>Contact No. <span className="req">*</span></label>
              <input
                type="tel" inputMode="tel"
                placeholder="Phone number"
                value={customer.phone}
                onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
              />
            </div>
          </div>

          {/* Payment Status */}
          <div className="ci__status-row">
            <span className="ci__status-label">Payment Status</span>
            <div className="ci__status-options">
              <label className={`ci__status-opt ci__status-opt--paid${paymentStatus === 'paid' ? ' active' : ''}`}>
                <input type="radio" name="payStatus" value="paid"
                  checked={paymentStatus === 'paid'} onChange={() => setPaymentStatus('paid')} />
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                Paid
              </label>
              <label className={`ci__status-opt ci__status-opt--unpaid${paymentStatus === 'unpaid' ? ' active' : ''}`}>
                <input type="radio" name="payStatus" value="unpaid"
                  checked={paymentStatus === 'unpaid'} onChange={() => setPaymentStatus('unpaid')} />
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Unpaid
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── Items Card ── */}
      <div className="ci__card">
        <div className="ci__card-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <h3>Items</h3>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {items.length > 0 && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 600,
                padding: '2px 8px', borderRadius: 6,
                background: 'rgba(201,169,110,0.1)', color: 'var(--gold,#c9a96e)',
                border: '1px solid rgba(201,169,110,0.2)',
                fontFamily: 'DM Sans, sans-serif',
              }}>
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            )}
            {/* Mobile-only inline Add button in header — always visible */}
            <button
              className="ci__add-item-btn ci__add-item-btn--inline"
              onClick={addItem}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Item
            </button>
          </div>
        </div>
        <div className="ci__card-body">

          {/* ── Desktop table ── */}
          <div className="ci__items-wrap">
            <table className="ci__items-table">
              <thead>
                <tr>
                  <th style={{ width: '28px' }}>#</th>
                  <th style={{ width: '200px' }}>Product</th>
                  <th style={{ width: '72px' }}>Qty</th>
                  <th style={{ width: '90px' }}>Unit</th>
                  <th style={{ width: '100px' }}>Price (₹)</th>
                  <th style={{ width: '90px' }}>Disc. (₹)</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '32px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{
                      textAlign: 'center', padding: '32px',
                      color: 'var(--text-muted,#4e4b63)',
                      fontFamily: 'DM Sans,sans-serif', fontSize: '0.875rem',
                    }}>
                      No items yet — click "Add Item" below
                    </td>
                  </tr>
                )}
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ color:'var(--text-muted,#4e4b63)', fontFamily:'DM Sans', fontSize:'0.78rem', textAlign:'center' }}>
                      {idx + 1}
                    </td>
                    <td>
                      <ProductSearch
                        currentValue={item.product_name}
                        onSelect={(product) => handleProductSelect(idx, product)}
                        onNewProduct={(name) => handleNewProduct(idx, name)}
                        onChange={(val) => updateItem(idx, 'product_name', val)}
                      />
                    </td>
                    <td>
                      <input type="number" inputMode="decimal"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        min="0" step="any" style={{ textAlign:'center' }} />
                    </td>
                    <td>
                      <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" inputMode="decimal"
                        value={item.price}
                        onChange={e => updateItem(idx, 'price', e.target.value)}
                        min="0" step="0.01" placeholder="0.00" style={{ textAlign:'right' }} />
                    </td>
                    <td>
                      <input type="number" inputMode="decimal"
                        value={item.discount}
                        onChange={e => updateItem(idx, 'discount', e.target.value)}
                        min="0" step="0.01" placeholder="0.00" style={{ textAlign:'right' }} />
                    </td>
                    <td>
                      <div className="ci__item-total">
                        ₹{(parseFloat(item.total)||0).toLocaleString('en-IN',{minimumFractionDigits:2})}
                      </div>
                    </td>
                    <td>
                      <button className="ci__remove-btn" onClick={() => removeItem(idx)} title="Remove">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile card list — newest item shown first so user never scrolls down ── */}
          <div className="ci__item-cards">
            {items.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '24px 0',
                color: 'var(--text-muted,#4e4b63)',
                fontFamily: 'DM Sans,sans-serif', fontSize: '0.875rem',
              }}>
                No items yet — tap "Add Item" above
              </div>
            )}
            {items.map((item, idx) => ({ item, idx }))
              .slice()
              .reverse()
              .map(({ item, idx }) => (
              <MobileItemCard
                key={idx}
                item={item}
                idx={idx}
                onUpdate={updateItem}
                onRemove={removeItem}
                onSelect={handleProductSelect}
                onNew={handleNewProduct}
              />
            ))}
          </div>

          <button className="ci__add-item-btn" onClick={addItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}