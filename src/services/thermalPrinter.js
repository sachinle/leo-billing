// ══════════════════════════════════════════════════════════════════════════════
//  thermalPrinter.js  — Leo Billing · Thermal Print Service
//
//  ANDROID BLE FIX:
//  Capacitor's Android WebView deliberately BLOCKS navigator.bluetooth
//  (Web Bluetooth API). The ONLY working solution for Capacitor Android is:
//    @capacitor-community/bluetooth-le
//  This plugin bridges to real Android BLE APIs natively and shows a proper
//  device picker popup with all nearby BLE devices listed.
//
//  SETUP (run once):
//    npm install @capacitor-community/bluetooth-le
//    npx cap sync android
// ══════════════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";

// ── ESC/POS Commands ─────────────────────────────────────────────────────────
const ESC=0x1B, GS=0x1D, LF=0x0A;
export const CMD = {
  INIT:[ESC,0x40], ALIGN_LEFT:[ESC,0x61,0x00], ALIGN_CENTER:[ESC,0x61,0x01],
  ALIGN_RIGHT:[ESC,0x61,0x02], BOLD_ON:[ESC,0x45,0x01], BOLD_OFF:[ESC,0x45,0x00],
  DOUBLE_HEIGHT:[ESC,0x21,0x10], DOUBLE_SIZE:[ESC,0x21,0x30], NORMAL_SIZE:[ESC,0x21,0x00],
  FONT_SMALL:[ESC,0x21,0x01], FONT_NORMAL:[ESC,0x21,0x00], LINE_SPACING:[ESC,0x33,0x20],
  CUT_FULL:[GS,0x56,0x00], CUT_PARTIAL:[GS,0x56,0x01],
  FEED_3:[ESC,0x64,0x03], FEED_5:[ESC,0x64,0x05],
  QR_MODEL2:[GS,0x28,0x6B,0x04,0x00,0x31,0x41,0x32,0x00],
  QR_SIZE: (s) => [GS,0x28,0x6B,0x03,0x00,0x31,0x43,s],
  QR_ERROR_M: [GS,0x28,0x6B,0x03,0x00,0x31,0x45,0x30],
  QR_STORE: (d) => { const l=d.length+3; return [GS,0x28,0x6B,l&0xFF,(l>>8)&0xFF,0x31,0x50,0x30,...d]; },
  QR_PRINT: [GS,0x28,0x6B,0x03,0x00,0x31,0x51,0x30],
};

const enc = new TextEncoder();
const tx  = (s) => Array.from(enc.encode((s||"").replace(/₹/g,"Rs.").replace(/—/g,"-")));
const ln  = (s="") => [...tx(s), LF];
const div = (w=32, c="-") => ln(c.repeat(w));
const pr  = (s,n) => { s=String(s||""); return s.length>=n ? s.slice(0,n) : s+" ".repeat(n-s.length); };
const pl  = (s,n) => { s=String(s||""); return s.length>=n ? s.slice(0,n) : " ".repeat(n-s.length)+s; };

// ── UPI String builder ───────────────────────────────────────────────────────
export function buildUPIString({ upiId, shopName, amount, invoiceNo }) {
  if (!upiId) return null;
  const p = new URLSearchParams({
    pa: upiId, pn: shopName || "Shop",
    am: Number(amount || 0).toFixed(2),
    tn: `Inv ${invoiceNo || ""}`, cu: "INR",
  });
  return `upi://pay?${p.toString()}`;
}

// ── Known ESC/POS BLE service UUIDs ─────────────────────────────────────────
const PRINT_SVCS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

// ── State ────────────────────────────────────────────────────────────────────
let _nativeId   = null;
let _nativeSvc  = null;
let _nativeChar = null;
let _webChar    = null;
let _webDev     = null;
let _name       = null;

export const isNativeApp          = () => Capacitor.isNativePlatform();
export const isBluetoothSupported = () =>
  isNativeApp() || (typeof navigator !== "undefined" && !!navigator.bluetooth);

export const getConnectionState = () =>
  (_nativeId || _webChar)
    ? { connected: true,  deviceName: _name || "Printer" }
    : { connected: false, deviceName: null };

// ── NATIVE BLE via @capacitor-community/bluetooth-le ─────────────────────────
async function getBleClient() {
  const mod = await import("@capacitor-community/bluetooth-le");
  return mod.BleClient;
}

