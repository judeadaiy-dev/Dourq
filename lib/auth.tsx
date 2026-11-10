'use client';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface Ctx { user: User | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ user: null, profile: null, loading: true, refreshProfile: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); return; }
    let { data } = await supabase.from('th_profiles').select('*').eq('id', u.id).maybeSingle();
    if (!data) {
      const name = (u.user_metadata?.display_name as string) || (u.email ?? '').split('@')[0];
      await supabase.rpc('th_ensure_profile', { p_name: name });
      data = (await supabase.from('th_profiles').select('*').eq('id', u.id).maybeSingle()).data;
    }
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user ?? null);
      await load(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setTimeout(() => load(s?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value: Ctx = {
    user, profile, loading,
    refreshProfile: () => load(user),
    signOut: async () => { await supabase.auth.signOut(); }
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
