import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchProducts } from '../services/productService';
import { useAuth } from '../hooks/useAuth';

/**
 * ProductSearch — Fixed dropdown positioning
 *
 * Root cause of old bug:
 *   - position:fixed + rect.bottom worked in viewport coords but
 *     window 'scroll' listener closed the dropdown on ANY scroll,
 *     so it vanished immediately when the user scrolled to see the input.
 *
 * Fix:
 *   - Use a React Portal (renders into document.body, escaping all overflow:hidden)
 *   - Track input position with getBoundingClientRect() on every render tick
 *   - Only close if scroll happens OUTSIDE the dropdown itself
 *   - Flip dropdown ABOVE input if not enough space below (smart placement)
 */
export default function ProductSearch({ onSelect, onNewProduct, currentValue, onChange }) {
  const { user } = useAuth();
  const [query, setQuery]           = useState(currentValue || '');
  const [results, setResults]       = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropStyle, setDropStyle]   = useState({});

  const inputRef    = useRef();
  const dropRef     = useRef();
  const timerRef    = useRef();
  const rafRef      = useRef();
  const isOpen      = useRef(false); // track without re-render

  // Sync external value changes (e.g. when parent resets)
  useEffect(() => {
    setQuery(currentValue || '');
  }, [currentValue]);

  // ── Position calculation ──────────────────────────────────────────────
  const calcPosition = useCallback(() => {
    if (!inputRef.current || !isOpen.current) return;
    const rect  = inputRef.current.getBoundingClientRect();
    const vpH   = window.innerHeight;
    const DROPDOWN_MAX_H = 240;
    const GAP = 4;

    // Space below vs above
    const spaceBelow = vpH - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUp = spaceBelow < DROPDOWN_MAX_H && spaceAbove > spaceBelow;

    setDropStyle({
      position: 'fixed',
      left:     rect.left,
      width:    Math.max(rect.width, 240),
      zIndex:   99999,
      ...(openUp
        ? { bottom: vpH - rect.top + GAP, top: 'auto' }
        : { top: rect.bottom + GAP, bottom: 'auto' }
      ),
      maxHeight: openUp
        ? Math.min(spaceAbove, DROPDOWN_MAX_H)
        : Math.min(spaceBelow, DROPDOWN_MAX_H),
    });
  }, []);

  // Re-calculate on every animation frame while open (handles scroll/resize perfectly)
  useEffect(() => {
    if (!showDropdown) return;
    isOpen.current = true;
    const tick = () => {
      calcPosition();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      isOpen.current = false;
    };
  }, [showDropdown, calcPosition]);

  // ── Debounced DB search ───────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      if (!user) return;
      try {
        const products = await searchProducts(user.uid, query);
        setResults(Array.isArray(products) ? products : []);
      } catch { setResults([]); }
    }, 260);
    return () => clearTimeout(timerRef.current);
  }, [query, user]);

  // ── Close on outside click only ───────────────────────────────────────
  useEffect(() => {
    if (!showDropdown) return;
    const onMouseDown = (e) => {
      if (dropRef.current?.contains(e.target))  return; // inside dropdown → ignore
      if (inputRef.current?.contains(e.target)) return; // inside input → ignore
      setShowDropdown(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showDropdown]);

  // ── Event handlers ────────────────────────────────────────────────────
  const handleFocus = () => {
    if (query.trim()) setShowDropdown(true);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    onChange?.(val);
  };

  const handleSelect = (product) => {
    setQuery(product.name);
    setShowDropdown(false);
    onSelect(product);
  };

  const handleUseNew = () => {
    setShowDropdown(false);
    onNewProduct?.(query.trim());
  };

  const handleBlur = () => {
    // Small delay so onMouseDown on dropdown items fires first
    setTimeout(() => setShowDropdown(false), 160);
  };

  const showNew = query.trim().length > 0
    && results.every(r => r.name.toLowerCase() !== query.trim().toLowerCase());

  const hasContent = results.length > 0 || showNew;

  // ── Dropdown portal ───────────────────────────────────────────────────
  const dropdown = showDropdown && hasContent
    ? createPortal(
        <div
          ref={dropRef}
          className="prod-dropdown"
          style={dropStyle}
          onMouseDown={e => e.preventDefault()} // prevent input blur
        >
          {results.map(p => (
            <div
              key={p.id}
              className="prod-dropdown-item"
              onMouseDown={() => handleSelect(p)}
            >
              <span className="prod-name">{p.name}</span>
              <span className="prod-price">
                ₹{Number(p.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
          {showNew && (
            <div className="prod-dropdown-new" onMouseDown={handleUseNew}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Use "{query.trim()}" as new product
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="prod-search-wrap">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search product…"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoComplete="off"
        spellCheck={false}
      />
      {dropdown}
    </div>
  );
}