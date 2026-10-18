import { Navigate, Route, Routes } from 'react-router-dom';
import DirectorPanel from './components/DirectorPanel';
import TopBar from './components/TopBar';
import { useAuth } from './context/AuthContext';
import Console from './pages/Console';
import Governance from './pages/Governance';
import IncidentDetail from './pages/IncidentDetail';
import LiveMonitor from './pages/LiveMonitor';
import Login from './pages/Login';
import PipelineClose from './pages/PipelineClose';
import Trends from './pages/Trends';
import Zones from './pages/Zones';

function RequireAuth({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      {user && <TopBar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/console"
          element={
            <RequireAuth>
              <Console />
            </RequireAuth>
          }
        />
        <Route
          path="/incidents/:id"
          element={
            <RequireAuth>
              <IncidentDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/live"
          element={
            <RequireAuth>
              <LiveMonitor />
            </RequireAuth>
          }
        />
        <Route
          path="/trends"
          element={
            <RequireAuth>
              <Trends />
            </RequireAuth>
          }
        />
        <Route
          path="/zones"
          element={
            <RequireAuth>
              <Zones />
            </RequireAuth>
          }
        />
        <Route
          path="/governance"
          element={
            <RequireAuth>
              <Governance />
            </RequireAuth>
          }
        />
        <Route
          path="/pipeline"
          element={
            <RequireAuth>
              <PipelineClose />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={user ? '/console' : '/login'} replace />} />
      </Routes>
      {user && <DirectorPanel />}
    </div>
  );
}
