import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { getProfile } from '../services/profileService';
import { buildUpiUri, enabledUpiAccounts } from '../utils/upi';
import './ReceivePayment.css';

// Counter payments: type an amount, show a QR, customer scans and pays.
//
// The QR encodes the amount, so the customer can't mistype it — which
// is the whole point over a printed static QR sticker.
//
// Worth being clear: nothing here confirms the money arrived. UPI has
// no callback to this app. The QR gets the payment made; the shopkeeper
// still checks their own bank notification. The screen says so rather
// than implying a confirmed state it can't know.
export default function ReceivePayment() {
  const { user } = useAuth();

  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [amount, setAmount]     = useState('');
  const [note, setNote]         = useState('');
  const [selected, setSelected] = useState(0);

  const [qrDataUrl, setQrDataUrl] = useState('');

  // useAuth() reports `undefined` until Firebase resolves the session,
  // and Layout renders its routes without waiting for that. So `user`
  // genuinely can be undefined on the first render and every access
  // has to tolerate it — reading user.uid directly here is what made
  // this page blank.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile(user.uid);
        if (!cancelled) setProfile(p);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load your profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const accounts = useMemo(() => enabledUpiAccounts(profile), [profile]);
  const account  = accounts[selected] ?? accounts[0] ?? null;

  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;

  const uri = useMemo(() => {
    if (!account) return '';
    return buildUpiUri({
      vpa: account.vpa,
      payeeName: profile?.shop_name || 'Payment',
      amount: validAmount ? amountNum : 0,
      note: note.trim(),
      ref: `RP${Date.now()}`,
    });
  }, [account, profile, amountNum, validAmount, note]);

  // Redraw the QR whenever the link changes. Generated as a data URL so
  // it can be long-pressed and saved, or shown on a second screen.
  useEffect(() => {
    let cancelled = false;
    if (!uri) { setQrDataUrl(''); return; }

    QRCode.toDataURL(uri, { width: 640, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(''); });

    return () => { cancelled = true; };
  }, [uri]);

  if (loading || user === undefined) {
    return <div className="rp"><div className="rp__skeleton" /></div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="rp">
        <h1 className="rp__title">Receive Payment</h1>
        <div className="rp__empty">
          <p>No active UPI ID.</p>
          <p className="rp__empty-sub">
            Add one under <strong>Profile → Bank / UPI Details</strong> and switch
            it on, then come back here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rp">
      <h1 className="rp__title">Receive Payment</h1>
      <p className="rp__sub">Enter an amount and show the QR to your customer.</p>

      {error && <div className="rp__error">{error}</div>}

      <div className="rp__grid">
        <div className="rp__panel">
          <label className="rp__label" htmlFor="rp-amount">Amount</label>
          <div className="rp__amount-wrap">
            <span className="rp__rupee">₹</span>
            <input
              id="rp-amount"
                className="rp__amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div className="rp__quick">
            {[50, 100, 200, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                className="rp__chip"
                onClick={() => setAmount(String((Number(amount) || 0) + v))}
              >
                +{v}
              </button>
            ))}
            <button type="button" className="rp__chip rp__chip--clear" onClick={() => setAmount('')}>
              Clear
            </button>
          </div>

          <label className="rp__label" htmlFor="rp-note">Note (optional)</label>
          <input
            id="rp-note"
            className="rp__input"
            type="text"
            maxLength={50}
            placeholder="e.g. Birthday cake"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {accounts.length > 1 && (
            <>
              <label className="rp__label">Receive into</label>
              <div className="rp__accounts">
                {accounts.map((a, i) => (
                  <button
                    key={a.vpa}
                    type="button"
                    className={`rp__account ${i === selected ? 'is-selected' : ''}`}
                    onClick={() => setSelected(i)}
                  >
                    <span className="rp__account-label">{a.label}</span>
                    <code className="rp__account-vpa">{a.vpa}</code>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rp__panel rp__panel--qr">
          {qrDataUrl ? (
            <>
              <img className="rp__qr" src={qrDataUrl} alt="UPI payment QR code" />
              <p className="rp__qr-amount">
                {validAmount
                  ? `₹${amountNum.toFixed(2)}`
                  : 'Any amount'}
              </p>
              <p className="rp__qr-vpa">{account.vpa}</p>
              {!validAmount && (
                <p className="rp__qr-hint">
                  Enter an amount to lock it into the QR.
                </p>
              )}
            </>
          ) : (
            <div className="rp__qr-placeholder">Preparing QR…</div>
          )}
        </div>
      </div>

      <p className="rp__disclaimer">
        This shows a payment request only. UPI does not notify this app when a
        payment succeeds — check your bank alert before handing over the order.
      </p>
    </div>
  );
}
