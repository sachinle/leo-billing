import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * pdfExport.js — works in BOTH Capacitor Android AND web browser
 *
 * WHY THE OLD CODE FAILED ON ANDROID:
 *   - pdf.save(fileName)  → calls <a>.click() internally → WebView blocks it
 *   - link.click()        → WebView blocks <a download> triggers entirely
 *   Files were generated in memory but never written to the phone.
 *
 * THE FIX:
 *   - Detect Capacitor native via window.Capacitor.isNativePlatform()
 *   - If native → convert to base64 → write to phone Downloads via @capacitor/filesystem
 *   - If web    → use original <a>.click() approach (still works in browser)
 */

const A4_PX = 794;

// ── Is this running as a native Capacitor app? ────────────────────────────────
function isNative() {
  try {
    return window?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// ── Force A4 width on element for capture ─────────────────────────────────────
function forceWidth(el) {
  const prev = {
    width:    el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
  };
  el.style.width = el.style.minWidth = el.style.maxWidth = `${A4_PX}px`;
  return prev;
}

function restoreWidth(el, prev) {
  el.style.width    = prev.width;
  el.style.minWidth = prev.minWidth;
  el.style.maxWidth = prev.maxWidth;
}

// ── Reveal hidden receipt element for capture ─────────────────────────────────
// On mobile the A4 receipt is hidden off-screen via CSS (opacity:0, left:-9999px).
// html2canvas needs it actually visible to render content.
async function withReceiptVisible(el, fn) {
  const wrap  = el?.parentElement;
  const style = wrap ? getComputedStyle(wrap) : null;
  const wasHidden = style && (
    style.opacity === '0' ||
    style.visibility === 'hidden' ||
    parseInt(style.left) < -100
  );
  if (wasHidden && wrap) {
    wrap.style.cssText = 'position:fixed;left:0;top:0;width:794px;visibility:visible;opacity:1;pointer-events:none;z-index:-1;overflow:visible';
  }
  try {
    return await fn(el);
  } finally {
    if (wasHidden && wrap) wrap.style.cssText = '';
  }
}

// ── Capture element to canvas ─────────────────────────────────────────────────
async function captureElement(element) {
  return withReceiptVisible(element, async (el) => {
    const prev   = forceWidth(el);
    const canvas = await html2canvas(el, {
      scale: 2, useCORS: true, allowTaint: true,
      backgroundColor: '#ffffff',
      width: A4_PX, windowWidth: A4_PX + 80,
      logging: false,
    });
    restoreWidth(el, prev);
    return canvas;
  });
}

// ── Save file to Android device storage ───────────────────────────────────────
async function saveNative(base64Data, fileName) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');

  // Try multiple locations — Android permissions vary by OS version
  const attempts = [
    { directory: Directory.Downloads,       path: fileName },
    { directory: Directory.ExternalStorage, path: `LeoBilling/${fileName}` },
    { directory: Directory.Documents,       path: `LeoBilling/${fileName}` },
    { directory: Directory.Data,            path: fileName },
  ];

  for (const attempt of attempts) {
    try {
      await Filesystem.writeFile({
        path:      attempt.path,
        data:      base64Data,
        directory: attempt.directory,
        recursive: true,
      });
      console.log(`[pdfExport] ✓ Saved to ${attempt.path}`);
      return attempt.path;
    } catch (err) {
      console.warn(`[pdfExport] Failed ${attempt.path}:`, err.message);
    }
  }
  throw new Error('Could not save file — all storage locations failed');
}

// ── Trigger browser download (web only) ───────────────────────────────────────
function saveInBrowser(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Generate and save a PDF invoice */
export async function generatePDF(element, fileName = 'invoice.pdf') {
  if (!element) throw new Error('No element provided');

  const canvas  = await captureElement(element);
  const imgData = canvas.toDataURL('image/png');
  const pdf     = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW   = pdf.internal.pageSize.getWidth();
  const pageH   = pdf.internal.pageSize.getHeight();
  const imgW    = canvas.width;
  const imgH    = canvas.height;
  const ratio   = pageW / imgW;
  const scaledH = imgH * ratio;

  if (scaledH <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, scaledH);
  } else {
    // Multi-page: slice canvas into page-height chunks
    let yOffset = 0;
    while (yOffset < imgH) {
      const sliceH     = Math.min(pageH / ratio, imgH - yOffset);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = imgW;
      pageCanvas.height = Math.ceil(sliceH);
      pageCanvas.getContext('2d').drawImage(canvas, 0, yOffset, imgW, sliceH, 0, 0, imgW, sliceH);
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, sliceH * ratio);
      yOffset += sliceH;
    }
  }

  if (isNative()) {
    // Android: convert PDF to base64 and write to device storage
    const base64 = pdf.output('datauristring').split(',')[1];
    await saveNative(base64, fileName);
  } else {
    // Browser: trigger download
    const blob = pdf.output('blob');
    saveInBrowser(blob, fileName);
  }
}

/** Generate and save a PNG image invoice */
export async function generateImage(element, fileName = 'invoice.png') {
  if (!element) throw new Error('No element provided');

  const canvas = await captureElement(element);

  if (isNative()) {
    // Android: convert PNG to base64 and write to device storage
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    await saveNative(base64, fileName);
  } else {
    // Browser: trigger download
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    saveInBrowser(blob, fileName);
  }
}

/** Get a PNG blob — used by the Share handler in ViewInvoice */
export async function getImageBlob(element) {
  if (!element) throw new Error('No element provided');
  const canvas = await captureElement(element);
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}