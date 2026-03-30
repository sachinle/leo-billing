import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getInvoiceWithItems } from '../services/invoiceService';
import { getProfile } from '../services/profileService';
import {
  connectBluetooth, disconnectBluetooth, getConnectionState,
  isBluetoothSupported, isNativeApp, buildUPIString, print as thermalPrint,
} from '../services/thermalPrinter';
import './ThermalPrint.css';

// ══════════════════════════════════════════════════════════════════════════════
//  PURE-JS QR CODE GENERATOR
//  Self-contained — no external URL, works offline in Capacitor WebView.
//  Based on the compact QR algorithm (byte mode, error correction M).
// ══════════════════════════════════════════════════════════════════════════════
const QRCode = (() => {
  // GF(256) arithmetic
  const EXP = new Uint8Array(512);
  const LOG  = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x = x > 127 ? (x << 1) ^ 285 : x << 1;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  const gfPoly = (degree) => {
    let p = [1];
    for (let i = 0; i < degree; i++) {
      const q = [1, EXP[i]];
      const r = new Array(p.length + q.length - 1).fill(0);
      for (let j = 0; j < p.length; j++)
        for (let k = 0; k < q.length; k++)
          r[j+k] ^= gfMul(p[j], q[k]);
      p = r;
    }
    return p;
  };
  const rsEncode = (data, ecLen) => {
    const gen = gfPoly(ecLen);
    const msg = [...data, ...new Array(ecLen).fill(0)];
    for (let i = 0; i < data.length; i++) {
      const coeff = msg[i];
      if (coeff !== 0)
        for (let j = 0; j < gen.length; j++)
          msg[i+j] ^= gfMul(gen[j], coeff);
    }
    return msg.slice(data.length);
  };

  // Version/EC table: [version, ecBlocks, ecPerBlock, dataBytes]
  const VER = [
    null,
    [1, 1, 10, 16], [2, 1, 16, 28], [3, 1, 26, 44], [4, 2, 18, 64],
    [5, 2, 22, 86], [6, 2, 28, 108],[7, 4, 16, 124],[8, 4, 18, 154],
    [9, 4, 22, 182],[10,4, 26, 216],[11,4, 30, 254],[12,4, 22, 290],
  ];

  // Alignment positions
  const ALIGN = [[], [], [6,18],[6,22],[6,26],[6,30],[6,34],
    [6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58]];

  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    const dataLen = bytes.length;

    // Find version
    let ver = 1;
    while (ver <= 12 && VER[ver][3] < dataLen + 3) ver++;
    if (ver > 12) throw new Error("QR data too large");

    const [,ecBlocks, ecPerBlock, totalData] = VER[ver];
    const size = ver * 4 + 17;

    // Encode data bits
    const bits = [];
    const pushBits = (val, len) => { for (let i = len-1; i >= 0; i--) bits.push((val>>i)&1); };
    pushBits(0b0100, 4);          // byte mode
    pushBits(dataLen, 8);
    for (const b of bytes) pushBits(b, 8);
    pushBits(0, Math.min(4, totalData*8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const pads = [0b11101100, 0b00010001];
    while (bits.length < totalData * 8) { bits.push(...pads[0].toString(2).padStart(8,'0').split('').map(Number)); bits.push(...pads[1].toString(2).padStart(8,'0').split('').map(Number)); }

    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8)
      dataBytes.push(parseInt(bits.slice(i,i+8).join(''), 2));

    // RS error correction
    const blockSize = Math.floor(dataBytes.length / ecBlocks);
    const extraBlocks = dataBytes.length % ecBlocks;
    const dataBlocks = [], ecBlock = [];
    let pos = 0;
    for (let b = 0; b < ecBlocks; b++) {
      const len = blockSize + (b >= ecBlocks - extraBlocks ? 1 : 0);
      dataBlocks.push(dataBytes.slice(pos, pos+len));
      ecBlock.push(rsEncode(dataBytes.slice(pos, pos+len), ecPerBlock));
      pos += len;
    }

    // Interleave
    const interleaved = [];
    const maxD = Math.max(...dataBlocks.map(b=>b.length));
    for (let i = 0; i < maxD; i++) for (const b of dataBlocks) if (i < b.length) interleaved.push(b[i]);
    for (let i = 0; i < ecPerBlock; i++) for (const b of ecBlock) interleaved.push(b[i]);

    // Build bitstream
    const finalBits = [];
    for (const byte of interleaved) for (let i = 7; i >= 0; i--) finalBits.push((byte>>i)&1);

    // Build matrix
    const matrix = Array.from({length: size}, () => new Array(size).fill(-1));
    const isFunc = Array.from({length: size}, () => new Array(size).fill(false));

    const setFn = (r,c,v) => { matrix[r][c]=v; isFunc[r][c]=true; };

    // Finder patterns
    const finder = (r,c) => {
      for (let dr=-1; dr<=7; dr++) for (let dc=-1; dc<=7; dc++) {
        if (r+dr<0||r+dr>=size||c+dc<0||c+dc>=size) continue;
        const inOuter = dr>=0&&dr<=6&&(dc===0||dc===6)||(dc>=0&&dc<=6&&(dr===0||dr===6));
        const inInner = dr>=2&&dr<=4&&dc>=2&&dc<=4;
        setFn(r+dr, c+dc, inOuter||inInner ? 1 : 0);
      }
    };
    finder(0,0); finder(0,size-7); finder(size-7,0);

    // Separators (already covered by finder -1 offset)
    // Timing patterns
    for (let i = 8; i < size-8; i++) { setFn(6,i, i%2===0?1:0); setFn(i,6, i%2===0?1:0); }

    // Dark module
    setFn(size-8, 8, 1);

    // Alignment patterns
    if (ver >= 2) {
      const pos = ALIGN[ver];
      for (const r of pos) for (const c of pos) {
        if (isFunc[r][c]) continue;
        for (let dr=-2; dr<=2; dr++) for (let dc=-2; dc<=2; dc++) {
          setFn(r+dr, c+dc, Math.abs(dr)===2||Math.abs(dc)===2||(dr===0&&dc===0)?1:0);
        }
      }
    }

    // Format placeholders
    for (let i = 0; i <= 8; i++) {
      if (!isFunc[6][i]) setFn(6,i,0);
      if (!isFunc[i][6]) setFn(i,6,0);
      if (!isFunc[8][i]) setFn(8,i,0);
      if (!isFunc[i][8]) setFn(i,8,0);
    }
    for (let i = size-8; i < size; i++) { setFn(8,i,0); setFn(i,8,0); }

    // Place data bits
    let bitIdx = 0;
    let up = true;
    for (let right = size-1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const row = up ? size-1-vert : vert;
        for (let lr = 0; lr < 2; lr++) {
          const col = right - lr;
          if (!isFunc[row][col]) {
            matrix[row][col] = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          }
        }
      }
      up = !up;
    }

    // Apply mask 0: (row+col) % 2 === 0
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!isFunc[r][c] && (r+c)%2===0) matrix[r][c] ^= 1;

    // Format info (mask 0, EC level M = 0b00)
    const fmt = 0b000000101001;
    const fmtMask = 0b101010000010010;
    const fmtBits = (fmt ^ fmtMask).toString(2).padStart(15,'0').split('').map(Number);
    const fmtPos = [0,1,2,3,4,5,7,8,size-7,size-6,size-5,size-4,size-3,size-2,size-1];
    for (let i = 0; i < 15; i++) {
      setFn(8, fmtPos[i], fmtBits[i]);
      setFn(fmtPos[14-i], 8, fmtBits[i]);
    }

    return { matrix, size };
  }

  // Render to canvas
  function toCanvas(canvas, text, pixelSize = 4) {
    let m, size;
    try { ({ matrix: m, size } = encode(text)); }
    catch { return false; }
    const quiet = 2;
    const total = (size + quiet*2) * pixelSize;
    canvas.width = total; canvas.height = total;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,total,total);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (m[r][c] === 1)
          ctx.fillRect((c+quiet)*pixelSize, (r+quiet)*pixelSize, pixelSize, pixelSize);
    return true;
  }

  return { toCanvas };
})();

