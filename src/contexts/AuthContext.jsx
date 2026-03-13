import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { addAccessRequest, getApprovedProfile } from '../utils/localOps';

const AuthContext = createContext(null);

function buildFallbackProfile(user) {
  const locallyApproved = getApprovedProfile(user);
  if (locallyApproved) return locallyApproved;

  const fallback = {
    user_id: user.id,
    email: user.email ?? '',
    role: 'Publisher',
    is_pioneer: false,
    is_approved: false,
    approval_source: 'fallback'
  };

  addAccessRequest({ user_id: user.id, email: user.email ?? '', requested_role: 'Publisher' });
  return fallback;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(user) {
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (mounted) setProfile(data ?? buildFallbackProfile(user));
      } catch {
        if (mounted) setProfile(buildFallbackProfile(user));
      }
    }

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      if (data.session?.user) {
        await loadProfile(data.session.user);
      }
      setLoading(false);
    }

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      if (nextSession?.user) {
        await loadProfile(nextSession.user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signInWithGoogle: async () => {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
    }
  }), [session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
