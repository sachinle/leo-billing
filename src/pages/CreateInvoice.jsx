import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { generateInvoiceNo } from '../utils/generateInvoiceNo';
import { createInvoice } from '../services/invoiceService';
import { addProduct, searchProducts } from '../services/productService';
import { addCustomer, searchCustomers } from '../services/customerService';
import InvoiceForm from '../components/InvoiceForm';
import './CreateInvoice.css';

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

export default function CreateInvoice() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  // Stable invoice number & time for this session
  const [invoiceNo]  = useState(() => generateInvoiceNo());
  const [invoiceTime] = useState(() => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  // use local date (YYYY-MM-DD) instead of UTC ISO to avoid off-by-one issues in time zones
const today = new Date().toLocaleDateString('en-CA');
  const fmtDateDisplay = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const [customer, setCustomer]               = useState({ name: '', phone: '', id: null, isExisting: false });
  const [items, setItems]                     = useState([]);
  const [paymentStatus, setPaymentStatus]     = useState('paid'); // 'paid' | 'unpaid'
  const [saving, setSaving]                   = useState(false);
  const [toasts, setToasts]                   = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  // ── Computed totals ─────────────────────────────────────────────────────
  const subtotal      = items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0)), 0);
  const discountTotal = items.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
  const finalAmount   = Math.max(0, subtotal - discountTotal);
  // amount_due: 0 if paid, full amount if unpaid
  const amountDue     = paymentStatus === 'paid' ? 0 : finalAmount;

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validation
    if (!customer.name.trim())  { addToast('Please enter customer name', 'error'); return; }
    if (!customer.phone.trim()) { addToast('Please enter contact number', 'error'); return; }
    if (items.length === 0)     { addToast('Add at least one item', 'error'); return; }
    for (const item of items) {
      if (!item.product_name.trim()) { addToast('Product name required for all items', 'error'); return; }
      if (!(parseFloat(item.price) > 0)) { addToast(`Enter price for "${item.product_name || 'item'}"`, 'error'); return; }
    }

    setSaving(true);
    try {
      // 1. Resolve / create customer
      let customerId = customer.id || null;
      if (!customer.isExisting) {
        const existing = await searchCustomers(user.uid, customer.name.trim());
        const match = existing.find(c => c.name.toLowerCase() === customer.name.trim().toLowerCase());
        if (match) {
          customerId = match.id;
        } else {
          const newCust = await addCustomer(user.uid, {
            name:  customer.name.trim(),
            phone: customer.phone.trim(),
          });
          customerId = newCust?.id || null;
          addToast(`New customer "${customer.name.trim()}" added`);
        }
      }

      // 2. Resolve / create products
      const dbItems = [];
      for (const item of items) {
        let product_id = item.product_id;
        if (item.isNewProduct && !product_id) {
          const existingProds = await searchProducts(user.uid, item.product_name.trim());
          const matchProd = existingProds.find(p =>
            p.name.toLowerCase() === item.product_name.trim().toLowerCase()
          );
          if (matchProd) {
            product_id = matchProd.id;
          } else {
            const newProd = await addProduct(user.uid, {
              name:  item.product_name.trim(),
              price: parseFloat(item.price),
              unit:  item.unit || 'piece',
            });
            product_id = newProd?.id || null;
            addToast(`New product "${item.product_name.trim()}" added`);
          }
        }
        dbItems.push({
          product_id,
          product_name: item.product_name.trim(),
          quantity:     parseFloat(item.quantity) || 1,
          unit:         item.unit || 'piece',
          price:        parseFloat(item.price)    || 0,
          discount:     parseFloat(item.discount) || 0,
          total:        parseFloat(item.total)    || 0,
        });
      }

      // 3. Create invoice — includes payment_status & amount_due
      const invoiceData = {
        invoice_no:      invoiceNo,
        date:            today,
        time:            invoiceTime,
        customer_id:     customerId,
        customer_name:   customer.name.trim(),
        customer_phone:  customer.phone.trim(),
        subtotal,
        discount_total:  discountTotal,
        final_amount:    finalAmount,
        payment_status:  paymentStatus,   // 'paid' | 'unpaid'
        amount_due:      amountDue,       // 0 or finalAmount
      };

      const saved = await createInvoice(user.uid, invoiceData, dbItems);
      addToast('Invoice saved successfully!');
      setTimeout(() => navigate(`/invoices/view/${saved.id}`), 900);
    } catch (err) {
      addToast('Error: ' + (err.message || 'Failed to save'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-invoice">
      <Toast toasts={toasts} />

      {/* ── Header ── */}
      <div className="ci__header">
        <div>
          <p className="ci__eyebrow">Billing</p>
          <h1 className="ci__title">Create Invoice</h1>
          <div className="ci__meta">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {fmtDateDisplay}
            </span>
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
              </svg>
              {invoiceTime}
            </span>
            <span>Invoice No: <strong>{invoiceNo}</strong></span>
          </div>
        </div>
        <Link to="/invoices" className="ci__back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          Back
        </Link>
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
              Save Invoice
            </>
          )}
        </button>
      </div>

      {/* ── 2-col layout ── */}
      <div className="ci__layout">
        {/* Main form */}
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

        {/* ── Summary Sidebar ── */}
        <div>
          <div className="ci__summary">
            <div className="ci__summary-header">Order Summary</div>
            <div className="ci__summary-body">
              <div className="ci__summary-row">
                <span className="ci__summary-label">Items</span>
                <span className="ci__summary-val">{items.length}</span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Subtotal</span>
                <span className="ci__summary-val">{fmtRs(subtotal)}</span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Total Discount</span>
                <span className="ci__summary-discount">
                  {discountTotal > 0 ? `-${fmtRs(discountTotal)}` : '—'}
                </span>
              </div>
              <div className="ci__summary-row">
                <span className="ci__summary-label">Status</span>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 500, fontFamily: 'DM Sans',
                  color: paymentStatus === 'paid' ? '#70c49a' : '#e0aa50',
                  background: paymentStatus === 'paid'
                    ? 'rgba(112,196,154,0.1)' : 'rgba(224,170,80,0.1)',
                  border: `1px solid ${paymentStatus === 'paid'
                    ? 'rgba(112,196,154,0.3)' : 'rgba(224,170,80,0.3)'}`,
                  padding: '3px 9px', borderRadius: 6,
                  textTransform: 'capitalize',
                }}>
                  {paymentStatus}
                </span>
              </div>
            </div>

            {/* Unpaid amount due indicator */}
            {paymentStatus === 'unpaid' && finalAmount > 0 && (
              <div className="ci__unpaid-indicator">
                <span className="ci__unpaid-indicator-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Amount Due (Unpaid)
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
                  Save Invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}