import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Waits for auth state to resolve before deciding.
// If loading → show nothing (App.jsx already shows spinner).
// If no user  → send to login.
// If user     → render children.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null; // App.jsx spinner handles this already
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}