async function connectNative(onStatus) {
  let BleClient;
  try {
    BleClient = await getBleClient();
  } catch {
    throw new Error(
      "BLE plugin missing. Run in your project folder:\n" +
      "npm install @capacitor-community/bluetooth-le\n" +
      "npx cap sync android"
    );
  }

  // Initialize — triggers Android runtime permission dialog for Nearby Devices
  onStatus?.("scanning");
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
  } catch (e) {
    throw new Error(
      "Bluetooth init failed. Please:\n" +
      "1. Turn ON Bluetooth\n" +
      "2. Settings → Apps → Leo Billing → Permissions → Nearby Devices → Allow"
    );
  }

  // Request device — shows OS popup listing all visible BLE devices
  let device;
  try {
    device = await BleClient.requestDevice({
      optionalServices: PRINT_SVCS,
    });
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("cancel") || msg.includes("user")) {
      throw new Error("No printer selected. Tap Connect and pick your printer.");
    }
    throw new Error(
      "Could not open device list. Make sure Bluetooth is ON and Nearby Devices permission is allowed.\n" +
      "Error: " + (e?.message || "unknown")
    );
  }

  _name     = device.name || device.deviceId || "Bluetooth Printer";
  _nativeId = device.deviceId;

  // Connect
  onStatus?.("connecting");
  try {
    await BleClient.connect(_nativeId, () => {
      _nativeId = null; _nativeSvc = null; _nativeChar = null; _name = null;
      onStatus?.("disconnected");
    });
  } catch {
    _nativeId = null;
    throw new Error(`Could not connect to "${_name}". Make sure it is ON and within range.`);
  }

  // Discover writable characteristic
  onStatus?.("discovering");
  let foundSvc = null, foundChar = null;

  for (const svcUUID of PRINT_SVCS) {
    try {
      const chars = await BleClient.getCharacteristics(_nativeId, svcUUID);
      if (chars?.length) {
        const w = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
        if (w) { foundSvc = svcUUID; foundChar = w.uuid; break; }
      }
    } catch { /* try next */ }
  }

  // Fallback: enumerate all services
  if (!foundSvc) {
    try {
      const svcs = await BleClient.getServices(_nativeId);
      outer: for (const s of (svcs || [])) {
        for (const ch of (s.characteristics || [])) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            foundSvc = s.uuid; foundChar = ch.uuid; break outer;
          }
        }
      }
    } catch { /* ignore */ }
  }

  if (!foundSvc || !foundChar) {
    await BleClient.disconnect(_nativeId).catch(() => {});
    _nativeId = null;
    throw new Error(
      `"${_name}" connected but no ESC/POS service found. ` +
      "This device may not be a supported thermal printer."
    );
  }

  _nativeSvc  = foundSvc;
  _nativeChar = foundChar;
  onStatus?.("connected");
  return { deviceName: _name };
}

async function sendNative(bytes) {
  if (!_nativeId || !_nativeSvc || !_nativeChar) throw new Error("Printer not connected.");
  const BleClient = await getBleClient();
  const CHUNK = 512;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    const dv    = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    try {
      await BleClient.writeWithoutResponse(_nativeId, _nativeSvc, _nativeChar, dv);
    } catch {
      await BleClient.write(_nativeId, _nativeSvc, _nativeChar, dv);
    }
    if (bytes.length > CHUNK) await new Promise(r => setTimeout(r, 20));
  }
}

async function disconnectNative() {
  if (!_nativeId) return;
  try { const B = await getBleClient(); await B.disconnect(_nativeId); } catch {}
  _nativeId = null; _nativeSvc = null; _nativeChar = null; _name = null;
}

// ── WEB BLUETOOTH — desktop Chrome/Edge only ──────────────────────────────────
async function connectWeb(onStatus) {
  if (!navigator.bluetooth) {
    throw new Error(
      "Web Bluetooth is not available.\n" +
      "On desktop: use Chrome or Edge.\n" +
      "On Android: use the Leo Billing app."
    );
  }
  onStatus?.("scanning");
  let device;
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINT_SVCS,
    });
  } catch (e) {
    if (e.name === "NotFoundError") throw new Error("No device selected.");
    if (e.name === "SecurityError")  throw new Error("Bluetooth permission denied.");
    throw new Error("Bluetooth error: " + e.message);
  }

  _webDev = device;
  _name   = device.name || "Bluetooth Printer";
  onStatus?.("connecting");
  const server = await device.gatt.connect().catch(() => {
    throw new Error(`Could not connect to "${_name}". Make sure it is ON and in range.`);
  });

  onStatus?.("discovering");
  let svc = null;
  for (const uuid of PRINT_SVCS) {
    try { svc = await server.getPrimaryService(uuid); if (svc) break; } catch {}
  }
  if (!svc) { const all = await server.getPrimaryServices().catch(() => []); svc = all[0] ?? null; }
  if (!svc) throw new Error("No compatible printer service found.");

  const chars = await svc.getCharacteristics().catch(() => []);
  _webChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse) ?? null;
  if (!_webChar) throw new Error("No writable characteristic found.");

  device.addEventListener("gattserverdisconnected", () => {
    _webChar = null; _webDev = null; onStatus?.("disconnected");
  });
  onStatus?.("connected");
  return { deviceName: _name };
}

