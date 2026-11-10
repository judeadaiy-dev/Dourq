'use client';
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Online } from './types';

const PresenceCtx = createContext<Online[]>([]);
export const usePresence = () => useContext(PresenceCtx);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const pathname = usePathname();
  const [online, setOnline] = useState<Online[]>([]);
  const ch = useRef<RealtimeChannel | null>(null);
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    if (!profile) return;
    if (profile.approved === false && !profile.is_owner) { setOnline([]); return; }
    const channel = supabase.channel('site-presence', { config: { presence: { key: profile.id } } });
    channel.on('presence', { event: 'sync' }, () => {
      const st = channel.presenceState<Online>();
      setOnline(Object.values(st).map((a) => a[0] as Online));
    }).subscribe(async (s) => {
      if (s === 'SUBSCRIBED') await channel.track({ id: profile.id, name: profile.display_name, avatar: profile.avatar_url, path: path.current });
    });
    ch.current = channel;
    return () => { supabase.removeChannel(channel); ch.current = null; };
  }, [profile?.id, profile?.approved, profile?.is_owner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile && profile.approved !== false || profile?.is_owner) ch.current?.track({ id: profile.id, name: profile.display_name, avatar: profile.avatar_url, path: pathname });
  }, [pathname, profile?.id, profile?.approved, profile?.is_owner]); // eslint-disable-line react-hooks/exhaustive-deps

  return <PresenceCtx.Provider value={online}>{children}</PresenceCtx.Provider>;
}
