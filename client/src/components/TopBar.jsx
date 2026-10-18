import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_ICON = { caregiver: '💚', admin: '⚙️', family: '👪' };

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <div className="topbar__brand-mark" />
        CareVS
      </div>
      <div className="topbar__nav">
        <NavLink to="/console" className={({ isActive }) => (isActive ? 'active' : '')}>
          Console
        </NavLink>
        {user.role === 'caregiver' && (
          <>
            <NavLink to="/live" className={({ isActive }) => (isActive ? 'active' : '')}>
              Live Monitor
            </NavLink>
            <NavLink to="/trends" className={({ isActive }) => (isActive ? 'active' : '')}>
              Behavioral Trends
            </NavLink>
            <NavLink to="/zones" className={({ isActive }) => (isActive ? 'active' : '')}>
              Zones
            </NavLink>
          </>
        )}
        {(user.role === 'caregiver' || user.role === 'admin') && (
          <NavLink to="/governance" className={({ isActive }) => (isActive ? 'active' : '')}>
            Governance
          </NavLink>
        )}
        <NavLink to="/pipeline" className={({ isActive }) => (isActive ? 'active' : '')}>
          Pipeline
        </NavLink>
      </div>
      <div className="topbar__user">
        <span className={`role-badge ${user.role}`}>
          {ROLE_ICON[user.role]} {user.role}
        </span>
        <span className="muted" style={{ fontSize: 13.5 }}>{user.name}</span>
        <button className="btn ghost small" onClick={handleLogout}>
          Switch user
        </button>
      </div>
    </div>
  );
}
