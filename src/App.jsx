import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const AtlasPage = lazy(() => import('./pages/AtlasPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TerritoriesPage = lazy(() => import('./pages/TerritoriesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));

function LoadingScreen() {
  return <div className="loading-screen">Loading Territory Assistant...</div>;
}

function PageFrame({ children }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ allowedRoles, children }) {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!profile || !allowedRoles.includes(profile.role)) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <PageFrame><LoginPage /></PageFrame>} />
      <Route path="/app" element={<ProtectedRoute><PageFrame><AtlasPage /></PageFrame></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><PageFrame><DashboardPage /></PageFrame></ProtectedRoute>} />
      <Route path="/territories" element={<ProtectedRoute><PageFrame><TerritoriesPage /></PageFrame></ProtectedRoute>} />
      <Route path="/faq" element={<ProtectedRoute><PageFrame><FAQPage /></PageFrame></ProtectedRoute>} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['Admin', 'Conductor']}>
              <PageFrame><AdminPage /></PageFrame>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route path="/campaigns" element={<Navigate to="/dashboard" replace />} />
      <Route path="/exports" element={<Navigate to="/admin" replace />} />
      <Route path="/operations" element={<Navigate to="/dashboard" replace />} />
      <Route path="/notifications" element={<Navigate to="/admin" replace />} />
      <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
      <Route path="/territory-engine" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} replace />} />
    </Routes>
  );
}
