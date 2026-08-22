import { useState } from 'react';
import { isValidVpa } from '../utils/upi';
// Editor styles live alongside the Receive Payment screen, which uses
// the same visual language.
import '../pages/ReceivePayment.css';

const MAX_ACCOUNTS = 3;

// Manage the two or three UPI IDs a shop collects on.
//
// Kept as a list on the profile rather than a single field so the owner
// can switch which one is live without retyping it, and so the website
// and the Receive Payment screen read from one place.
//
// Only *enabled* accounts are ever offered for payment, and the first
// enabled one is what the website shows customers.
export default function UpiAccountsEditor({ accounts, onChange }) {
  const [draft, setDraft] = useState({ label: '', vpa: '' });
  const list = Array.isArray(accounts) ? accounts : [];

  function add() {
    const vpa = draft.vpa.trim();
    if (!isValidVpa(vpa)) return;
    if (list.length >= MAX_ACCOUNTS) return;
    // Same ID twice would make the picker ambiguous for no benefit.
    if (list.some((a) => a.vpa?.trim().toLowerCase() === vpa.toLowerCase())) return;

    onChange([
      ...list,
      {
        label: draft.label.trim() || vpa.split('@')[1] || 'UPI',
        vpa,
        // First one added becomes the live one; later ones start off so
        // adding an account never silently changes where money lands.
        enabled: list.length === 0,
      },
    ]);
    setDraft({ label: '', vpa: '' });
  }

  function toggle(i) {
    onChange(list.map((a, j) => (j === i ? { ...a, enabled: !a.enabled } : a)));
  }

  function remove(i) {
    onChange(list.filter((_, j) => j !== i));
  }

  const duplicate =
    draft.vpa.trim() &&
    list.some((a) => a.vpa?.trim().toLowerCase() === draft.vpa.trim().toLowerCase());
  const invalid = draft.vpa.trim() && !isValidVpa(draft.vpa.trim());

  return (
    <div className="upi-editor">
      {list.length === 0 && (
        <p className="upi-editor__empty">
          No UPI IDs yet. Add one to collect payments by QR.
        </p>
      )}

      <ul className="upi-editor__list">
        {list.map((a, i) => (
          <li key={a.vpa} className={`upi-editor__row ${a.enabled ? 'is-on' : ''}`}>
            <label className="upi-editor__toggle">
              <input
                type="checkbox"
                checked={a.enabled !== false}
                onChange={() => toggle(i)}
              />
              <span />
            </label>

            <div className="upi-editor__info">
              <span className="upi-editor__label">{a.label}</span>
              <code className="upi-editor__vpa">{a.vpa}</code>
            </div>

            <span className="upi-editor__state">
              {a.enabled !== false ? 'Active' : 'Off'}
            </span>

            <button
              type="button"
              className="upi-editor__remove"
              onClick={() => remove(i)}
              aria-label={`Remove ${a.vpa}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {list.length < MAX_ACCOUNTS && (
        <div className="upi-editor__add">
          <input
            type="text"
            placeholder="Label (e.g. HDFC)"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            maxLength={24}
          />
          <input
            type="text"
            placeholder="name@okhdfcbank"
            value={draft.vpa}
            onChange={(e) => setDraft({ ...draft, vpa: e.target.value })}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
          <button type="button" onClick={add} disabled={!isValidVpa(draft.vpa.trim()) || duplicate}>
            Add
          </button>
        </div>
      )}

      {invalid && <p className="upi-editor__error">That doesn&apos;t look like a UPI ID (name@bank).</p>}
      {duplicate && <p className="upi-editor__error">That UPI ID is already in the list.</p>}
      {list.length >= MAX_ACCOUNTS && (
        <p className="upi-editor__hint">Maximum of {MAX_ACCOUNTS} UPI IDs.</p>
      )}
      {list.length > 0 && !list.some((a) => a.enabled !== false) && (
        <p className="upi-editor__error">
          Every account is switched off, so no QR can be shown. Turn one on.
        </p>
      )}
    </div>
  );
}
