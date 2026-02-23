import { useEffect, useRef, useState } from 'react';

/**
 * PullToRefresh — fixed version
 *
 * KEY FIX: The transform is applied ONLY to the pull indicator bar at the top,
 * NEVER to the children wrapper. This means position:fixed elements (sidebar,
 * drawers, modals) all work correctly — they're never inside a transformed element.
 */

const THRESHOLD = 72;
const MAX_PULL  = 110;
const RESIST    = 0.45;

export default function PullToRefresh({ onRefresh, children }) {
  const [pullY, setPullY]   = useState(0);
  const [phase, setPhase]   = useState('idle');
  const startYRef           = useRef(null);
  const pullingRef          = useRef(false);

  const doRefresh = onRefresh || (() => window.location.reload());

  useEffect(() => {
    const el = document.documentElement;

    const onTouchStart = (e) => {
      if (el.scrollTop > 0 || document.body.scrollTop > 0) return;
      if (e.touches.length !== 1) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const onTouchMove = (e) => {
      if (startYRef.current === null) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY <= 0) { startYRef.current = null; return; }
      if (deltaY > 6) {
        pullingRef.current = true;
        e.preventDefault();
      }
      if (!pullingRef.current) return;
      const visual = Math.min(deltaY * RESIST, MAX_PULL);
      setPullY(visual);
      setPhase(visual >= THRESHOLD ? 'releasing' : 'pulling');
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) { startYRef.current = null; return; }
      if (pullY >= THRESHOLD) {
        setPhase('refreshing');
        setPullY(THRESHOLD);
        setTimeout(() => {
          doRefresh();
          setTimeout(() => { setPullY(0); setPhase('idle'); }, 800);
        }, 400);
      } else {
        setPhase('idle');
        setPullY(0);
      }
      startYRef.current = null;
      pullingRef.current = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [pullY, doRefresh]);

  const isActive = phase !== 'idle';
  const ready    = phase === 'releasing' || phase === 'refreshing';
  const spinning = phase === 'refreshing';

  return (
    <>
      {/* ── Pull indicator ONLY — transform applied here, NOT on children ── */}
      {isActive && (
        <div style={{
          position:   'fixed',   /* fixed so it never affects document flow */
          top:        0,
          left:       0,
          right:      0,
          zIndex:     99999,     /* above sidebar (z-index 99) and drawers (150) */
          height:     `${pullY}px`,
          display:    'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          transition: spinning ? 'height 0.2s ease' : 'none',
        }}>
          <div style={{
            marginBottom: 10,
            width:  36,
            height: 36,
            borderRadius: '50%',
            background:   'rgba(20,18,14,0.92)',
            border:       `1.5px solid ${ready ? '#c9a96e' : 'rgba(201,169,110,0.3)'}`,
            boxShadow:    ready ? '0 0 18px rgba(201,169,110,0.25)' : 'none',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            opacity:      Math.min(pullY / THRESHOLD, 1),
            transition:   'border-color 0.2s, box-shadow 0.2s',
            transform:    `scale(${Math.min(0.7 + (pullY / THRESHOLD) * 0.3, 1)})`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#c9a96e" strokeWidth="2"
              style={{
                transition: 'transform 0.2s',
                transform: spinning
                  ? 'rotate(0deg)'
                  : `rotate(${Math.min((pullY / THRESHOLD) * 180, 180)}deg)`,
                animation: spinning ? 'ptr-spin 0.7s linear infinite' : 'none',
              }}
            >
              {spinning ? (
                <>
                  <path d="M21 12a9 9 0 1 1-6-8.5" strokeOpacity="0.25"/>
                  <path d="M21 12a9 9 0 0 0-9-9"/>
                </>
              ) : (
                <>
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <polyline points="19,12 12,19 5,12"/>
                </>
              )}
            </svg>
          </div>
        </div>
      )}

      {/* ── Children rendered with NO transform — position:fixed works normally ── */}
      {children}

      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}