async function sendWeb(bytes) {
  if (!_webChar) throw new Error("Printer not connected.");
  const CHUNK = 512;
  const useWWR = _webChar.properties.writeWithoutResponse;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    if (useWWR) await _webChar.writeValueWithoutResponse(chunk);
    else        await _webChar.writeValue(chunk);
    if (bytes.length > CHUNK) await new Promise(r => setTimeout(r, 20));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function connectBluetooth(onStatus) {
  return isNativeApp() ? connectNative(onStatus) : connectWeb(onStatus);
}

export function disconnectBluetooth() {
  if (isNativeApp()) { disconnectNative(); }
  else { try { _webDev?.gatt?.disconnect(); } catch {} _webChar = null; _webDev = null; _name = null; }
}

// ── Build Receipt bytes (ESC/POS) ─────────────────────────────────────────────
export function buildReceipt({ shop, invoice, items, settings }) {
  const {
    paperWidth=58, fontSize="normal",
    showQR=true, showSignature=true, showTerms=true, autoCut=true,
  } = settings || {};

  const W  = paperWidth >= 80 ? 48 : 32;
  const IW = paperWidth >= 80 ? 24 : 14;
  const QW = paperWidth >= 80 ?  8 :  6;
  const AW = paperWidth >= 80 ? 10 :  9;

  const b    = [];
  const push = (...cmds) => cmds.forEach(cmd => b.push(...(Array.isArray(cmd) ? cmd : [cmd])));
  const fa   = (n) => `Rs.${Number(n||0).toFixed(2)}`;
  const fd   = (d) => {
    if (!d) return "";
    const [y,m,day] = String(d).split("T")[0].split("-");
    return `${day}/${m}/${y}`;
  };

  push(CMD.INIT, CMD.LINE_SPACING);
  if (fontSize === "small") push(CMD.FONT_SMALL);

  push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  push(...ln(shop.name));
  push(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  if (shop.address) push(...ln(shop.address));
  if (shop.phone)   push(...ln(`Ph: ${shop.phone}`));
  if (shop.email)   push(...ln(shop.email));
  if (shop.gstin)   push(...ln(`GSTIN: ${shop.gstin}`));
  if (shop.fssai)   push(...ln(`FSSAI: ${shop.fssai}`));

  push(...div(W));
  push(CMD.BOLD_ON); push(...ln("TAX INVOICE")); push(CMD.BOLD_OFF);
  push(...div(W));

  push(CMD.ALIGN_LEFT);
  push(...ln(`Customer : ${invoice.customer_name  || ""}`));
  push(...ln(`Phone    : ${invoice.customer_phone || ""}`));
  push(...ln(`Date     : ${fd(invoice.date)}`));
  push(...ln(`Invoice# : ${invoice.invoice_no     || ""}`));
  push(...ln(`Status   : ${(invoice.payment_status || "unpaid").toUpperCase()}`));
  if (invoice.payment_status === "unpaid" && Number(invoice.amount_due) > 0) {
    push(CMD.BOLD_ON);
    push(...ln(`Due Amt  : ${fa(invoice.amount_due)}`));
    push(CMD.BOLD_OFF);
  }

  push(...div(W));
  push(CMD.BOLD_ON);
  push(...ln(pr("#  Item", IW+3) + pr("Qty", QW) + pl("Amount", AW)));
  push(CMD.BOLD_OFF);
  push(...div(W));

  (items || []).forEach((item, i) => {
    const name = String(item.product_name || "Item");
    const num  = `${i+1}. `;
    const qty  = `${Number(item.quantity)||1}${item.unit ? item.unit.slice(0,3) : ""}`;
    const amt  = fa(item.total != null ? item.total : (item.quantity * item.price));
    const full = num + name;
    if (full.length > IW+3) {
      push(...ln(full));
      push(...ln(pr("", IW+3) + pr(qty, QW) + pl(amt, AW)));
    } else {
      push(...ln(pr(full, IW+3) + pr(qty, QW) + pl(amt, AW)));
    }
    if (Number(item.quantity) !== 1) {
      push(CMD.FONT_SMALL); push(...ln(`   ${fa(item.price)}/unit`)); push(CMD.FONT_NORMAL);
    }
    if (Number(item.discount) > 0) {
      push(CMD.FONT_SMALL); push(...ln(`   Disc: -${fa(item.discount)}`)); push(CMD.FONT_NORMAL);
    }
  });

  push(...div(W));
const LW = W - 12;
push(...ln(pr(`Items: ${(items||[]).length}`, LW) + pl(fa(invoice.subtotal), 12)));
if (Number(invoice.discount_total) > 0) {
  push(...ln(pr("Discount", LW) + pl(`-${fa(invoice.discount_total)}`, 12)));
}
if (Number(invoice.loyalty_discount_applied) > 0) {
  push(...ln(pr("* Loyalty Reward", LW) + pl(`-${fa(invoice.loyalty_discount_applied)}`, 12)));
}
push(...div(W, "="));
push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT, CMD.ALIGN_CENTER);
push(...ln(`TOTAL: ${fa(invoice.final_amount)}`));
push(CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.ALIGN_LEFT);
push(...div(W, "="));

// Received & Balance
const received = Number(invoice.amount_received) || 0;
const due      = Number(invoice.amount_due)      || 0;
push(...ln(pr("Received", LW) + pl(fa(received), 12)));
if (due > 0) {
  push(CMD.BOLD_ON);
  push(...ln(pr("Balance Due", LW) + pl(fa(due), 12)));
  push(CMD.BOLD_OFF);
} else {
  push(...ln(pr("Balance", LW) + pl("PAID", 12)));
}
push(...div(W));

  const isUnpaid = invoice.payment_status === "unpaid";
  const upiAmt = isUnpaid ? invoice.amount_due : invoice.final_amount;
  const upiStr = showQR && shop.upi && isUnpaid   // ← skip QR if already paid
    ? buildUPIString({ upiId: shop.upi, shopName: shop.name, amount: upiAmt, invoiceNo: invoice.invoice_no })
    : null;

  if (upiStr) {
    const qd = Array.from(enc.encode(upiStr));
    push(CMD.ALIGN_CENTER);
    push(...ln(""));
    push(CMD.BOLD_ON); push(...ln("Scan to Pay (UPI)")); push(CMD.BOLD_OFF);
    push(...CMD.QR_MODEL2);
    push(...CMD.QR_SIZE(paperWidth >= 80 ? 8 : 6));
    push(...CMD.QR_ERROR_M);
    push(...CMD.QR_STORE(qd));
    push(...CMD.QR_PRINT);
    push(CMD.FONT_SMALL); push(...ln(shop.upi)); push(CMD.FONT_NORMAL);
    push(...ln(""));
    push(CMD.ALIGN_LEFT);
    push(...div(W));
  } else if (isUnpaid && shop.bank) {
    // Bank details only for unpaid invoices — paid bills need no payment section
    push(CMD.ALIGN_CENTER, CMD.BOLD_ON); push(...ln("Bank Payment")); push(CMD.BOLD_OFF, CMD.ALIGN_LEFT);
    if (shop.bank)    push(...ln(`Bank : ${shop.bank}`));
    if (shop.account) push(...ln(`A/C  : ${shop.account}`));
    if (shop.ifsc)    push(...ln(`IFSC : ${shop.ifsc}`));
    push(...div(W));
  }

  if (showTerms && shop.terms) {
    push(CMD.ALIGN_CENTER, CMD.FONT_SMALL);
    push(...ln("Terms & Conditions"));
    push(CMD.FONT_NORMAL);
    push(...ln(shop.terms));
    push(...div(W));
  }

  if (showSignature && shop.signatory) {
    push(CMD.ALIGN_RIGHT);
    push(...ln(""));
    push(...ln(shop.signatory));
    push(CMD.FONT_SMALL); push(...ln("Authorised Signatory")); push(CMD.FONT_NORMAL, CMD.ALIGN_LEFT);
    push(...div(W));
  }

  // Loyalty points summary at footer
  const lpEarned  = Number(invoice.loyalty_points_earned)    || 0;
  const lpRedeemed = Number(invoice.loyalty_discount_applied) || 0;
  if (lpEarned > 0 || lpRedeemed > 0) {
    push(CMD.ALIGN_CENTER, CMD.FONT_SMALL);
    push(...ln("--- LOYALTY POINTS ---"));
    if (lpRedeemed > 0) push(...ln(`Reward Used: -Rs.${fa(lpRedeemed)} (1000 pts)`));
    if (lpEarned  > 0) push(...ln(`Points Earned: +${lpEarned} pts`));
    push(CMD.FONT_NORMAL, CMD.ALIGN_LEFT);
    push(...div(W));
  }

  push(CMD.ALIGN_CENTER, CMD.FONT_SMALL);
  push(...ln("Powered by Leo Billing"));
  push(CMD.FONT_NORMAL);
  push(CMD.FEED_5);
  if (autoCut) push(CMD.CUT_PARTIAL);

  return new Uint8Array(b);
}

// ── Print ─────────────────────────────────────────────────────────────────────
export async function print({ shop, invoice, items, settings, copies = 1 }) {
  const bytes = buildReceipt({ shop, invoice, items, settings });
  for (let c = 0; c < copies; c++) {
    if (isNativeApp()) await sendNative(bytes);
    else               await sendWeb(bytes);
    if (c < copies - 1) await new Promise(r => setTimeout(r, 600));
  }
  return true;
}