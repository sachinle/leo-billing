import { useCallback, useEffect, useState } from 'react';
import DeliveryZones from './DeliveryZones';
import { getDeliveryMode } from '../services/websiteService';
import './DeliveryAreas.css';

// Delivery areas: both ways of answering "can we deliver to you?".
//
// Map zones and pincodes are kept side by side rather than one
// replacing the other. The pincode list already had real data in it,
// and a shop may reasonably want the coarse list as a safety net while
// it trusts the drawn boundary.
//
// Only ONE is live at a time, which is the part that needs saying out
// loud: map zones win whenever any is active, and pincodes cover the
// rest. Deleting every zone silently hands the job back to the pincode
// list — correct behaviour, but baffling if the screen does not tell
// you. Hence the banner at the top, which reports what customers are
// actually being asked right now.

export default function DeliveryAreas({ toast, pincodeEditor }) {
  const [view, setView] = useState('map');
  const [mode, setMode] = useState(null);
  // Bumped to re-read the status; the effect below owns the fetch.
  const [reloadKey, setReloadKey] = useState(0);

  // setState happens in the promise callback, never synchronously in
  // the effect body — the latter causes a cascading render and React's
  // lint rule rejects it. The cancelled flag stops a slow response
  // landing after the component has gone.
  useEffect(() => {
    let cancelled = false;
    getDeliveryMode()
      .then((m) => { if (!cancelled) setMode(m); })
      .catch(() => { if (!cancelled) setMode(null); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const refreshMode = useCallback(() => setReloadKey((k) => k + 1), []);

  // Editing either list can change which one is live, so re-read the
  // status after any toast (every save and delete raises one).
  const wrappedToast = useCallback(
    (msg, kind) => {
      toast(msg, kind);
      refreshMode();
    },
    [toast, refreshMode]
  );

  return (
    <div className="da">
      <StatusBanner mode={mode} />

      <div className="da__tabs" role="tablist" aria-label="Delivery area method">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'map'}
          className={`da__tab ${view === 'map' ? 'is-on' : ''}`}
          onClick={() => setView('map')}
        >
          Map areas
          {mode?.activeZones > 0 && <span className="da__count">{mode.activeZones}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'pincode'}
          className={`da__tab ${view === 'pincode' ? 'is-on' : ''}`}
          onClick={() => setView('pincode')}
        >
          Pincodes
          {mode?.activePincodes > 0 && <span className="da__count">{mode.activePincodes}</span>}
        </button>
      </div>

      <div className="da__panel">
        {view === 'map' ? <DeliveryZones toast={wrappedToast} /> : pincodeEditor(wrappedToast)}
      </div>
    </div>
  );
}

function StatusBanner({ mode }) {
  if (!mode) return null;

  if (mode.mode === 'map') {
    return (
      <div className="da__status da__status--map">
        <strong>Map areas are live.</strong> Customers check their GPS position
        against your {mode.activeZones === 1 ? 'drawn area' : `${mode.activeZones} drawn areas`}.
        {mode.activePincodes > 0 && (
          <> Your {mode.activePincodes} pincode{mode.activePincodes === 1 ? '' : 's'} are
          kept but not used — they take over automatically if you switch every
          map area off.</>
        )}
      </div>
    );
  }

  if (mode.mode === 'pincode') {
    return (
      <div className="da__status da__status--pin">
        <strong>Pincodes are live.</strong> Customers type a 6-digit pincode,
        because no map area is switched on. Draw or enable one to switch to the
        GPS check.
      </div>
    );
  }

  return (
    <div className="da__status da__status--none">
      <strong>Delivery is switched off.</strong> With no map area and no pincode
      active, customers can only choose pickup.
    </div>
  );
}
