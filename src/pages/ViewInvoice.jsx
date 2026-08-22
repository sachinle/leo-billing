import { useState, useEffect, useRef, Fragment } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../services/supabase';
import { buildUpiUri, enabledUpiAccounts } from '../utils/upi';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getInvoiceWithItems, markInvoicePayment } from '../services/invoiceService';
import { getProfile } from '../services/profileService';
import { markInvoicePaid } from '../services/profileService';
import { generatePDF, generateImage } from '../utils/pdfExport';
import './Viewinvoice.css';



// ── Helpers ──────────────────────────────────────────────────────────────────
function numberToWords(n) {
  if (!n || isNaN(n)) return 'Zero Rupees only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function toW(num) {
    if (num === 0) return '';
    if (num < 20)  return ones[num] + ' ';
    if (num < 100) return tens[Math.floor(num/10)] + ' ' + toW(num % 10);
    if (num < 1000) return ones[Math.floor(num/100)] + ' Hundred ' + toW(num % 100);
    if (num < 100000) return toW(Math.floor(num/1000)) + 'Thousand ' + toW(num % 1000);
    if (num < 10000000) return toW(Math.floor(num/100000)) + 'Lakh ' + toW(num % 100000);
    return toW(Math.floor(num/10000000)) + 'Crore ' + toW(num % 10000000);
  }
  return toW(Math.floor(Math.abs(n))).trim() + ' Rupees only';
}

const fmtAmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

function fmtInvoiceDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

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

// ── Download dropdown — anchored to Download button on desktop,
// fixed viewport-bottom bar on mobile (via CSS).
// Share always shown — works on mobile via Web Share API,
// on desktop falls back gracefully (copies link or shows message).
function DownloadDropdown({ onClose, onPDF, onImage, onShare, exporting }) {
  return (
    <>
      {/* Backdrop — transparent on desktop (click outside closes),
          dim overlay on mobile (see CSS) */}
      <div className="fmt-backdrop" onClick={() => !exporting && onClose()} />

      <div className="fmt-dropdown">
        <p className="fmt-dropdown__title">Export Invoice</p>

        {/* ── Download PDF ── */}
        <button
          className={`fmt-row${exporting === 'pdf' ? ' fmt-row--loading' : ''}`}
          onClick={exporting ? undefined : onPDF}
          disabled={!!exporting}
        >
          <span className="fmt-row__icon fmt-row__icon--pdf">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </span>
          <span className="fmt-row__body">
            <span className="fmt-row__label">{exporting === 'pdf' ? 'Generating…' : 'Download PDF'}</span>
            <span className="fmt-row__sub">Print-ready A4 document</span>
          </span>
          {exporting === 'pdf'
            ? <svg className="fmt-row__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg className="fmt-row__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          }
        </button>

        {/* ── Download Image ── */}
        <button
          className={`fmt-row${exporting === 'img' ? ' fmt-row--loading' : ''}`}
          onClick={exporting ? undefined : onImage}
          disabled={!!exporting}
        >
          <span className="fmt-row__icon fmt-row__icon--img">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21,15 16,10 5,21"/>
            </svg>
          </span>
          <span className="fmt-row__body">
            <span className="fmt-row__label">{exporting === 'img' ? 'Generating…' : 'Download Image'}</span>
            <span className="fmt-row__sub">PNG file</span>
          </span>
          {exporting === 'img'
            ? <svg className="fmt-row__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg className="fmt-row__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          }
        </button>

        {/* ── Share — always visible, works on mobile + desktop ── */}
        <div className="fmt-divider" />
        <button
          className={`fmt-row fmt-row--share${exporting === 'share' ? ' fmt-row--loading' : ''}`}
          onClick={exporting ? undefined : onShare}
          disabled={!!exporting}
        >
          <span className="fmt-row__icon fmt-row__icon--share">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </span>
          <span className="fmt-row__body">
            <span className="fmt-row__label">{exporting === 'share' ? 'Preparing…' : 'Share'}</span>
            <span className="fmt-row__sub">WhatsApp, Email, Drive &amp; more</span>
          </span>
          {exporting === 'share'
            ? <svg className="fmt-row__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg className="fmt-row__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6"/></svg>
          }
        </button>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ViewInvoice() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [invoice, setInvoice]       = useState(null);
  const [profile, setProfile]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showFmt, setShowFmt]       = useState(false);
  const [exporting, setExporting]   = useState(null);
  const [markingPaid, setMarkingPaid]     = useState(false);
  const [showPayModal, setShowPayModal]   = useState(false);
  const [partialAmt, setPartialAmt]       = useState('');
  const [payModalError, setPayModalError] = useState('');
  const [toasts, setToasts]         = useState([]);

  // The website's own order number, looked up through orders.invoice_id.
  // Leo Billing mints its own invoice number, so an order placed on the
  // site otherwise loses its identity the moment it becomes a bill —
  // and that number is what the customer quotes when they call.
  const [websiteOrderNo, setWebsiteOrderNo] = useState('');

  // QR for the balance still owed on this bill.
  const [payQr, setPayQr] = useState('');

  useEffect(() => {
    if (!invoice?.id) return;
    let cancelled = false;

    supabase
      .from('orders')
      .select('order_no')
      .eq('invoice_id', invoice.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.order_no) setWebsiteOrderNo(data.order_no);
      });

    return () => { cancelled = true; };
  }, [invoice?.id]);

  useEffect(() => {
    const due = Number(invoice?.amount_due) || 0;
    const account = enabledUpiAccounts(profile)[0];

    // No QR when there's nothing to collect, or no UPI ID on file.
    if (!account || due <= 0) { setPayQr(''); return; }

    let cancelled = false;
    const uri = buildUpiUri({
      vpa: account.vpa,
      payeeName: profile?.shop_name || 'Payment',
      amount: due,
      note: `Invoice ${invoice.invoice_no}`,
      ref: invoice.invoice_no,
    });

    QRCode.toDataURL(uri, { width: 512, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setPayQr(url); })
      .catch(() => { if (!cancelled) setPayQr(''); });

    return () => { cancelled = true; };
  }, [invoice?.amount_due, invoice?.invoice_no, profile]);

  const invoiceRef     = useRef();
  const downloadBtnRef = useRef();


  const addToast = (message, type = 'success') => {
    const tid = Date.now() + Math.random();
    setToasts(t => [...t, { id: tid, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 3500);
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getInvoiceWithItems(id),
      getProfile(user.uid),
    ]).then(([inv, prof]) => {
      setInvoice(inv);
      setProfile(prof);
    }).catch(() => addToast('Error loading invoice', 'error'))
    .finally(() => setLoading(false));
  }, [id, user]);

