'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { usePresence } from '@/lib/presence';
import { Avatar, Card, Eyebrow } from '@/components/ui/ui';

const PAGE: Record<string, string> = { workspace: 'مساحة العمل', chat: 'المحادثة', tasks: 'المهام', people: 'الفريق' };

export default function Workspace() {
  const { profile } = useAuth();
  const online = usePresence();
  const [counts, setCounts] = useState({ members: 0, open: 0, messages: 0 });
  useEffect(() => {
    (async () => {
      const [m, t, c] = await Promise.all([
        supabase.from('th_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('th_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('th_messages').select('id', { count: 'exact', head: true })
      ]);
      setCounts({ members: m.count ?? 0, open: t.count ?? 0, messages: c.count ?? 0 });
    })();
  }, []);
  const stats = [['الأعضاء', counts.members], ['متصلون الآن', online.length], ['المهام المفتوحة', counts.open], ['الرسائل', counts.messages]] as const;

  return (
    <div>
      <Eyebrow>مساحة العمل</Eyebrow>
      <h1 className="display mt-4 text-4xl font-bold sm:text-5xl">مرحبًا {profile?.display_name.split(' ')[0]}، <span className="bg-gradient-to-l from-coral via-amber-200 to-white bg-clip-text text-transparent">لنبدأ العمل.</span></h1>
      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(([l, v]) => (
          <Card key={l} className="p-5"><p className="display text-3xl font-bold sm:text-4xl">{v}<span className="text-coral">{l === 'متصلون الآن' ? '●' : ''}</span></p><p className="mt-2 text-[10px] text-slate-500">{l}</p></Card>
        ))}
      </div>
      <div className="mt-6">
        <Card className="p-6">
          <Eyebrow>أعضاء الفريق</Eyebrow>
          <h3 className="display mt-2 text-2xl font-bold">المتصلون الآن</h3>
          <div className="mt-5 space-y-3">
            {online.length === 0 && <p className="text-sm text-slate-500">أنت هنا وحدك حاليًا.</p>}
            {online.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                <span className="relative"><Avatar name={o.name} url={o.avatar} size={36} /><i className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{o.name}</p><p className="text-xs text-slate-500">يتصفح {PAGE[o.path.split('/')[1]] ?? 'TeamHub'}</p></div>
                <Link href={o.path} className="text-xs font-semibold text-coral">انتقل ←</Link>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
