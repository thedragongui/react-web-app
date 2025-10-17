import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { type ReactNode, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import logoAntCongres from '../assets/logo-ant-congres.png';
import {
  DashboardIcon,
  SettingsIcon,
  CalendarIcon,
  UsersIcon,
  BadgeIcon,
  UploadIcon,
  LinkIcon,
  ProfileIcon,
  PeopleIcon,
} from './icons';
import './sidebar.css';

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon?: ReactNode;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: 'Vue globale',
    items: [
      { to: '/', label: 'Tableau de bord', end: true, icon: <DashboardIcon /> },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/configuration', label: 'Configuration', icon: <SettingsIcon /> },
      { to: '/programme', label: 'Programme', icon: <CalendarIcon /> },
      { to: '/sponsors', label: 'Sponsors', icon: <UsersIcon /> },
      { to: '/participants', label: 'Participants', icon: <PeopleIcon /> },
      { to: '/badges', label: 'Badges', icon: <BadgeIcon /> },
      { to: '/importation-pdf', label: 'Importation PDF', icon: <UploadIcon /> },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { to: '/liens', label: 'Liens', icon: <LinkIcon /> },
      { to: '/profil', label: 'Mon compte', icon: <ProfileIcon /> },
    ],
  },
];

type SidebarProps = {
  open: boolean;
  isDrawer: boolean;
  onClose: () => void;
};

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Sidebar({ open, isDrawer, onClose }: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isDrawer || !open) return;
    const node = sidebarRef.current;
    if (!node) return;

    const getFocusables = () => node.querySelectorAll<HTMLElement>(focusableSelectors);
    const initialFocusables = getFocusables();
    (initialFocusables[0] ?? node).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [isDrawer, open, onClose]);

  const handleNavClick = () => {
    if (isDrawer) {
      onClose();
    }
  };

  const classNames = ['sidebar'];
  if (isDrawer) classNames.push('drawer');
  if (isDrawer && open) classNames.push('open');

  return (
    <aside
      ref={sidebarRef}
      id="app-sidebar"
      className={classNames.join(' ')}
      tabIndex={-1}
      aria-hidden={isDrawer && !open}
    >
      <div className="sidebar-header">
        {isDrawer && (
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <span className="sidebar-close-icon" aria-hidden="true" />
          </button>
        )}
        <div className="logo">
          <img src={logoAntCongres} alt="Logo Ant Congres" />
        </div>
      </div>
      <nav className="sidebar-nav">
        {navSections.map(section => (
          <div className="sidebar-section" key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <div className="sidebar-section-items">
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                  onClick={handleNavClick}
                >
                  {item.icon && <span className="nav-icon">{item.icon}</span>}
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <button className="logout-btn" onClick={() => signOut(auth)}>Se déconnecter</button>
    </aside>
  );
}
