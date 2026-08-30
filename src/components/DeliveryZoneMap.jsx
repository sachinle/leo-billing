import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DeliveryZoneMap.css';

// Draw the area you actually deliver to, on a real map.
//
// Leaflet + OpenStreetMap rather than Google Maps: no API key, no
// billing account, no per-load quota. It also works inside the
// Capacitor WebView, which matters because this is used on a phone as
// often as a desktop.
//
// Two shapes:
//   circle  — drop the shop pin, drag the radius. Covers the common
//             case ("anywhere within 5km") in two gestures.
//   polygon — tap the corners when the real boundary follows a road or
//             a river rather than a circle.
//
// Leaflet's default marker icons are loaded by relative URL from the
// package, which breaks under a bundler. Rather than fight that, every
// marker here is a divIcon built from our own markup — no image
// requests, and it inherits the app's colours.

const DEFAULT_CENTRE = [11.0168, 76.9558]; // Coimbatore
const DEFAULT_ZOOM = 13;

const shopIcon = L.divIcon({
  className: 'dzm__pin-wrap',
  html: '<span class="dzm__pin dzm__pin--shop"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const vertexIcon = L.divIcon({
  className: 'dzm__pin-wrap',
  html: '<span class="dzm__pin dzm__pin--vertex"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function DeliveryZoneMap({
  shape,
  centre,
  radiusM,
  polygon,
  onCentreChange,
  onPolygonChange,
  existingZones = [],
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ shop: null, circle: null, draft: null, vertices: [], saved: [] });
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  // Handlers live in a ref so the map's click listener always calls the
  // current one. Re-binding on every render would tear the map down and
  // rebuild it, losing the user's pan and zoom mid-draw.
  const handlers = useRef({ shape, onCentreChange, onPolygonChange, polygon });

  // Written in an effect, not during render. Mutating a ref while
  // rendering is a React violation - on a bailed-out render the write
  // can be discarded, leaving the map handler holding stale props. No
  // dependency array, so it refreshes after every commit.
  useEffect(() => {
    handlers.current = { shape, onCentreChange, onPolygonChange, polygon };
  });

  // ── Create the map once ──
  useEffect(() => {
    if (mapRef.current || !hostRef.current) return;

    const map = L.map(hostRef.current, {
      center: centre ? [centre.lat, centre.lng] : DEFAULT_CENTRE,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      // The page scrolls; a stray wheel over the map should not zoom it.
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Wheel zoom only once the map has focus, so it never hijacks a
    // page scroll that happens to pass over it.
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    map.on('click', (e) => {
      const { shape: sh, onCentreChange: setC, onPolygonChange: setP, polygon: poly } = handlers.current;
      const point = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) };
      if (sh === 'circle') setC(point);
      else setP([...(poly || []), point]);
    });

    mapRef.current = map;

    // Leaflet measures the container on creation. If it is created
    // inside a panel that animates or is briefly hidden, it reads zero
    // and renders a grey box, so re-measure once laid out.
    const t = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draw the shape being edited ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const l = layersRef.current;

    if (l.shop) { map.removeLayer(l.shop); l.shop = null; }
    if (l.circle) { map.removeLayer(l.circle); l.circle = null; }
    if (l.draft) { map.removeLayer(l.draft); l.draft = null; }
    l.vertices.forEach((v) => map.removeLayer(v));
    l.vertices = [];

    if (shape === 'circle' && centre) {
      l.shop = L.marker([centre.lat, centre.lng], {
        icon: shopIcon,
        draggable: true,
        keyboard: false,
      }).addTo(map);

      l.shop.on('dragend', (e) => {
        const p = e.target.getLatLng();
        onCentreChange({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
      });

      l.circle = L.circle([centre.lat, centre.lng], {
        radius: Number(radiusM) || 0,
        color: '#c9a96e',
        weight: 2,
        fillColor: '#c9a96e',
        fillOpacity: 0.14,
      }).addTo(map);
    }

    if (shape === 'polygon' && polygon?.length) {
      const latlngs = polygon.map((p) => [p.lat, p.lng]);

      // Two points is a line, not an area — draw it as one so the shape
      // in progress is honest about not being closed yet.
      l.draft =
        polygon.length >= 3
          ? L.polygon(latlngs, {
              color: '#c9a96e', weight: 2, fillColor: '#c9a96e', fillOpacity: 0.14,
            }).addTo(map)
          : L.polyline(latlngs, { color: '#c9a96e', weight: 2, dashArray: '5 5' }).addTo(map);

      l.vertices = polygon.map((p, i) => {
        const m = L.marker([p.lat, p.lng], { icon: vertexIcon, draggable: true, keyboard: false }).addTo(map);
        m.on('dragend', (e) => {
          const q = e.target.getLatLng();
          const next = [...handlers.current.polygon];
          next[i] = { lat: +q.lat.toFixed(6), lng: +q.lng.toFixed(6) };
          handlers.current.onPolygonChange(next);
        });
        // Right-click removes a point, which is the only way to undo a
        // mis-tap without starting the whole shape again.
        m.on('contextmenu', () => {
          handlers.current.onPolygonChange(
            handlers.current.polygon.filter((_, j) => j !== i)
          );
        });
        return m;
      });
    }
  }, [shape, centre, radiusM, polygon, onCentreChange, onPolygonChange]);

  // ── Draw the zones already saved, so a new one can be placed
  //    relative to them instead of blind ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const l = layersRef.current;

    l.saved.forEach((s) => map.removeLayer(s));
    l.saved = [];

    for (const z of existingZones) {
      const style = {
        color: z.is_active ? '#7fbe9a' : '#8f8e96',
        weight: 1.5,
        dashArray: '4 4',
        fillColor: z.is_active ? '#7fbe9a' : '#8f8e96',
        fillOpacity: 0.07,
        interactive: false,
      };
      if (z.shape === 'circle' && z.center_lat != null) {
        l.saved.push(L.circle([z.center_lat, z.center_lng], { radius: z.radius_m, ...style }).addTo(map));
      } else if (z.shape === 'polygon' && Array.isArray(z.polygon) && z.polygon.length >= 3) {
        l.saved.push(L.polygon(z.polygon.map((p) => [p[0], p[1]]), style).addTo(map));
      }
    }
  }, [existingZones]);

  // Keep the drawn shape in view when it changes size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (shape === 'circle' && layersRef.current.circle) {
      map.fitBounds(layersRef.current.circle.getBounds(), { padding: [30, 30], maxZoom: 16 });
    } else if (shape === 'polygon' && polygon?.length >= 3 && layersRef.current.draft) {
      map.fitBounds(layersRef.current.draft.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }
  }, [shape, radiusM, polygon?.length]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError('This device cannot report its location.');
      return;
    }
    setLocating(true);
    setLocateError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
        };
        if (handlers.current.shape === 'circle') handlers.current.onCentreChange(p);
        mapRef.current?.setView([p.lat, p.lng], 15);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was refused.'
            : 'Could not get your location. Tap the map instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <div className="dzm">
      <div className="dzm__toolbar">
        <button type="button" className="dzm__btn" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <span className="dzm__hint">
          {shape === 'circle'
            ? 'Tap the map to place your shop, then set the radius below.'
            : 'Tap to add each corner. Drag to adjust, right-click a point to remove it.'}
        </span>
      </div>

      {locateError && <p className="dzm__error">{locateError}</p>}

      <div ref={hostRef} className="dzm__map" />

      <p className="dzm__attrib">
        Map data &copy; OpenStreetMap contributors
      </p>
    </div>
  );
}
