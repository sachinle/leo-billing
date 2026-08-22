// UPI link helpers.
//
// Mirrors the website's src/lib/payment.ts so a QR generated here and
// one generated there behave identically — same parameter names, same
// amount formatting, same reference sanitising.

/** A UPI ID is name@handle. Anything else produces a link that fails
 *  inside the payment app with an unhelpful error. */
export function isValidVpa(vpa) {
  return /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(String(vpa || '').trim());
}

/**
 * Build a upi:// deep link.
 *
 * `am` must be a plain two-decimal number. Locale formatting (₹,
 * thousands separators) makes UPI apps reject the link outright.
 * `tr` must be alphanumeric — some apps silently drop it otherwise.
 */
export function buildUpiUri({ vpa, payeeName, amount, note, ref }) {
  const params = new URLSearchParams({
    pa: String(vpa).trim(),
    pn: String(payeeName || '').trim(),
    cu: 'INR',
  });

  // An amount of zero means "let the payer decide", which is a valid
  // and useful mode — so only set `am` when there is a real figure.
  const amt = Number(amount);
  if (Number.isFinite(amt) && amt > 0) params.set('am', amt.toFixed(2));

  if (note) params.set('tn', String(note).slice(0, 50));
  if (ref) params.set('tr', String(ref).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35));

  return `upi://pay?${params.toString()}`;
}

/** Accounts saved on the profile, newest schema first, falling back to
 *  the original single upi_id field for profiles that predate the list. */
export function enabledUpiAccounts(profile) {
  const list = Array.isArray(profile?.upi_accounts) ? profile.upi_accounts : [];
  const usable = list.filter((a) => a && a.enabled !== false && isValidVpa(a.vpa));
  if (usable.length > 0) return usable;

  return isValidVpa(profile?.upi_id)
    ? [{ label: 'Primary', vpa: profile.upi_id, enabled: true }]
    : [];
}
