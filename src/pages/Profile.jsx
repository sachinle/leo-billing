import { useState, useEffect } from 'react';
import UpiAccountsEditor from '../components/UpiAccountsEditor';
import { useAuth } from '../hooks/useAuth';
import { getProfile, saveProfile } from '../services/profileService';
import './Profile.css';

const FIELD_GROUPS = [
  {
    title: 'Shop Details',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
    fields: [
      { key: 'shop_name',  label: 'Shop / Business Name', placeholder: "e.g. Annie's HomeMade Cakes", required: true },
      { key: 'owner_name', label: 'Owner Name',           placeholder: 'Your full name' },
      { key: 'phone',      label: 'Phone Number',         placeholder: '9876543210', type: 'tel', required: true },
      { key: 'email',      label: 'Email Address',        placeholder: 'shop@email.com', type: 'email' },
    ],
  },
  {
    title: 'Address',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    fields: [
      { key: 'address', label: 'Street Address',      placeholder: '5/140 Main Street, Area Name', full: true },
      { key: 'city',    label: 'City',                placeholder: 'Coimbatore' },
      { key: 'state',   label: 'State (with code)',   placeholder: '33-Tamil Nadu' },
      { key: 'pincode', label: 'Pincode',             placeholder: '641001' },
    ],
  },
  {
    // ── EXPANDED: was "Tax & GST", now includes FSSAI ──
    title: 'Tax & Licences',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    fields: [
      {
        key: 'gstin',
        label: 'GSTIN (optional)',
        placeholder: '22AAAAA0000A1Z5',
        full: true,
      },
      {
        key: 'fssai_no',
        label: 'FSSAI Licence No. (optional)',
        placeholder: 'e.g. 10019012345678',
        full: true,
        hint: 'Mandatory for food businesses. Leave blank if not applicable.',
      },
    ],
  },
  {
    title: 'Bank / UPI Details',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
    // Rendered after this section's fields — a list needs custom UI,
    // not another text input.
    upiAccounts: true,
    fields: [
      { key: 'upi_id',     label: 'UPI ID (primary / legacy)', placeholder: 'name@upi' },
      { key: 'bank_name',  label: 'Bank Name',     placeholder: 'Bank of Baroda' },
      { key: 'account_no', label: 'Account Number', placeholder: '47210110010525' },
      { key: 'ifsc_code',  label: 'IFSC Code',     placeholder: 'BARB0SUNCOI' },
    ],
  },
  {
    // ── NEW: Signature group ──
    title: 'Invoice Signature',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    fields: [
      {
        key: 'signatory_name',
        label: 'Authorised Signatory Name',
        placeholder: 'e.g. Sachin Immanuel Leo S',
        full: true,
        hint: 'This name is rendered as a handwritten-style signature on your invoices.',
        signaturePreview: true,
      },
    ],
  },
  {
    title: 'Invoice Defaults',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    fields: [
      { key: 'terms', label: 'Terms & Conditions', placeholder: 'Thank you for doing business with us.', full: true, textarea: true },
    ],
  },
];

const EMPTY_PROFILE = {
  shop_name: '', owner_name: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '',
  gstin: '',
  fssai_no: '',           // ← new
  upi_id: '', bank_name: '', account_no: '', ifsc_code: '',
  upi_accounts: [],
  signatory_name: '',     // ← new
  terms: 'Thank you for doing business with us.',
};

