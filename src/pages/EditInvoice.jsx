import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getInvoiceWithItems, updateInvoice } from '../services/invoiceService';
import InvoiceForm from '../components/InvoiceForm';
import './CreateInvoice.css'; // reuse same styles

const fmtRs = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>}
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function EditInvoice() {
  const { id }    = useParams();
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toasts, setToasts]       = useState([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');

  // Shared state with InvoiceForm (same shape as CreateInvoice)
  const [customer, setCustomer]           = useState({ name: '', phone: '', id: null, isExisting: true });
  const [items, setItems]                 = useState([]);
  const [paymentStatus, setPaymentStatus] = useState('paid');

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  // ── Load existing invoice ──────────────────────────────────────────────
  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const inv = await getInvoiceWithItems(id);
        setInvoiceNo(inv.invoice_no);
        setInvoiceDate(inv.date);
        setCustomer({
          name:       inv.customer_name  || '',
          phone:      inv.customer_phone || '',
          id:         inv.customer_id    || null,
          isExisting: !!inv.customer_id,
        });
        setPaymentStatus(inv.payment_status || 'paid');

        // Map DB items → InvoiceForm item shape
        const mappedItems = (inv.items || []).map(item => ({
          product_id:   item.product_id   || null,
          product_name: item.product_name || '',
          quantity:     Number(item.quantity) || 1,
          unit:         item.unit         || 'piece',
          price:        Number(item.price) || 0,
          discount:     Number(item.discount) || 0,
          total:        Number(item.total)    || 0,
          isNewProduct: false,
        }));
        setItems(mappedItems);
      } catch (err) {
        addToast('Failed to load invoice: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user]);

  // ── Computed totals (same as CreateInvoice) ───────────────────────────
  const subtotal      = items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0)), 0);
  const discountTotal = items.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
  const finalAmount   = Math.max(0, subtotal - discountTotal);
  const amountDue     = paymentStatus === 'paid' ? 0 : finalAmount;

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!customer.name.trim())  { addToast('Customer name is required', 'error'); return; }
    if (!customer.phone.trim()) { addToast('Contact number is required', 'error'); return; }
    if (items.length === 0)     { addToast('Add at least one item', 'error'); return; }
    for (const item of items) {
      if (!item.product_name.trim())     { addToast('Product name required for all items', 'error'); return; }
      if (!(parseFloat(item.price) > 0)) { addToast(`Enter price for "${item.product_name || 'item'}"`, 'error'); return; }
    }

    setSaving(true);
    try {
      const invoiceData = {
        customer_name:  customer.name.trim(),
        customer_phone: customer.phone.trim(),
        customer_id:    customer.id || null,
        subtotal,
        discount_total: discountTotal,
        final_amount:   finalAmount,
        payment_status: paymentStatus,
        amount_due:     amountDue,
      };

      // Clean items — strip React-only fields, ensure quantity is NUMERIC (fixes decimal bug)
      const cleanItems = items.map(item => ({
        product_id:   item.product_id || null,
        product_name: item.product_name.trim(),
        quantity:     parseFloat(item.quantity) || 1,   // ← always float
        unit:         item.unit || 'piece',
        price:        parseFloat(item.price) || 0,
        discount:     parseFloat(item.discount) || 0,
        total:        parseFloat(item.total) || 0,
        // Do NOT include: isNewProduct, any other UI-only fields
      }));

      await updateInvoice(id, user.uid, invoiceData, cleanItems);
      addToast('Invoice updated successfully!');
      setTimeout(() => navigate(`/invoices/view/${id}`), 900);
    } catch (err) {
      addToast('Error: ' + (err.message || 'Failed to update'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="create-invoice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted, #4e4b63)', fontFamily: 'DM Sans, sans-serif' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
            <path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/>
            <path d="M21 12a9 9 0 0 0-9-9"/>
          </svg>
          <p>Loading invoice…</p>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  return (
    <div className="create-invoice">
      <Toast toasts={toasts} />

      {/* ── Header ── */}
      <div className="ci__header">
        <div>
          <p className="ci__eyebrow">Billing</p>
          <h1 className="ci__title">Edit Invoice</h1>
          <div className="ci__meta">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editing
            </span>
            <span>Invoice No: <strong>{invoiceNo}</strong></span>
            <span>Date: <strong>{invoiceDate}</strong></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/invoices/view/${id}`} className="ci__back-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
            Cancel
          </Link>
        </div>
      </div>

      {/* ── Mobile Floating Save Bar ── */}
      <div className="ci__mobile-save-bar">
        <div className="ci__mobile-save-bar-top">
          <div>
            <div className="ci__mobile-total-label">Final Amount</div>
            <div className="ci__mobile-total-val">{fmtRs(finalAmount)}</div>
          </div>
          <span className="ci__mobile-status-pill" style={{
            color: paymentStatus === 'paid' ? '#70c49a' : '#e0aa50',
            background: paymentStatus === 'paid' ? 'rgba(112,196,154,0.1)' : 'rgba(224,170,80,0.1)',
            border: `1px solid ${paymentStatus === 'paid' ? 'rgba(112,196,154,0.3)' : 'rgba(224,170,80,0.3)'}`,
          }}>
            {paymentStatus === 'paid' ? '✓ Paid' : '⏳ Unpaid'}
          </span>
        </div>
        <button className="ci__mobile-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17,21 17,13 7,13 7,21"/>
                <polyline points="7,3 7,8 15,8"/>
              </svg>
              Update Invoice
            </>
          )}
        </button>
      </div>

      {/* ── 2-col layout ── */}
      <div className="ci__layout">
        {/* Main form — reuses InvoiceForm exactly */}
        <div>
          <InvoiceForm
            customer={customer}
            setCustomer={setCustomer}
            items={items}
            setItems={setItems}
            paymentStatus={paymentStatus}
            setPaymentStatus={setPaymentStatus}
          />
        </div>

        {/* Summary sidebar */}
        <div>
          <div className="ci__summary">
            <div className="ci__summary-header">Edit Summary</div>
            <div className="ci__summary-body">
              <div className="ci__summary-row">
                <span className="ci__summary-label">Invoice No</span>
                <span className="ci__summary-val" style={{ fontWeight: 500, color: 'var(--gold, #c9a96e)' }}>{invoiceNo}</span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Items</span>
                <span className="ci__summary-val">{items.length}</span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Subtotal</span>
                <span className="ci__summary-val">{fmtRs(subtotal)}</span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Discount</span>
                <span className="ci__summary-discount">
                  {discountTotal > 0 ? `-${fmtRs(discountTotal)}` : '—'}
                </span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Status</span>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 500, fontFamily: 'DM Sans',
                  color: paymentStatus === 'paid' ? '#70c49a' : '#e0aa50',
                  background: paymentStatus === 'paid' ? 'rgba(112,196,154,0.1)' : 'rgba(224,170,80,0.1)',
                  border: `1px solid ${paymentStatus === 'paid' ? 'rgba(112,196,154,0.3)' : 'rgba(224,170,80,0.3)'}`,
                  padding: '3px 9px', borderRadius: 6, textTransform: 'capitalize',
                }}>{paymentStatus}</span>
              </div>
            </div>

            {paymentStatus === 'unpaid' && finalAmount > 0 && (
              <div className="ci__unpaid-indicator">
                <span className="ci__unpaid-indicator-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Amount Due
                </span>
                <span className="ci__unpaid-indicator-val">{fmtRs(amountDue)}</span>
              </div>
            )}

            <div className="ci__summary-total">
              <span className="ci__summary-total-label">Final Amount</span>
              <span className="ci__summary-total-val">{fmtRs(finalAmount)}</span>
            </div>

            <button className="ci__save-btn" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/>
                    <path d="M21 12a9 9 0 0 0-9-9"/>
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17,21 17,13 7,13 7,21"/>
                    <polyline points="7,3 7,8 15,8"/>
                  </svg>
                  Update Invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}