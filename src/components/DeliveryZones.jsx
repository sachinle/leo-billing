import { useCallback, useEffect, useMemo, useState } from 'react';
import DeliveryZoneMap from './DeliveryZoneMap';
import { getZones, saveZone, setZoneActive, deleteZone } from '../services/websiteService';
import './DeliveryZones.css';

// Delivery areas, drawn on a map.
//
// Replaces the pincode list. A pincode is a postal sorting code, not a
// delivery boundary — 641032 covers several square kilometres, and half
// of it can be a ten-minute ride while the rest is not worth the trip.
// A radius from the shop, or a traced boundary, is the real answer, and
// the customer's phone can settle it exactly.
//
// The pincode list is left in place and still works. The website only
// switches to zones once at least one is saved, so this can be adopted
// (or abandoned) without a flag day.

const PRESETS = [1000, 2000, 3000, 5000, 8000, 12000];

const emptyDraft = {
  id: null,
  name: '',
  shape: 'circle',
  centre: null,
  radiusM: 3000,
  polygon: [],
  delivery_fee: '',
};

export default function DeliveryZones({ toast }) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setZones(await getZones());
    } catch (e) {
      toast(e.message || 'Could not load delivery areas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Stable identities, or the map's effects re-run on every keystroke
  // and it redraws (and re-fits) while you are still typing a name.
  const setCentre = useCallback((c) => setDraft((d) => ({ ...d, centre: c })), []);
  const setPolygon = useCallback((p) => setDraft((d) => ({ ...d, polygon: p })), []);

  // Exclude the zone being edited, so its old shape is not drawn
  // underneath the one being dragged.
  const otherZones = useMemo(
    () => zones.filter((z) => z.id !== draft.id),
    [zones, draft.id]
  );

  const ready =
    draft.name.trim() &&
    (draft.shape === 'circle'
      ? draft.centre && draft.radiusM > 0
      : draft.polygon.length >= 3);

  async function handleSave() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await saveZone({
        id: draft.id,
        name: draft.name.trim(),
        shape: draft.shape,
        delivery_fee: Number(draft.delivery_fee) || 0,
        ...(draft.shape === 'circle'
          ? {
              center_lat: draft.centre.lat,
              center_lng: draft.centre.lng,
              radius_m: Math.round(draft.radiusM),
            }
          : { polygon: draft.polygon.map((p) => [p.lat, p.lng]) }),
      });
      toast(draft.id ? 'Area updated.' : 'Area saved.', 'success');
      setDraft(emptyDraft);
      await load();
    } catch (e) {
      toast(e.message || 'Could not save that area.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function edit(z) {
    setDraft({
      id: z.id,
      name: z.name,
      shape: z.shape,
      centre: z.center_lat != null ? { lat: z.center_lat, lng: z.center_lng } : null,
      radiusM: z.radius_m || 3000,
      polygon: Array.isArray(z.polygon) ? z.polygon.map((p) => ({ lat: p[0], lng: p[1] })) : [],
      delivery_fee: z.delivery_fee ?? '',
    });
  }

  async function toggle(z) {
    try {
      await setZoneActive(z.id, !z.is_active);
      await load();
    } catch (e) {
      toast(e.message || 'Could not update that area.', 'error');
    }
  }

  async function remove(z) {
    try {
      await deleteZone(z.id);
      if (draft.id === z.id) setDraft(emptyDraft);
      toast('Area deleted.', 'success');
      await load();
    } catch (e) {
      toast(e.message || 'Could not delete that area.', 'error');
    }
  }

  return (
    <div className="dz">
      <p className="dz__intro">
        Draw the area you actually deliver to. Customers check their own
        position against it with their phone, so nobody has to guess from a
        pincode.
      </p>

      <div className="dz__editor">
        <div className="dz__shape-toggle" role="group" aria-label="Zone shape">
          <button
            type="button"
            className={`dz__shape ${draft.shape === 'circle' ? 'is-on' : ''}`}
            onClick={() => setDraft((d) => ({ ...d, shape: 'circle' }))}
          >
            Radius
          </button>
          <button
            type="button"
            className={`dz__shape ${draft.shape === 'polygon' ? 'is-on' : ''}`}
            onClick={() => setDraft((d) => ({ ...d, shape: 'polygon' }))}
          >
            Custom shape
          </button>
        </div>

        <DeliveryZoneMap
          shape={draft.shape}
          centre={draft.centre}
          radiusM={draft.radiusM}
          polygon={draft.polygon}
          onCentreChange={setCentre}
          onPolygonChange={setPolygon}
          existingZones={otherZones}
        />

        {draft.shape === 'circle' ? (
          <div className="dz__radius">
            <label className="dz__label" htmlFor="dz-radius">
              Radius — <strong>{(draft.radiusM / 1000).toFixed(1)} km</strong>
            </label>
            <input
              id="dz-radius"
              type="range"
              min="500"
              max="25000"
              step="250"
              value={draft.radiusM}
              onChange={(e) => setDraft((d) => ({ ...d, radiusM: Number(e.target.value) }))}
            />
            <div className="dz__presets">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`dz__preset ${draft.radiusM === m ? 'is-on' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, radiusM: m }))}
                >
                  {m / 1000} km
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="dz__points">
            {draft.polygon.length === 0
              ? 'Tap the map to place the first corner.'
              : `${draft.polygon.length} point${draft.polygon.length === 1 ? '' : 's'}` +
                (draft.polygon.length < 3 ? ' — at least 3 needed.' : '.')}
            {draft.polygon.length > 0 && (
              <button
                type="button"
                className="dz__clear"
                onClick={() => setDraft((d) => ({ ...d, polygon: [] }))}
              >
                Clear
              </button>
            )}
          </p>
        )}

        <div className="dz__fields">
          <div className="dz__field">
            <label className="dz__label" htmlFor="dz-name">Area name</label>
            <input
              id="dz-name"
              type="text"
              maxLength={60}
              placeholder="e.g. Within 3 km"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="dz__field">
            <label className="dz__label" htmlFor="dz-fee">Delivery fee (₹)</label>
            <input
              id="dz-fee"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={draft.delivery_fee}
              onChange={(e) => setDraft((d) => ({ ...d, delivery_fee: e.target.value }))}
            />
          </div>
        </div>

        <div className="dz__actions">
          <button
            type="button"
            className="dz__save"
            onClick={handleSave}
            disabled={!ready || saving}
          >
            {saving ? 'Saving…' : draft.id ? 'Update area' : 'Save area'}
          </button>
          {draft.id && (
            <button type="button" className="dz__cancel" onClick={() => setDraft(emptyDraft)}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <h3 className="dz__list-title">Saved areas</h3>
      {loading ? (
        <div className="dz__skeleton" />
      ) : zones.length === 0 ? (
        <p className="dz__empty">
          No areas yet. Until one is saved the website keeps using your
          pincode list.
        </p>
      ) : (
        <ul className="dz__list">
          {zones.map((z) => (
            <li key={z.id} className={`dz__row ${z.is_active ? '' : 'is-off'}`}>
              <div className="dz__row-main">
                <span className="dz__row-name">{z.name}</span>
                <span className="dz__row-meta">
                  {z.shape === 'circle'
                    ? `${((z.radius_m || 0) / 1000).toFixed(1)} km radius`
                    : `${Array.isArray(z.polygon) ? z.polygon.length : 0}-point shape`}
                  {Number(z.delivery_fee) > 0 && ` · ₹${Number(z.delivery_fee).toFixed(0)} delivery`}
                </span>
              </div>
              <label className="dz__toggle">
                <input type="checkbox" checked={z.is_active} onChange={() => toggle(z)} />
                <span />
              </label>
              <button type="button" className="dz__edit" onClick={() => edit(z)}>Edit</button>
              <button
                type="button"
                className="dz__delete"
                onClick={() => remove(z)}
                aria-label={`Delete ${z.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
