import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useQuickAdd } from './QuickAdd';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/clients', label: 'Clients', icon: 'clients' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Four destinations, always visible: a top bar on larger screens and a
 * bottom bar on phones (easy to reach with a thumb).
 */
export function Layout() {
  const addCleaning = useQuickAdd();
  // Today has its own big Add Cleaning button, so the header one is hidden there.
  const onToday = useLocation().pathname === '/';
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="Veronica – go to Today">
            VERONICA
          </NavLink>
          <nav className="topnav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className="topnav-link">
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className={`btn btn-primary topbar-add${onToday ? ' is-hidden' : ''}`} onClick={() => addCleaning()}>
            <Icon name="plus" />
            Add Cleaning
          </button>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottomnav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bottomnav-link">
            <Icon name={item.icon} size={26} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
