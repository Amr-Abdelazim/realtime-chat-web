import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { AuthScreen } from './components/AuthScreen';
import { ChatLayout } from './components/ChatLayout';

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) {
    return <main className="boot-screen"><div className="boot-brand"><span className="brand-mark">R</span><span>ابعتلي<span className="brand-period">.</span></span></div><span className="button-spinner" /><p>Connecting your conversations…</p></main>;
  }
  if (!user) return <AuthScreen />;
  return <ChatProvider><ChatLayout /></ChatProvider>;
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
