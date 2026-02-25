import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../services/firebase';
import { useTheme } from '../context/ThemeContext';
import './Sidebar.css';

const Icon = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const NAV_ITEMS = [
  {
    to: '/dashboard', label: 'Dashboard',
    icon: <Icon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  },
  {
    to: '/customers', label: 'Customers',
    icon: <Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  },
  {
    to: '/products', label: 'Products',
    icon: <Icon><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></Icon>,
  },
  {
    to: '/invoices', label: 'Invoices',
    icon: <Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></Icon>,
  },
  {
    to: '/printer', label: 'Printer',
    icon: <Icon><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Icon>,
  },
  {
    to: '/settings', label: 'Settings',
    icon: <Icon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>,
  },
  {
    to: '/profile', label: 'Profile',
    icon: <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
  },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch (err) { console.error('Logout failed:', err); }
  };

  const handleNavClick = () => { if (mobileOpen) setMobileOpen(false); };

  // On mobile, never show "collapsed" style — always show full labels
  const showLabels = mobileOpen ? true : !collapsed;

  return (
    <aside className={[
      'sidebar',
      collapsed && !mobileOpen ? 'sidebar--collapsed' : '',
      mobileOpen ? 'sidebar--mobile-open' : '',
    ].filter(Boolean).join(' ')}>

      {/* ── Header ── */}
      <div className="sidebar__header">
        <div className="sidebar__logo">
          Leo Billing<span>.</span>
        </div>
        {/* Desktop collapse button — hidden on mobile */}
        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed && !mobileOpen
              ? <polyline points="9,18 15,12 9,6" />
              : <polyline points="15,18 9,12 15,6" />}
          </svg>
        </button>
        {/* Mobile close button */}
        {mobileOpen && (
          <button
            className="sidebar__mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      <div className="sidebar__divider" />

      {/* ── Nav ── */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ to, label, icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to}
              className={`sidebar__link${active ? ' sidebar__link--active' : ''}`}
              title={!showLabels ? label : undefined}
              onClick={handleNavClick}
            >
              <span className="sidebar__link-icon">{icon}</span>
              {showLabels && <span className="sidebar__link-label">{label}</span>}
              {active && showLabels && <span className="sidebar__link-pip" />}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="sidebar__footer">
        <div className="sidebar__divider" />
        <div className="sidebar__theme" title={!showLabels ? (isDark ? 'Switch to Light' : 'Switch to Dark') : undefined}>
          {!showLabels ? (
            <button className="sidebar__theme-btn-icon" onClick={toggleTheme}>
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          ) : (
            <div className="sidebar__theme-row">
              <span className="sidebar__theme-label">
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </span>
              <button
                className={`sidebar__theme-pill${isDark ? ' sidebar__theme-pill--dark' : ' sidebar__theme-pill--light'}`}
                onClick={toggleTheme} aria-label="Toggle theme"
              >
                <span className="sidebar__theme-pill-thumb">
                  {isDark ? <MoonIcon /> : <SunIcon />}
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="sidebar__divider sidebar__divider--sm" />
        <button
          className="sidebar__logout"
          onClick={handleLogout}
          title={!showLabels ? 'Sign out' : undefined}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {showLabels && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}