// ── QR Canvas component ───────────────────────────────────────────────────────
function QRCanvas({ value }) {
  const canvasRef = useRef();
  const [error, setError] = useState(false);
  const [canvasSize, setCanvasSize] = useState(0);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    setError(false);
    try {
      const ok = QRCode.toCanvas(canvasRef.current, value, 3);
      if (ok) {
        // Read the actual canvas size AFTER drawing
        setCanvasSize(canvasRef.current.width);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, [value]);

  if (error || !value) {
    return <div className="rp__qr-placeholder">QR</div>;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        // Use the actual drawn canvas width — never let CSS override it
        width:  canvasSize || 'auto',
        height: canvasSize || 'auto',
        imageRendering: 'pixelated',
        border: '6px solid #ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    />
  );
}

// ── Receipt Preview ───────────────────────────────────────────────────────────
function ReceiptPreview({ shop, invoice, items, settings }) {
  const { paperWidth = 58, showQR = true, showSignature = true, showTerms = true } = settings;
  const LINE_W = paperWidth >= 80 ? 48 : 32;
  const isWide = paperWidth >= 80;

  const fa = (n) => `₹${Number(n || 0).toFixed(2)}`;
  const fd = (d) => {
    if (!d) return '';
    const [y, m, day] = String(d).split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  };
  const divider = (ch = '─') => ch.repeat(LINE_W);

  const isUnpaid = invoice?.payment_status === 'unpaid';
  const upiAmt = isUnpaid ? invoice?.amount_due : invoice?.final_amount;
  // Only show QR for unpaid invoices — paid invoices need no QR or bank details
  const upiStr = showQR && shop?.upi && isUnpaid
    ? buildUPIString({ upiId: shop.upi, shopName: shop.name, amount: upiAmt, invoiceNo: invoice?.invoice_no })
    : null;

  return (
    <div className={`receipt-preview ${isWide ? 'receipt-preview--wide' : ''}`}>
      {/* HEADER */}
      <div className="rp__center rp__bold rp__large">{shop?.name || 'Shop Name'}</div>
      {shop?.address && <div className="rp__center rp__small">{shop.address}</div>}
      {shop?.phone   && <div className="rp__center rp__small">Ph: {shop.phone}</div>}
      {shop?.email   && <div className="rp__center rp__small">{shop.email}</div>}
      {shop?.gstin   && <div className="rp__center rp__small">GSTIN: {shop.gstin}</div>}
      {shop?.fssai   && <div className="rp__center rp__small">FSSAI: {shop.fssai}</div>}

      <div className="rp__divider">{divider()}</div>
      <div className="rp__center rp__bold">RECEIPT</div>
      <div className="rp__divider">{divider()}</div>

      {/* META */}
      <div className="rp__row"><span>Customer</span><span>{invoice?.customer_name || '—'}</span></div>
      <div className="rp__row"><span>Phone</span><span>{invoice?.customer_phone || '—'}</span></div>
      <div className="rp__row"><span>Date</span><span>{fd(invoice?.date)}</span></div>
      <div className="rp__row"><span>Invoice#</span><span>{invoice?.invoice_no || '—'}</span></div>
      <div className="rp__row">
        <span>Status</span>
        <span className={invoice?.payment_status === 'paid' ? 'rp__paid' : 'rp__unpaid'}>
          {(invoice?.payment_status || 'unpaid').toUpperCase()}
        </span>
      </div>
      {invoice?.payment_status === 'unpaid' && Number(invoice?.amount_due) > 0 && (
        <div className="rp__row rp__bold"><span>Due Amt</span><span>{fa(invoice.amount_due)}</span></div>
      )}

      {/* ITEMS */}
      <div className="rp__divider">{divider()}</div>
      <div className="rp__row rp__bold">
        <span className="rp__item-name"># Item</span>
        <span className="rp__item-qty">Qty</span>
        <span className="rp__item-amt">Amount</span>
      </div>
      <div className="rp__divider">{divider()}</div>
      {(items || []).map((item, i) => (
        <div key={i}>
          <div className="rp__row">
            <span className="rp__item-name">{i + 1}. {item.product_name}</span>
            <span className="rp__item-qty">{Number(item.quantity)}{item.unit?.slice(0,3) || ''}</span>
            <span className="rp__item-amt">{fa(item.total != null ? item.total : item.quantity * item.price)}</span>
          </div>
          {Number(item.quantity) !== 1 && (
            <div className="rp__small rp__indent">{fa(item.price)}/unit</div>
          )}
          {Number(item.discount) > 0 && (
            <div className="rp__small rp__indent">Disc: -{fa(item.discount)}</div>
          )}
        </div>
      ))}

      {/* TOTALS */}
      <div className="rp__divider">{divider()}</div>
      <div className="rp__row"><span>Items: {(items||[]).length}</span><span>{fa(invoice?.subtotal)}</span></div>
      {Number(invoice?.discount_total) > 0 && (
        <div className="rp__row"><span>Discount</span><span>-{fa(invoice.discount_total)}</span></div>
      )}
      
      <div className="rp__divider">{divider('═')}</div>
<div className="rp__center rp__bold rp__total">TOTAL: {fa(invoice?.final_amount)}</div>
<div className="rp__divider">{divider('═')}</div>

{/* Received & Balance — shown for partial and unpaid invoices */}
<div className="rp__row">
  <span>Received</span>
  <span>{fa(Number(invoice?.amount_received) || 0)}</span>
</div>
{Number(invoice?.amount_due) > 0 && (
  <div className="rp__row rp__bold" style={{ color: '#e07070' }}>
    <span>Balance Due</span>
    <span>{fa(invoice?.amount_due)}</span>
  </div>
)}
{Number(invoice?.amount_due) === 0 && (
  <div className="rp__row" style={{ color: '#70c49a' }}>
    <span>Balance</span>
    <span>PAID</span>
  </div>
)}
<div className="rp__divider">{divider('═')}</div>

      {/* UPI QR — rendered via pure-JS canvas, no network needed */}
      {upiStr ? (
        <div className="rp__qr-block">
          <div className="rp__center rp__bold">Scan to Pay (UPI)</div>
          <QRCanvas value={upiStr} />
          <div className="rp__center rp__small">{shop?.upi}</div>
          <div className="rp__divider">{divider()}</div>
        </div>
      ) : shop?.upi === '' || !shop?.upi ? null : null}

      {/* Bank details — only for unpaid invoices with no UPI */}
      {isUnpaid && !upiStr && shop?.bank && (
        <>
          <div className="rp__center rp__bold">Bank Payment</div>
          {shop.bank    && <div className="rp__row"><span>Bank</span><span>{shop.bank}</span></div>}
          {shop.account && <div className="rp__row"><span>A/C</span><span>{shop.account}</span></div>}
          {shop.ifsc    && <div className="rp__row"><span>IFSC</span><span>{shop.ifsc}</span></div>}
          <div className="rp__divider">{divider()}</div>
        </>
      )}

      {/* TERMS */}
      {showTerms && shop?.terms && (
        <>
          <div className="rp__center rp__small rp__bold">Terms & Conditions</div>
          <div className="rp__center rp__small">{shop.terms}</div>
          <div className="rp__divider">{divider()}</div>
        </>
      )}

      {/* SIGNATURE */}
      {showSignature && shop?.signatory && (
        <>
          <div className="rp__right rp__cursive">{shop.signatory}</div>
          <div className="rp__right rp__small">Authorised Signatory</div>
          <div className="rp__divider">{divider()}</div>
        </>
      )}

      <div className="rp__center rp__small rp__muted">Powered by Leo Billing</div>
    </div>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────
function BTStatus({ status }) {
  const map = {
    idle:         { color: '#4e4b63', label: 'Not Connected' },
    scanning:     { color: '#c9a96e', label: 'Scanning…' },
    connecting:   { color: '#c9a96e', label: 'Connecting…' },
    discovering:  { color: '#c9a96e', label: 'Discovering services…' },
    connected:    { color: '#70c49a', label: 'Connected' },
    disconnected: { color: '#e07070', label: 'Disconnected' },
    error:        { color: '#e07070', label: 'Error' },
  };
  const { color, label } = map[status] || map.idle;
  return (
    <span className="bt-status">
      <span className="bt-status__dot" style={{
        background: color,
        boxShadow: status === 'connected' ? `0 0 8px ${color}` : 'none',
      }} />
      {label}
    </span>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }) {
  return (
    <label className="tp__toggle">
      <span className="tp__toggle-label">{label}</span>
      <button
        className={`tp__pill ${checked ? 'tp__pill--on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-label={label}
      >
        <span className="tp__pill-thumb" />
      </button>
    </label>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
function Select({ label, value, onChange, options }) {
  return (
    <div className="tp__field">
      <label className="tp__label">{label}</label>
      <select className="tp__select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ label, value, onChange, min = 1, max = 5 }) {
  return (
    <div className="tp__field">
      <label className="tp__label">{label}</label>
      <div className="tp__stepper">
        <button className="tp__step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <span className="tp__step-val">{value}</span>
        <button className="tp__step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ThermalPrint() {
  const { id } = useParams();
  const { user } = useAuth();

  const [invoice,  setInvoice]  = useState(null);
  const [items,    setItems]    = useState([]);
  const [shop,     setShop]     = useState(null);
  const [loading,  setLoading]  = useState(true);

  const [btStatus, setBtStatus] = useState('idle');
  const [connName, setConnName] = useState('');
  const [printing, setPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [toasts, setToasts] = useState([]);

  const [settings, setSettings] = useState({
    paperWidth:    58,
    fontSize:      'normal',
    showQR:        true,
    showSignature: true,
    showTerms:     true,
    autoCut:       true,
  });
  const [copies, setCopies] = useState(1);

  const setSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const addToast = useCallback((message, type = 'success') => {
    const tid = Date.now() + Math.random();
    setToasts(t => [...t, { id: tid, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 4500);
  }, []);

  // Load invoice + profile
  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const [inv, profile] = await Promise.all([
          getInvoiceWithItems(id),
          getProfile(user.uid),
        ]);
        setInvoice(inv);
        setItems(inv.items || []);
        setShop({
          name:      profile?.shop_name || 'Your Shop',
          address:   [profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(', '),
          phone:     profile?.phone    || '',
          email:     profile?.email    || '',
          gstin:     profile?.gstin    || '',
          fssai:     profile?.fssai_no || '',
          upi:       profile?.upi_id   || '',
          bank:      profile?.bank_name  || '',
          account:   profile?.account_no || '',
          ifsc:      profile?.ifsc_code  || '',
          terms:     profile?.terms      || 'Thank you for doing business with us.',
          signatory: profile?.signatory_name || '',
        });
      } catch (err) {
        addToast('Failed to load invoice: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id, addToast]);

  // Restore connection state
  useEffect(() => {
    const state = getConnectionState();
    if (state.connected) {
      setBtStatus('connected');
      setConnName(state.deviceName);
    }
  }, []);

  const handleConnect = async () => {
    if (btStatus === 'connected') {
      disconnectBluetooth();
      setBtStatus('idle');
      setConnName('');
      return;
    }
    try {
      setBtStatus('scanning');
      const result = await connectBluetooth(setBtStatus);
      setConnName(result.deviceName);
      addToast(`✓ Connected to ${result.deviceName}`);
    } catch (err) {
      setBtStatus('error');
      // Show full descriptive error message
      addToast(err.message || 'Bluetooth connection failed', 'error');
      setTimeout(() => setBtStatus('idle'), 4000);
    }
  };

  const handlePrint = async () => {
    if (!invoice || !shop) return;
    if (btStatus !== 'connected' && !isNativeApp()) {
      addToast('Connect to a printer first', 'error');
      return;
    }
    setPrinting(true);
    try {
      await thermalPrint({ shop, invoice, items, settings, copies });
      addToast(`✓ Printed ${copies} copy${copies > 1 ? 's' : ''} successfully!`);
    } catch (err) {
      addToast('Print failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const btSupported = isBluetoothSupported();
  const nativeApp   = isNativeApp();
  const canPrint    = btStatus === 'connected' || nativeApp;

  if (loading) {
    return (
      <div className="tp-page">
        <div className="tp__skeleton">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="tp__skeleton-bar" style={{ animationDelay: `${i * 80}ms`, width: `${90 - i*10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tp-page">
      <Toast toasts={toasts} />

      {/* ── PAGE HEADER ── */}
      <div className="tp__header">
        <div>
          <p className="tp__eyebrow">Invoice · {invoice?.invoice_no}</p>
          <h1 className="tp__title">Thermal Print</h1>
          <p className="tp__subtitle">{shop?.name} · {invoice?.customer_name}</p>
        </div>
        <Link to={`/invoices/view/${id}`} className="tp__back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          Back
        </Link>
      </div>

      {/* ── BLUETOOTH STATUS BAR ── */}
      <div className={`tp__bt-bar ${btStatus === 'connected' ? 'tp__bt-bar--connected' : btStatus === 'error' ? 'tp__bt-bar--error' : ''}`}>
        <div className="tp__bt-bar-left">
          {/* Bluetooth icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6.5,6.5 17.5,17.5"/>
            <polyline points="17.5,6.5 12,12 17.5,17.5"/>
            <polyline points="6.5,6.5 12,12"/>
          </svg>
          <div>
            <BTStatus status={btStatus} />
            {connName && <div className="tp__bt-device">{connName}</div>}
            {/* Show helpful hint when not connected */}
            {btStatus === 'idle' && (
              <div className="tp__bt-hint">
                {nativeApp
                  ? 'Tap "Connect Printer" — make sure printer is ON and Bluetooth is enabled'
                  : 'Web Bluetooth requires Chrome or Edge on desktop'}
              </div>
            )}
            {btStatus === 'error' && (
              <div className="tp__bt-warn">
                Check Bluetooth is ON · printer is powered · app has Nearby Devices permission
              </div>
            )}
          </div>
        </div>
        <button
          className={`tp__bt-btn ${btStatus === 'connected' ? 'tp__bt-btn--disconnect' : ''}`}
          onClick={handleConnect}
          disabled={['scanning','connecting','discovering'].includes(btStatus)}
        >
          {btStatus === 'connected' ? 'Disconnect' :
           ['scanning','connecting','discovering'].includes(btStatus) ? (
            <><span className="tp__spinner" />Connecting…</>
           ) : 'Connect Printer'}
        </button>
      </div>

      {/* Android permission guide — shown when error on native */}
      {btStatus === 'error' && nativeApp && (
        <div className="tp__permission-guide">
          <div className="tp__permission-guide-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Fix Bluetooth Permission on Android
          </div>
          <ol className="tp__permission-steps">
            <li>Open <strong>Android Settings</strong></li>
            <li>Go to <strong>Apps → Leo Billing</strong></li>
            <li>Tap <strong>Permissions → Nearby devices</strong></li>
            <li>Select <strong>Allow</strong></li>
            <li>Come back and tap <strong>Connect Printer</strong> again</li>
          </ol>
        </div>
      )}

      {/* ── TABS ── */}
      <div className="tp__tabs">
        <button className={`tp__tab ${activeTab === 'preview' ? 'tp__tab--active' : ''}`} onClick={() => setActiveTab('preview')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
          Preview
        </button>
        <button className={`tp__tab ${activeTab === 'settings' ? 'tp__tab--active' : ''}`} onClick={() => setActiveTab('settings')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
      </div>

      {/* ── CONTENT ── */}
      <div className="tp__content">
        {activeTab === 'preview' && (
          <div className="tp__preview-wrap">
            <div className="tp__preview-label">Receipt Preview · {settings.paperWidth}mm paper</div>
            <ReceiptPreview shop={shop} invoice={invoice} items={items} settings={settings} />
            {!shop?.upi && (
              <div className="tp__qr-notice">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                No UPI ID — add in Profile to show payment QR
              </div>
            )}
            <div className="tp__preview-note">
              Preview approximates thermal output. Actual print may vary by printer model.
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tp__settings-wrap">

            {/* Paper Settings */}
            <div className="tp__group">
              <div className="tp__group-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                Paper Settings
              </div>
              <Select
                label="Paper Width"
                value={String(settings.paperWidth)}
                onChange={v => setSetting('paperWidth', Number(v))}
                options={[
                  { value: '58', label: '58mm — 2 inch (default)' },
                  { value: '80', label: '80mm — 3 inch' },
                ]}
              />
              <Select
                label="Font Size"
                value={settings.fontSize}
                onChange={v => setSetting('fontSize', v)}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'small',  label: 'Small (compact)' },
                ]}
              />
            </div>

            {/* Receipt Content */}
            <div className="tp__group">
              <div className="tp__group-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                Receipt Content
              </div>
              <Toggle label="Show UPI QR Code"  checked={settings.showQR}        onChange={v => setSetting('showQR', v)} />
              <Toggle label="Show Signature"     checked={settings.showSignature} onChange={v => setSetting('showSignature', v)} />
              <Toggle label="Show Terms"         checked={settings.showTerms}     onChange={v => setSetting('showTerms', v)} />
            </div>

            {/* Printer Hardware */}
            <div className="tp__group">
              <div className="tp__group-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Printer Settings
              </div>
              <Toggle label="Auto-cut Paper" checked={settings.autoCut} onChange={v => setSetting('autoCut', v)} />
              <Stepper label="Copies" value={copies} onChange={setCopies} min={1} max={5} />
            </div>

            {/* UPI Info */}
            {shop?.upi ? (
              <div className="tp__group tp__group--info">
                <div className="tp__group-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  UPI Payment QR
                </div>
                <div className="tp__info-row">
                  <span className="tp__info-label">UPI ID</span>
                  <span className="tp__info-val">{shop.upi}</span>
                </div>
                <div className="tp__info-row">
                  <span className="tp__info-label">Amount in QR</span>
                  <span className="tp__info-val">
                    ₹{Number(invoice?.payment_status === 'unpaid' ? invoice?.amount_due : invoice?.final_amount || 0).toFixed(2)}
                    {invoice?.payment_status === 'paid' ? ' (Paid)' : ' (Due)'}
                  </span>
                </div>
                <div className="tp__info-note">
                  QR encodes invoice number &amp; exact amount. Customer scans to pay directly via any UPI app.
                  Generated offline — no internet needed.
                </div>
              </div>
            ) : (
              <div className="tp__group tp__group--warn">
                <div className="tp__group-title">UPI QR Code</div>
                <div className="tp__info-note">
                  No UPI ID found. Add your UPI ID in <strong>Profile → Bank/UPI Details</strong> to enable payment QR on receipts.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM PRINT BAR ── */}
      <div className="tp__print-bar">
        <div className="tp__print-bar-info">
          <div className="tp__print-amt">₹{Number(invoice?.amount_due || 0).toFixed(2)}</div>
          <div className="tp__print-meta">
            {settings.paperWidth}mm · {copies} cop{copies !== 1 ? 'ies' : 'y'}
            {settings.autoCut ? ' · Auto-cut' : ''}
          </div>
        </div>
        <button
          className={`tp__print-btn ${!canPrint ? 'tp__print-btn--disabled' : ''} ${printing ? 'tp__print-btn--printing' : ''}`}
          onClick={handlePrint}
          disabled={printing || !canPrint}
        >
          {printing ? (
            <><span className="tp__spinner" />Printing…</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 6,2 18,2 18,9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              {canPrint ? 'Print Receipt' : 'Connect Printer First'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}