// ── Live signature preview ────────────────────────────────────────────────────
function SignaturePreview({ name }) {
  if (!name || !name.trim()) return null;
  return (
    <div className="profile__sig-preview">
      <div className="profile__sig-paper">
        <span className="profile__sig-text">{name}</span>
      </div>
      <p className="profile__sig-caption">
        Preview — this is how the signature will appear on invoices
      </p>
    </div>
  );
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

// ── Avatar — handles WebView image load failures gracefully ──────────────────
// In Capacitor Android, Google profile photo URLs (lh3.googleusercontent.com)
// are sometimes blocked by WebView CORS/security policy.
// onError falls back to the initials letter avatar so it never shows broken.
function AvatarImage({ user }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

  if (user?.photoURL && !imgFailed) {
    return (
      <img
        src={user.photoURL}
        alt="avatar"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImgFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }
  return <span>{initial}</span>;
}

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm]           = useState(EMPTY_PROFILE);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toasts, setToasts]       = useState([]);
  const [hasProfile, setHasProfile] = useState(false);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await getProfile(user.uid);
        if (data) { setForm({ ...EMPTY_PROFILE, ...data }); setHasProfile(true); }
      } catch { addToast('Failed to load profile', 'error'); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const handleChange = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.shop_name.trim()) { addToast('Shop name is required', 'error'); return; }
    if (!form.phone.trim())     { addToast('Phone number is required', 'error'); return; }
    setSaving(true);
    try {
      await saveProfile(user.uid, form);
      setHasProfile(true);
      addToast('Profile saved successfully!');
    } catch (err) {
      addToast('Save failed: ' + (err.message || 'Unknown error'), 'error');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile__skeleton">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="profile__skeleton-card" style={{ animationDelay: `${i*100}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Toast toasts={toasts} />

      <div className="profile__header">
        <div>
          <p className="profile__eyebrow">Account</p>
          <h1 className="profile__title">Business Profile</h1>
          <p className="profile__subtitle">
            This info appears on all your invoices. Keep it accurate.
          </p>
        </div>
        <div className="profile__header-right">
          {!hasProfile && (
            <span className="profile__badge profile__badge--new">Not set up yet</span>
          )}
          {hasProfile && (
            <span className="profile__badge profile__badge--ok">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              Profile saved
            </span>
          )}
        </div>
      </div>

      {/* Google account info banner */}
      <div className="profile__google-banner">
        <div className="profile__google-avatar">
          <AvatarImage user={user} />
        </div>
        <div>
          <div className="profile__google-name">{user?.displayName || 'Account'}</div>
          <div className="profile__google-email">{user?.email}</div>
        </div>
        <div className="profile__google-label">Signed in via Google</div>
      </div>

      {/* Field groups */}
      <div className="profile__groups">
        {FIELD_GROUPS.map(group => (
          <div key={group.title} className="profile__group">
            <div className="profile__group-header">
              {group.icon}
              <h3 className="profile__group-title">{group.title}</h3>
            </div>
            <div className="profile__group-body">
              <div className="profile__grid">
                {group.fields.map(f => (
                  <div key={f.key} className={`profile__field${f.full ? ' profile__field--full' : ''}`}>
                    <label className="profile__label">
                      {f.label}
                      {f.required && <span className="profile__req">*</span>}
                    </label>

                    {f.textarea ? (
                      <textarea
                        className="profile__textarea"
                        value={form[f.key] || ''}
                        onChange={e => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        rows={3}
                      />
                    ) : (
                      <input
                        className="profile__input"
                        type={f.type || 'text'}
                        value={form[f.key] || ''}
                        onChange={e => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                      />
                    )}

                    {/* Hint text (FSSAI, signatory) */}
                    {f.hint && (
                      <span className="profile__field-hint">{f.hint}</span>
                    )}

                    {/* Live Pacifico signature preview */}
                    {f.signaturePreview && (
                      <SignaturePreview name={form[f.key]} />
                    )}
                  </div>
                ))}
              </div>

              {/* Extra UPI IDs, with a switch for which one is live.
                  The website offers the first enabled account to
                  customers, and Receive Payment lets you pick between
                  them at the counter. */}
              {group.upiAccounts && (
                <>
                  <label className="profile__label" style={{ marginTop: 18, display: 'block' }}>
                    Additional UPI IDs
                  </label>
                  <UpiAccountsEditor
                    accounts={form.upi_accounts}
                    onChange={list => handleChange('upi_accounts', list)}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save bar */}
      <div className="profile__save-bar">
        <span className="profile__save-hint">Changes are saved to your account and reflected on new invoices immediately.</span>
        <button className="profile__save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.4"/>
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
              Save Profile
            </>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}