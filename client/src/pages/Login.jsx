import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  {
    role: 'caregiver',
    icon: '💚',
    color: '#e7f0ff',
    title: 'Anita Verma — Primary Caregiver',
    desc: 'Full incident view, evidence, one-tap actions',
  },
  {
    role: 'admin',
    icon: '⚙️',
    color: '#f2effe',
    title: 'Priya Sinha — System Administrator',
    desc: 'System config & device health only — identities masked',
  },
  {
    role: 'family',
    icon: '👪',
    color: '#e6f6f4',
    title: 'Rohan Rao — Family Member',
    desc: 'Masked summary — no raw evidence',
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const handleLogin = async (role) => {
    setBusy(role);
    try {
      await login(role);
      navigate('/console');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__logo" />
        <h1>CareVS</h1>
        <p className="sub">
          Nothing to wear, nothing to charge, nothing to remember. It uses the camera already in the home.
        </p>
        <p className="sub" style={{ marginTop: -14 }}>
          Sign in to see how the same incident looks from each seat.
        </p>
        {ROLES.map((r) => (
          <button key={r.role} className="role-option" onClick={() => handleLogin(r.role)} disabled={busy !== null}>
            <div className="role-option__icon" style={{ background: r.color }}>
              {r.icon}
            </div>
            <div>
              <div className="role-option__title">{busy === r.role ? 'Signing in…' : r.title}</div>
              <div className="role-option__desc">{r.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