// Remove old handleMarkPaid, replace with:
const handleMarkPaid = () => {
  setPartialAmt('');
  setPayModalError('');
  setShowPayModal(true);
};

const handlePaymentSubmit = async (payFull) => {
  const finalAmount   = Number(invoice.final_amount) || 0;
  const prevReceived  = Number(invoice.amount_received) || 0;

  let received;
  if (payFull) {
    received = finalAmount;
  } else {
    const entered = parseFloat(partialAmt);
    if (!partialAmt || isNaN(entered) || entered <= 0) {
      setPayModalError('Enter a valid amount.');
      return;
    }
    if (entered > finalAmount) {
      setPayModalError(`Cannot exceed invoice total ₹${fmtAmt(finalAmount)}`);
      return;
    }
    received = prevReceived + entered; // cumulative
  }

  setMarkingPaid(true);
  setShowPayModal(false);
  try {
    const result = await markInvoicePayment(invoice.id, user.uid, received, finalAmount);
    setInvoice(inv => ({
      ...inv,
      amount_received: received,
      payment_status:  result.isPaidFull ? 'paid' : 'unpaid',
      amount_due:      result.amountDue,
    }));
    addToast(result.isPaidFull ? 'Invoice marked as paid!' : `₹${fmtAmt(received)} recorded. Balance ₹${fmtAmt(result.amountDue)}`);
  } catch { addToast('Failed to update payment', 'error'); }
  finally { setMarkingPaid(false); }
};

  const handleDownloadPDF = async () => {
    setExporting('pdf');
    try {
      await generatePDF(invoiceRef.current, `invoice-${invoice.invoice_no}.pdf`);
      addToast('PDF downloaded!');
    } catch { addToast('PDF export failed', 'error'); }
    setExporting(null); setShowFmt(false);
  };

  const handleDownloadImage = async () => {
    setExporting('img');
    try {
      await generateImage(invoiceRef.current, `invoice-${invoice.invoice_no}.png`);
      addToast('Image downloaded!');
    } catch { addToast('Image export failed', 'error'); }
    setExporting(null); setShowFmt(false);
  };

  // ── handleShare ──────────────────────────────────────────────────────────
  // Strategy:
  //   1. Capacitor native (Android/iOS) → @capacitor/share + @capacitor/filesystem
  //      Writes PNG to a TEMP cache file, shares via native OS sheet, then cleans up.
  //   2. Web browser with File Share support → Web Share API with File object
  //   3. Web browser without File Share     → downloads the PNG as a fallback
  //
  // WHY NOT navigator.share on Capacitor?
  //   The Capacitor WebView does NOT reliably support navigator.canShare({ files })
  //   or navigator.share({ files }). The call silently fails or the share sheet
  //   never appears. @capacitor/share is the correct plugin for native sharing.
  const handleShare = async () => {
    setExporting('share');
    setShowFmt(false);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const A4_PX = 794;
      const el = invoiceRef.current;

      // ── Step 1: capture the invoice as a PNG canvas ──
      const prev = { width: el.style.width, minWidth: el.style.minWidth, maxWidth: el.style.maxWidth };
      el.style.width = el.style.minWidth = el.style.maxWidth = `${A4_PX}px`;
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff', width: A4_PX, windowWidth: A4_PX + 80, logging: false,
      });
      el.style.width = prev.width; el.style.minWidth = prev.minWidth; el.style.maxWidth = prev.maxWidth;

      const fileName = `invoice-${invoice.invoice_no}.png`;
      const base64   = canvas.toDataURL('image/png').split(',')[1];

      // ── Step 2: detect platform ──
      const native = window?.Capacitor?.isNativePlatform?.() === true;

      if (native) {
        // ── Capacitor Android/iOS path ──────────────────────────────────────
        // Write to the app's CACHE directory (no storage permission needed),
        // then hand the URI to @capacitor/share for the native share sheet.
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share }                 = await import('@capacitor/share');

        // Write temp file to cache (always writable, no permission dialog)
        const writeResult = await Filesystem.writeFile({
          path:      fileName,
          data:      base64,
          directory: Directory.Cache,   // ← Cache, NOT Downloads → no permission needed
          recursive: false,
        });

        // writeResult.uri is a file:// URI the Share plugin can read directly
        await Share.share({
            title: `Invoice #${invoice.invoice_no}`,
            text: [
              `📄 Invoice #${invoice.invoice_no}`,
              `🗓️ Date: ${fmtInvoiceDate(invoice.date)}`,
              `🏪 From: ${profile?.shop_name || 'Leo Billing'}`,
              `💰 Total: ₹${fmtAmt(invoice.final_amount)}`,
              Number(invoice.amount_received) > 0
                ? `✅ Received: ₹${fmtAmt(invoice.amount_received)}`
                : null,
              Number(invoice.amount_due) > 0
                ? `⚠️ Balance Due: ₹${fmtAmt(invoice.amount_due)}`
                : `✅ Fully Paid`,
            ].filter(Boolean).join('\n'),
            url:        writeResult.uri,
            dialogTitle: 'Share Invoice',
        });

        // Clean up temp file after share (best-effort)
        try {
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
        } catch (_) { /* non-fatal */ }

        addToast('Shared successfully!');

      } else {
        // ── Web browser path ─────────────────────────────────────────────────
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          // Modern browser with File Share (mobile Chrome/Safari)
          await navigator.share({
            title: `Invoice ${invoice.invoice_no}`,
            text:  `Invoice from ${profile?.shop_name || 'Leo Billing'} — ₹${fmtAmt(invoice.final_amount)}`,
            files: [file],
          });
          addToast('Shared successfully!');
        } else if (navigator.share) {
          // Web Share v1 — text/URL only, no file
          await navigator.share({
            title: `Invoice ${invoice.invoice_no}`,
            text:  `Invoice from ${profile?.shop_name || 'Leo Billing'} — ₹${fmtAmt(invoice.final_amount)}`,
          });
          addToast('Shared!');
        } else {
          // Desktop fallback — download PNG
          const link = document.createElement('a');
          link.download = fileName;
          link.href = canvas.toDataURL('image/png');
          link.click();
          addToast('Image saved — share from your Downloads folder');
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('[handleShare]', err);
        addToast(`Share failed: ${err?.message || 'Unknown error'}`, 'error');
      }
    }
    setExporting(null);
  };

  if (loading) return (
    <div className="view-invoice-page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <span style={{ color:'var(--text-muted,#4e4b63)', fontFamily:'DM Sans,sans-serif' }}>Loading invoice…</span>
    </div>
  );

  if (!invoice) return (
    <div className="view-invoice-page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <span style={{ color:'#e07070', fontFamily:'DM Sans,sans-serif' }}>Invoice not found.</span>
    </div>
  );

  // Computed
  const totalQty      = invoice.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const amountInWords = numberToWords(invoice.final_amount);
  const isPaid        = (invoice.payment_status || 'paid') === 'paid';
  const amountDue     = Number(invoice.amount_due) || 0;
  const dateDisplay   = fmtInvoiceDate(invoice.date);

  const shop = {
    name:      profile?.shop_name      || 'Your Shop Name',
    address:   [profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(', ') || 'Address not set — update your Profile',
    phone:     profile?.phone          || '—',
    email:     profile?.email          || '—',
    state:     profile?.state          || '—',
    gstin:     profile?.gstin          || '',
    fssai:     profile?.fssai_no       || '',   // ← NEW
    upi:       profile?.upi_id         || '',
    bank:      profile?.bank_name      || '',
    account:   profile?.account_no     || '',
    ifsc:      profile?.ifsc_code      || '',
    terms:     profile?.terms          || 'Thank you for doing business with us.',
    signatory: profile?.signatory_name || '',   // ← NEW
  };

  return (
    <Fragment>
    <div className="view-invoice-page">

      <Toast toasts={toasts} />
      {/* ── Payment Modal ── */}
{showPayModal && (
  <div style={{
    position:'fixed', inset:0, zIndex:1000,
    background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)',
    display:'flex', alignItems:'center', justifyContent:'center', padding:20,
  }}>
    <div style={{
      background:'var(--card,#14141c)', border:'1px solid var(--border,rgba(201,169,110,0.18))',
      borderRadius:16, padding:'28px 24px', width:'100%', maxWidth:360,
      fontFamily:'DM Sans, sans-serif',
    }}>
      <p style={{ fontSize:'0.7rem', fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--gold,#c9a96e)', marginBottom:6 }}>Record Payment</p>
      <p style={{ fontSize:'1.05rem', fontWeight:500, color:'var(--text-primary,#f0ece4)', marginBottom:4 }}>
        Invoice #{invoice.invoice_no}
      </p>
      <p style={{ fontSize:'0.82rem', color:'var(--text-muted,#4e4b63)', marginBottom:20 }}>
        Total: ₹{fmtAmt(invoice.final_amount)}
        {Number(invoice.amount_received) > 0 && (
          <> &nbsp;·&nbsp; Already received: ₹{fmtAmt(invoice.amount_received)}</>
        )}
      </p>

      {/* Full payment button */}
      <button
        onClick={() => handlePaymentSubmit(true)}
        disabled={markingPaid}
        style={{
          width:'100%', padding:'11px 0', borderRadius:9, border:'none', cursor:'pointer',
          background:'var(--gold,#c9a96e)', color:'#0a0808',
          fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:'0.9rem', marginBottom:12,
        }}
      >
        ✓ Paid Full Amount (₹{fmtAmt(Number(invoice.final_amount) - Number(invoice.amount_received || 0))})
      </button>

      {/* Partial payment */}
      <p style={{ fontSize:'0.75rem', color:'var(--text-muted,#4e4b63)', textAlign:'center', marginBottom:10 }}>— or record partial payment —</p>
      <input
        type="number"
        placeholder="Enter amount received now"
        value={partialAmt}
        onChange={e => { setPartialAmt(e.target.value); setPayModalError(''); }}
        style={{
          width:'100%', padding:'10px 14px', borderRadius:9, boxSizing:'border-box',
          background:'var(--bg,#0a0a0f)', border:`1px solid ${payModalError ? '#e07070' : 'var(--border,rgba(201,169,110,0.18))'}`,
          color:'var(--text-primary,#f0ece4)', fontFamily:'DM Sans,sans-serif', fontSize:'0.9rem',
          outline:'none', marginBottom:payModalError ? 6 : 12,
        }}
      />
      {payModalError && (
        <p style={{ fontSize:'0.75rem', color:'#e07070', marginBottom:10 }}>{payModalError}</p>
      )}
      <button
        onClick={() => handlePaymentSubmit(false)}
        disabled={markingPaid}
        style={{
          width:'100%', padding:'10px 0', borderRadius:9, cursor:'pointer',
          background:'rgba(201,169,110,0.1)', border:'1px solid rgba(201,169,110,0.3)',
          color:'var(--gold,#c9a96e)', fontFamily:'DM Sans,sans-serif', fontWeight:500, fontSize:'0.875rem', marginBottom:10,
        }}
      >
        Save Partial Payment
      </button>
      <button
        onClick={() => setShowPayModal(false)}
        style={{
          width:'100%', padding:'8px 0', borderRadius:9, cursor:'pointer',
          background:'transparent', border:'1px solid var(--border,rgba(201,169,110,0.18))',
          color:'var(--text-muted,#4e4b63)', fontFamily:'DM Sans,sans-serif', fontSize:'0.82rem',
        }}
      >
        Cancel
      </button>
    </div>
  </div>
)}

      


      {/* ── Top bar ── */}
      <div className="vi__topbar">
        <Link to="/invoices" className="vi__back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          Back to Invoices
        </Link>

        <div className="vi__actions">
          <span className={`vi__status-pill${isPaid ? ' vi__status-pill--paid' : ' vi__status-pill--unpaid'}`}>
            <span className="vi__status-dot" />
            {isPaid ? 'Paid' : `Unpaid · Due ₹${fmtAmt(amountDue)}`}
          </span>

          {!isPaid && (
            <button className="vi__action-btn vi__action-btn--markpaid" onClick={handleMarkPaid} disabled={markingPaid}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              {markingPaid ? 'Updating…' : 'Mark Paid'}
            </button>
          )}

          <button className="vi__action-btn vi__action-btn--edit" onClick={() => navigate(`/invoices/edit/${invoice.id}`)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>

          {/* Relative wrapper so the dropdown positions itself below this button */}
          <div className="vi__download-wrap" ref={downloadBtnRef}>
            <button className="vi__action-btn vi__action-btn--pdf" onClick={() => setShowFmt(v => !v)} disabled={!!exporting}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exporting ? 'Exporting…' : 'Download'}
            </button>
            {showFmt && (
              <DownloadDropdown
                onClose={() => !exporting && setShowFmt(false)}
                onPDF={handleDownloadPDF}
                onImage={handleDownloadImage}
                onShare={handleShare}
                exporting={exporting}
              />
            )}
          </div>

          {/* ── Thermal Print button — visible on desktop too ── */}
          <Link
            to={`/invoices/view/${invoice?.id}/print`}
            className="vi__action-btn vi__action-btn--print"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6,9 6,2 18,2 18,9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </Link>

        </div>
      </div>

      {/* Profile not set up warning */}
      {!profile && (
        <div className="vi__profile-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Your shop details are not set up yet. &nbsp;
          <Link to="/profile" style={{ color:'var(--gold,#c9a96e)', textDecoration:'underline' }}>
            Set up your profile
          </Link>
          &nbsp;to show correct info on invoices.
        </div>
      )}

      {/* ══════════════════════════════════════════
          MOBILE CARD VIEW  ≤768px
          Full invoice info in readable dark cards
      ══════════════════════════════════════════ */}
      <div className="vi__mobile-view">

        {/* Shop + Invoice ID card */}
        <div className="vi__card">
          <div className="vi__card-shop-band">
            <div className="vi__card-shop-name">{shop.name}</div>
            <div className="vi__card-shop-sub">
              {shop.address}
              {shop.phone !== '—' && <> · Ph: {shop.phone}</>}
              {shop.gstin && <> · GSTIN: {shop.gstin}</>}
              {/* ← NEW: show FSSAI in mobile card header too */}
              {shop.fssai && <> · FSSAI: {shop.fssai}</>}
            </div>
          </div>
          <div className="vi__card-body">
            <div className="vi__card-row">
              <span className="vi__card-label">Invoice No</span>
              <span className="vi__card-val vi__card-val--gold">{invoice.invoice_no}</span>
            </div>
            {websiteOrderNo && (
              <div className="vi__card-row">
                <span className="vi__card-label">Website Order</span>
                <span className="vi__card-val">{websiteOrderNo}</span>
              </div>
            )}
            <div className="vi__card-row">
              <span className="vi__card-label">Date</span>
              <span className="vi__card-val">{dateDisplay}</span>
            </div>
            {invoice.time && (
              <div className="vi__card-row">
                <span className="vi__card-label">Time</span>
                <span className="vi__card-val">{invoice.time}</span>
              </div>
            )}
            <div className="vi__card-row">
              <span className="vi__card-label">Status</span>
              <span className={`vi__card-val ${isPaid ? 'vi__card-val--green' : 'vi__card-val--amber'}`}>
                {isPaid ? '✓ Paid' : '⚠ Unpaid'}
              </span>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="vi__card">
          <div className="vi__card-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Bill To
          </div>
          <div className="vi__card-body">
            <div className="vi__card-row">
              <span className="vi__card-label">Customer</span>
              <span className="vi__card-val">{invoice.customer_name}</span>
            </div>
            <div className="vi__card-row">
              <span className="vi__card-label">Contact</span>
              <span className="vi__card-val">{invoice.customer_phone}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="vi__card">
          <div className="vi__card-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Items
            <span className="vi__card-count">{invoice.items.length}</span>
          </div>

          {/* Item rows */}
          <div className="vi__items-list">
            {invoice.items.map((item, idx) => (
              <div key={item.id || idx} className="vi__item-row">
                <div className="vi__item-index">{idx + 1}</div>
                <div className="vi__item-info">
                  <div className="vi__item-name">{item.product_name}</div>
                  <div className="vi__item-meta">
                    {Number(item.quantity) % 1 !== 0
                      ? Number(item.quantity).toFixed(2)
                      : item.quantity} {item.unit}
                    {' · '}₹{fmtAmt(item.price)}/unit
                    {Number(item.discount) > 0 && ` · −₹${fmtAmt(item.discount)} off`}
                  </div>
                </div>
                <div className="vi__item-total">₹{fmtAmt(item.total)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="vi__totals">
            <div className="vi__totals-row">
              <span>Subtotal</span>
              <span>₹{fmtAmt(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discount_total) > 0 && (
              <div className="vi__totals-row">
                <span>Discount</span>
                <span style={{color:'#70c49a'}}>−₹{fmtAmt(invoice.discount_total)}</span>
              </div>
            )}
            {Number(invoice.loyalty_discount_applied) > 0 && (
              <div className="vi__totals-row">
                <span style={{color:'#c9a96e'}}>★ Loyalty Reward</span>
                <span style={{color:'#c9a96e'}}>−₹{fmtAmt(invoice.loyalty_discount_applied)}</span>
              </div>
            )}
            <div className="vi__totals-row">
              <span>Received</span>
              <span>₹{fmtAmt(Number(invoice.amount_received) || 0)}</span>
            </div>
            {amountDue > 0 && (
              <div className="vi__totals-row" style={{color:'#e07070'}}>
                <span>Balance Due</span>
                <span>₹{fmtAmt(amountDue)}</span>
              </div>
            )}
            <div className="vi__totals-final">
              <span>Total</span>
              <span>₹{fmtAmt(invoice.final_amount)}</span>
            </div>
            {Number(invoice.loyalty_points_earned) > 0 && (
              <div className="vi__totals-row" style={{ color:'#c9a96e', borderTop:'1px solid rgba(201,169,110,0.2)', marginTop:4, paddingTop:8 }}>
                <span>★ Points Earned</span>
                <span>+{invoice.loyalty_points_earned} pts</span>
              </div>
            )}
          </div>

          {/* Amount in words */}
          <div className="vi__words">
            <div className="vi__words-label">Amount in words</div>
            <div className="vi__words-text">{amountInWords}</div>
          </div>
        </div>

        {/* Scan-to-pay for whatever is still owed on this bill.
            Only rendered when there is a balance and a UPI ID on file —
            a QR on a settled invoice invites a second payment. */}
        {payQr && (
          <div className="vi__card vi__payqr">
            <div className="vi__card-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                <path d="M14 3h7v7"/><path d="M3 14h7v7"/>
              </svg>
              <span>Scan to pay ₹{fmtAmt(amountDue)}</span>
            </div>
            <div className="vi__card-body vi__payqr-body">
              <img className="vi__payqr-img" src={payQr} alt="UPI payment QR code" />
              <p className="vi__payqr-note">
                Any UPI app · amount is fixed in the code
              </p>
            </div>
          </div>
        )}

        {/* Bank & Terms */}
        {(shop.upi || shop.bank || shop.terms) && (
          <div className="vi__card">
            <div className="vi__card-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              Payment &amp; Terms
            </div>
            <div className="vi__card-body">
              {shop.upi     && <div className="vi__card-row"><span className="vi__card-label">UPI</span><span className="vi__card-val">{shop.upi}</span></div>}
              {shop.bank    && <div className="vi__card-row"><span className="vi__card-label">Bank</span><span className="vi__card-val">{shop.bank}</span></div>}
              {shop.account && <div className="vi__card-row"><span className="vi__card-label">A/C No.</span><span className="vi__card-val">{shop.account}</span></div>}
              {shop.ifsc    && <div className="vi__card-row"><span className="vi__card-label">IFSC</span><span className="vi__card-val">{shop.ifsc}</span></div>}
              {shop.terms && (
                <div className="vi__words" style={{borderTop: (shop.upi || shop.bank) ? '1px solid rgba(201,169,110,0.1)' : 'none', marginTop: (shop.upi || shop.bank) ? 4 : 0}}>
                  <div className="vi__words-label">Terms &amp; Conditions</div>
                  <div className="vi__words-text">{shop.terms}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Signature band — mobile */}
        <div className="vi__card vi__card--sig">
          <div className="vi__sig-left">
            <div className="vi__sig-title">For: {shop.name}</div>
          </div>
          <div className="vi__sig-right">
            {/* ← NEW: cursive signature on mobile card */}
            {shop.signatory && (
              <div style={{ fontFamily:'Pacifico, cursive', fontSize:'1.2rem', color:'var(--text-primary,#f0ece4)', marginBottom:4, lineHeight:1.4 }}>
                {shop.signatory}
              </div>
            )}
            <div className="vi__sig-line" />
            <div className="vi__sig-label">Authorized Signatory</div>
          </div>
        </div>

      </div>{/* end vi__mobile-view */}

      {/* ══════════════════════════════════════════
          A4 RECEIPT  — desktop + PDF/Image capture
          Hidden on mobile via CSS, always rendered
          so invoiceRef works for export on any screen
      ══════════════════════════════════════════ */}
      <div className="invoice-receipt-wrap">
        <div className="invoice-receipt" ref={invoiceRef}>

          {/* ── Store header ── */}
          <div className="ir__header">
            <div className="ir__store-name">{shop.name}</div>
            <div className="ir__store-details">Address: {shop.address}</div>
            <div className="ir__store-details" style={{ marginTop: 2 }}>
              Ph. no.: {shop.phone}
              {shop.email && shop.email !== '—' ? `     Email: ${shop.email}` : ''}
            </div>
            {/* GSTIN — unchanged */}
            {shop.gstin && (
              <div className="ir__store-details" style={{ marginTop: 2 }}>GSTIN: {shop.gstin}</div>
            )}
            {/* ← NEW: FSSAI line, only shown if set in profile */}
            {shop.fssai && (
              <div className="ir__store-details" style={{ marginTop: 2 }}>FSSAI Lic. No.: {shop.fssai}</div>
            )}
            <div className="ir__state">State: {shop.state}</div>
          </div>

          <div className="ir__divider-top" />
          <div className="ir__tax-label">Tax Invoice</div>

          {/* Bill To + Invoice Details */}
          <div className="ir__bill-section">
            <div>
              <div className="ir__bill-label">Bill To</div>
              <div className="ir__bill-name">{invoice.customer_name}</div>
              <div className="ir__bill-contact">Contact No.: {invoice.customer_phone}</div>
            </div>
            <div className="ir__inv-details">
              <div className="ir__inv-details-title">Invoice Details</div>
              <div className="ir__inv-no">Invoice No.: {invoice.invoice_no}</div>
              <div className="ir__inv-date">Date: {dateDisplay}</div>
              {invoice.time && <div className="ir__inv-date">Time: {invoice.time}</div>}
              <div style={{ marginTop: 6 }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                  fontSize: '0.7rem', fontFamily: 'DM Sans, sans-serif',
                  background: isPaid ? '#e8f5ee' : '#fff8e8',
                  color: isPaid ? '#2d7a4f' : '#9a6800',
                  border: `1px solid ${isPaid ? '#b3dfc6' : '#f0d080'}`,
                }}>
                  {isPaid ? '✓ PAID' : '⚠ UNPAID'}
                </span>
              </div>
            </div>
          </div>

          {/* Items table */}
          <table className="ir__items-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 28 }}>#</th>
                <th>Item Name</th>
                <th>HSN / SAC</th>
                <th style={{ textAlign:'center' }}>Qty</th>
                <th>Unit</th>
                <th style={{ textAlign:'right' }}>Price / Unit</th>
                <th style={{ textAlign:'right', paddingRight: 28 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td style={{ paddingLeft:28, color:'#888' }}>{idx + 1}</td>
                  <td>{item.product_name}</td>
                  <td style={{ color:'#aaa' }}>—</td>
                  <td style={{ textAlign:'center' }}>{Number(item.quantity) % 1 !== 0 ? Number(item.quantity).toFixed(2) : item.quantity}</td>
                  <td>{item.unit}</td>
                  <td style={{ textAlign:'right' }}>₹{fmtAmt(item.price)}</td>
                  <td style={{ textAlign:'right', paddingRight:28 }}>₹{fmtAmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ paddingLeft:28 }}>Total</td>
                <td style={{ textAlign:'center' }}>{totalQty}</td>
                <td></td>
                <td></td>
                <td style={{ textAlign:'right', paddingRight:28 }}>₹ {fmtAmt(invoice.subtotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Bottom: amount in words + breakdown */}
          <div className="ir__bottom">
            <div className="ir__words-section">
              <div className="ir__section-header">Invoice Amount In Words</div>
              <div className="ir__words-text">{amountInWords}</div>
              {/* Loyalty section in words column */}
              {(Number(invoice.loyalty_points_earned) > 0 || Number(invoice.loyalty_discount_applied) > 0) && (
                <div style={{ marginTop: 12, padding: '8px 10px', background: '#fffbf0', border: '1px solid #e8d89a', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9a7800', marginBottom: 4, letterSpacing: '0.05em' }}>
                    ★ LOYALTY POINTS
                  </div>
                  {Number(invoice.loyalty_discount_applied) > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#555', lineHeight: 1.6 }}>
                      Reward Redeemed: −₹{fmtAmt(invoice.loyalty_discount_applied)} (1000 pts used)
                    </div>
                  )}
                  {Number(invoice.loyalty_points_earned) > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#555', lineHeight: 1.6 }}>
                      Points Earned: +{invoice.loyalty_points_earned} pts
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <div className="ir__section-header" style={{ margin:'0 -28px 10px' }}>Terms and Conditions</div>
                <div className="ir__words-text">{shop.terms}</div>
              </div>
            </div>
            <div className="ir__amounts-section">
              <div className="ir__section-header">Amounts</div>
              <div className="ir__amount-row">
                <span>Sub Total</span>
                <span className="ir__amount-val">₹ {fmtAmt(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discount_total) > 0 && (
                <div className="ir__amount-row">
                  <span>Discount</span>
                  <span className="ir__amount-val" style={{ color:'#c05050' }}>- ₹ {fmtAmt(invoice.discount_total)}</span>
                </div>
              )}
              {Number(invoice.loyalty_discount_applied) > 0 && (
                <div className="ir__amount-row">
                  <span style={{ color: '#9a7800' }}>★ Loyalty Reward</span>
                  <span className="ir__amount-val" style={{ color:'#9a7800' }}>- ₹ {fmtAmt(invoice.loyalty_discount_applied)}</span>
                </div>
              )}
              <div className="ir__amount-row">
                <span>Total</span>
                <span className="ir__amount-val">₹ {fmtAmt(invoice.final_amount)}</span>
              </div>
              <div className="ir__amount-row">
                <span>Received</span>
                <span className="ir__amount-val">₹ {fmtAmt(Number(invoice.amount_received) || 0)}</span>
              </div>
              <div className="ir__amount-row" style={{ fontWeight:'bold', borderTop:'2px solid #be1b1b', marginTop:4, paddingTop:8 }}>
                <span>Balance</span>
                <span className="ir__amount-val" style={{ color: amountDue > 0 ? '#be1b1b' : '#1a1a1a' }}>
                  ₹ {fmtAmt(amountDue)}
                </span>
              </div>
              {Number(invoice.loyalty_points_earned) > 0 && (
                <div className="ir__amount-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8d89a', color: '#9a7800' }}>
                  <span>★ Points Earned</span>
                  <span className="ir__amount-val">+{invoice.loyalty_points_earned} pts</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer: Bank + Signature ── */}
          <div className="ir__footer">
            <div className="ir__bank-section">
              <div className="ir__section-header">Bank Details</div>
              {(shop.upi || shop.bank) ? (
                <div className="ir__words-text" style={{ fontSize:'0.75rem', color:'#444', lineHeight:1.9 }}>
                  {shop.upi    && <><strong>UPI:</strong> {shop.upi}<br /></>}
                  {shop.bank   && <><strong>Bank:</strong> {shop.bank}<br /></>}
                  {shop.account && <><strong>A/C:</strong> {shop.account}<br /></>}
                  {shop.ifsc   && <><strong>IFSC:</strong> {shop.ifsc}<br /></>}
                </div>
              ) : (
                <div className="ir__words-text" style={{ fontSize:'0.72rem', color:'#aaa', lineHeight:1.8 }}>
                  Add bank / UPI details in your Profile settings.
                </div>
              )}
            </div>

            {/* ── Signature section ── */}
            <div className="ir__sig-section">
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'space-between', paddingTop:8 }}>
                <div className="ir__sig-store">For: {shop.name}</div>
                <div style={{ textAlign:'right' }}>
                  {/*
                    ← CHANGED: was an empty 44px spacer.
                    Now renders the signatory name in Pacifico cursive so it
                    looks like a real handwritten signature.
                    Falls back to an empty space if no name is set.
                  */}
                  {shop.signatory ? (
                    <div style={{
                      fontFamily: 'Pacifico, cursive',
                      fontSize: '1.55rem',
                      color: '#1a1a1a',
                      lineHeight: 1.4,
                      marginBottom: 2,
                      /* subtle blue-black ink colour for realism */
                      textShadow: '0.3px 0.3px 0px rgba(20,30,80,0.18)',
                    }}>
                      {shop.signatory}
                    </div>
                  ) : (
                    <div style={{ height: 44 }} />
                  )}
                  {/* Signature underline */}
                  <div style={{
                    width: '100%',
                    minWidth: 120,
                    height: 0,
                    borderBottom: '1px solid #999',
                    marginBottom: 4,
                  }} />
                  <div className="ir__sig-label">Authorized Signatory</div>
                  <div className="ir__powered">
                    <span className="ir__powered-text">
                      Powered by Leo Billing<span className="ir__powered-dot">.</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>

    {/* ═══════════════════════════════════════════════════════════════
        MOBILE BOTTOM BAR — rendered as SIBLING of view-invoice-page,
        NOT as a child. This is critical: .view-invoice-page has a CSS
        animation that uses transform, which creates a new stacking
        context and breaks position:fixed on any element inside it.
        As a sibling it has no such constraint — truly viewport-fixed.
    ═══════════════════════════════════════════════════════════════ */}
    <div className="vi__mob-bar">

      {/* ── PDF ── */}
      <button
        className={`vi__mob-btn${exporting === 'pdf' ? ' vi__mob-btn--busy' : ''}`}
        onClick={exporting ? undefined : handleDownloadPDF}
        disabled={!!exporting}
      >
        <span className="vi__mob-btn__icon vi__mob-btn__icon--pdf">
          {exporting === 'pdf'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'mobSpin .9s linear infinite'}}><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          }
        </span>
        <span className="vi__mob-btn__label">{exporting === 'pdf' ? 'Saving…' : 'PDF'}</span>
      </button>

      <div className="vi__mob-bar__div" />

      {/* ── Image ── */}
      <button
        className={`vi__mob-btn${exporting === 'img' ? ' vi__mob-btn--busy' : ''}`}
        onClick={exporting ? undefined : handleDownloadImage}
        disabled={!!exporting}
      >
        <span className="vi__mob-btn__icon vi__mob-btn__icon--img">
          {exporting === 'img'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'mobSpin .9s linear infinite'}}><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
          }
        </span>
        <span className="vi__mob-btn__label">{exporting === 'img' ? 'Saving…' : 'Image'}</span>
      </button>

      <div className="vi__mob-bar__div" />

      {/* ── Share ── */}
      <button
        className={`vi__mob-btn${exporting === 'share' ? ' vi__mob-btn--busy' : ''}`}
        onClick={exporting ? undefined : handleShare}
        disabled={!!exporting}
      >
        <span className="vi__mob-btn__icon vi__mob-btn__icon--share">
          {exporting === 'share'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'mobSpin .9s linear infinite'}}><path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          }
        </span>
        <span className="vi__mob-btn__label">{exporting === 'share' ? 'Sharing…' : 'Share'}</span>
      </button>

      <div className="vi__mob-bar__div" />

      {/* ── Thermal Print ── */}
      <Link
        to={`/invoices/view/${invoice?.id}/print`}
        className="vi__mob-btn vi__mob-btn--print"
      >
        <span className="vi__mob-btn__icon vi__mob-btn__icon--print">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6,9 6,2 18,2 18,9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </span>
        <span className="vi__mob-btn__label">Print</span>
      </Link>

    </div>
    </Fragment>
  );
}