import { NavLink } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import {
  AdminIcon,
  AtlasIcon,
  ChevronDownIcon,
  DashboardIcon,
  FaqIcon,
  LogoutIcon,
  TerritoriesIcon,
  UserIcon
} from './Icons';
import { useAuth } from '../contexts/AuthContext';

function toDisplayName(user, profile) {
  const direct = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (direct) return direct;
  const email = profile?.email || user?.email || 'territory assistant';
  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

const NAV_ITEMS = [
  { to: '/app', label: 'Territory Atlas', icon: AtlasIcon },
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/territories', label: 'Territories', icon: TerritoriesIcon },
  { to: '/admin', label: 'Admin Panel', icon: AdminIcon, roles: ['Admin', 'Conductor'] },
  { to: '/faq', label: 'FAQ', icon: FaqIcon }
];

export default function AppShell({
  title,
  subtitle,
  children,
  metaPills = [],
  headerExtras = null,
  contentClassName = ''
}) {
  const { profile, user, signOut } = useAuth();
  const name = toDisplayName(user, profile);
  const avatarUrl = user?.user_metadata?.avatar_url;
  const roleLabel = profile?.is_approved === false
    ? `${profile?.role ?? 'Publisher'} • Pending approval`
    : profile?.role ?? 'Publisher';

  const visibleNav = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(profile?.role));

  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <div className="shell-sidebar-top">
          <BrandLogo />
          <nav className="shell-nav" aria-label="Primary">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `shell-nav-link${isActive ? ' active' : ''}`}>
                  <span className="shell-nav-icon">
                    <Icon />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="shell-sidebar-bottom">
          <div className="shell-profile-card">
            <div className="shell-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} />
              ) : (
                <span>{initialsFor(name) || 'TA'}</span>
              )}
            </div>
            <div className="shell-profile-copy">
              <strong>{name}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>

          <button className="shell-signout-button" type="button" onClick={signOut}>
            <LogoutIcon />
            <span>Sign Out</span>
          </button>

          <div className="shell-version-row">
            <span className="shell-version-dot" />
            <span>Version 1.0</span>
          </div>
        </div>
      </aside>

      <main className="shell-main">
        <div className="shell-main-inner">
          <header className="shell-command-bar">
            <div className="shell-command-copy">
              <div className="shell-command-eyebrow">
                <UserIcon />
                <span>Territory Operations</span>
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>

            <div className="shell-command-actions">
              {metaPills.map((pill) => (
                <div key={pill.label} className={`shell-meta-pill${pill.tone ? ` ${pill.tone}` : ''}`}>
                  {pill.icon ? <span className="shell-meta-icon">{pill.icon}</span> : null}
                  <span>{pill.label}</span>
                  {pill.hasChevron ? <ChevronDownIcon className="shell-meta-chevron" /> : null}
                </div>
              ))}
              {headerExtras}
            </div>
          </header>

          <section className={`shell-content ${contentClassName}`}>{children}</section>
        </div>
      </main>
    </div>
  );
}
