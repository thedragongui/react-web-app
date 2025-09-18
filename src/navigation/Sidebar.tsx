import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './sidebar.css';

const navItems = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/personnalisation', label: 'Personnalisation' },
  { to: '/programme', label: 'Programme' },
  { to: '/sponsors', label: 'Sponsors' },
  { to: '/participants', label: 'Participants' },
  { to: '/badges', label: 'Badges' },
  { to: '/importation-pdf', label: 'Importation PDF' },
  { to: '/liens', label: 'Liens' },
  { to: '/profil', label: 'Mon compte' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header"><div className="logo">LOGO</div></div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end as boolean | undefined}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button className="logout-btn" onClick={() => signOut(auth)}>Se déconnecter</button>
    </aside>
  );
}
