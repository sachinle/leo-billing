import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  connectBluetooth, disconnectBluetooth, getConnectionState,
  isBluetoothSupported, isNativeApp,
} from '../services/thermalPrinter';
import './ThermalPrint.css';
import './PrinterSettings.css';

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

export default function PrinterSettings() {
  const [btStatus, setBtStatus] = useState('idle');
  const [connName, setConnName] = useState('');
  const [toasts, setToasts] = useState([]);
  const nativeApp = isNativeApp();
  const btSupported = isBluetoothSupported();

  const addToast = useCallback((message, type = 'success') => {
    const tid = Date.now() + Math.random();
    setToasts(t => [...t, { id: tid, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 4500);
  }, []);

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
      addToast('Printer disconnected');
      return;
    }
    try {
      setBtStatus('scanning');
      const result = await connectBluetooth(setBtStatus);
      setConnName(result.deviceName);
      addToast(`✓ Connected to ${result.deviceName}`);
    } catch (err) {
      setBtStatus('error');
      addToast(err.message || 'Bluetooth connection failed', 'error');
      setTimeout(() => setBtStatus('idle'), 4000);
    }
  };

  return (
    <div className="ps-page">
      <Toast toasts={toasts} />

      {/* Header */}
      <div className="ps__header">
        <div>
          <p className="ps__eyebrow">
            <span className="ps__eyebrow-line" />
            Hardware
          </p>
          <h1 className="ps__title">Printer Settings</h1>
          <p className="ps__subtitle">Connect &amp; manage your thermal printer</p>
        </div>
      </div>

      {/* Connection Card */}
      <div className="ps__card">
        <div className="ps__card-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="6.5,6.5 17.5,17.5"/>
            <polyline points="17.5,6.5 12,12 17.5,17.5"/>
            <polyline points="6.5,6.5 12,12"/>
          </svg>
          <h3>Bluetooth Connection</h3>
        </div>
        <div className="ps__card-body">

          <div className={`ps__status-block ${btStatus === 'connected' ? 'ps__status-block--ok' : btStatus === 'error' ? 'ps__status-block--err' : ''}`}>
            <BTStatus status={btStatus} />
            {connName && <div className="ps__device-name">{connName}</div>}
          </div>

          <button
            className={`ps__connect-btn ${btStatus === 'connected' ? 'ps__connect-btn--disconnect' : ''}`}
            onClick={handleConnect}
            disabled={['scanning','connecting','discovering'].includes(btStatus)}
          >
            {btStatus === 'connected' ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Disconnect
              </>
            ) : ['scanning','connecting','discovering'].includes(btStatus) ? (
              <>
                <span className="tp__spinner" />
                {btStatus === 'scanning' ? 'Scanning for devices…' : btStatus === 'connecting' ? 'Connecting…' : 'Discovering services…'}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6.5,6.5 17.5,17.5"/><polyline points="17.5,6.5 12,12 17.5,17.5"/><polyline points="6.5,6.5 12,12"/></svg>
                Connect Printer
              </>
            )}
          </button>

          {btStatus === 'idle' && (
            <p className="ps__hint">
              {nativeApp
                ? '1. Turn ON your printer\u2003\u2003\u00a02. Enable Bluetooth\u2003\u2003\u00a03. Tap Connect'
                : 'Web Bluetooth requires Chrome or Edge on a desktop computer.'}
            </p>
          )}
        </div>
      </div>

      {/* Android Permission Guide */}
      {(btStatus === 'error' || !btSupported) && nativeApp && (
        <div className="ps__card ps__card--warn">
          <div className="ps__card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3>Bluetooth Permission Required</h3>
          </div>
          <div className="ps__card-body">
            <p className="ps__warn-text">
              Android requires <strong>Nearby Devices</strong> permission to connect to Bluetooth printers.
            </p>
            <ol className="ps__steps">
              <li>Open <strong>Android Settings</strong></li>
              <li>Tap <strong>Apps → Leo Billing</strong></li>
              <li>Tap <strong>Permissions</strong></li>
              <li>Enable <strong>Nearby devices</strong> → Allow</li>
              <li>Return here and tap <strong>Connect Printer</strong></li>
            </ol>
          </div>
        </div>
      )}

      {/* Compatible Printers */}
      <div className="ps__card">
        <div className="ps__card-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <h3>Compatible Printers</h3>
        </div>
        <div className="ps__card-body">
          <div className="ps__compat-list">
            {[
              ['Xprinter', 'XP-P300 / XP-P810', '#70c49a'],
              ['Peripage', 'A6 / A9 / PP series', '#70c49a'],
              ['GOOJPRT', 'PT-210 / MTP-II', '#70c49a'],
              ['Rongta', 'RPP02 / RPP300', '#70c49a'],
              ['Generic', 'Any ESC/POS BLE printer', '#c9a96e'],
            ].map(([brand, model, color]) => (
              <div key={brand} className="ps__compat-row">
                <span className="ps__compat-dot" style={{ background: color }} />
                <div>
                  <div className="ps__compat-brand">{brand}</div>
                  <div className="ps__compat-model">{model}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick print link */}
      {btStatus === 'connected' && (
        <div className="ps__quick-print">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          Printer connected! Go to any invoice and tap <strong>Print</strong> to print a receipt.
        </div>
      )}
    </div>
  );
}