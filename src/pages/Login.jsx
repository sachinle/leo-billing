import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPassword
} from '../services/firebase';
import './Login.css';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('billing-theme') || 'dark'
  );

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('billing-theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // Redirect handled by App.jsx — if user exists, App already shows dashboard
  // Do NOT call navigate() during render — it causes React errors

  // Maps error codes → friendly human messages
  const friendlyError = (err) => {
    // Access denied — not in allowlist
    if (err?.code === 'ACCESS_DENIED' || err?.message === 'ACCESS_DENIED')
      return '🔒 Access denied. Only authorised accounts are allowed to use this app.';
    switch (err?.code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
        return 'No account found with this email. Check the address or create an account.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again or use "Forgot password".';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak — use at least 6 characters.';
      case 'auth/invalid-email':
        return "That doesn't look like a valid email address.";
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'No internet connection. Please check your network and try again.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in popup was closed. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[GoogleAuth] raw error:', JSON.stringify(err), err?.code, err?.message);
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const msg = (err?.code === 'ACCESS_DENIED' || err?.message === 'ACCESS_DENIED')
        ? '🔒 Access denied. Only authorised accounts are allowed.'
        : friendlyError(err);
      await showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setResetSent(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Corner decorations */}
        <div className="card-corner-tr" />
        <div className="card-corner-bl" />

        {/* Theme toggle */}
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☽'}
        </button>

        {/* Header */}
        <div className="form-logo">Leo Billing<span>.</span></div>
        <p className="form-subtitle">
          {mode === 'login'
            ? 'Welcome back — sign in to continue'
            : 'Create your account to get started'}
        </p>

        {/* Mode toggle */}
        <div className="mode-toggle">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleEmailAuth} className="email-form">
          <div className="input-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'login' && (
            <button
              type="button"
              className="forgot-link"
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          )}

          {error && (
            <div style={{
              background: 'rgba(224,80,80,0.12)',
              border: '1px solid rgba(224,80,80,0.35)',
              color: '#ff6b6b',
              borderRadius: '10px',
              padding: '14px 16px',
              fontSize: '0.88rem',
              lineHeight: '1.5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              animation: 'shakeIn 0.4s ease',
            }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔒</span>
              <span>{error}</span>
            </div>
          )}
          {resetSent && (
            <div className="success-message">
              Check your inbox — a reset link is on its way.
            </div>
          )}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <div className="divider">
          <span>or continue with</span>
        </div>

        <button onClick={handleGoogleAuth} className="google-btn" disabled={loading}>
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
          />
          Continue with Google
        </button>

        <p className="terms">
          By continuing, you agree to our Terms of Service<br />and Privacy Policy.
        </p>
      </div>
    </div>
  );
}