'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/ui/ui';
import type { Profile, TeamNotification } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

export default function NotificationCenter() {
  const { profile } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<TeamNotification[]>([]);
  const [people, setPeople] = useState<Map<string, Pick<Profile, 'id' | 'display_name' | 'avatar_url'>>>(new Map());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const unread = notifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [notificationResult, profileResult] = await Promise.all([
          supabase.from('th_notifications').select('*').order('created_at', { ascending: false }).limit(30),
          supabase.from('th_profiles').select('id,display_name,avatar_url')
        ]);
        if (!active) return;
        if (notificationResult.error) {
          console.error('Failed to load notifications:', notificationResult.error);
          setError('لم نتمكن من تحميل الإشعارات الآن. حاول مرة أخرى.');
          return;
        }
        setNotifications((notificationResult.data ?? []) as TeamNotification[]);
        if (profileResult.error) {
          console.error('Failed to load notification actors:', profileResult.error);
          setError('الإشعارات متاحة، لكن بعض التفاصيل غير متاحة الآن.');
          return;
        }
        setPeople(new Map(((profileResult.data ?? []) as Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]).map((person) => [person.id, person])));
      } catch (loadError) {
        console.error('Unexpected error while loading notifications:', loadError);
        if (active) setError('لم نتمكن من تحميل الإشعارات الآن. حاول مرة أخرى.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const channel = supabase.channel(`notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'th_notifications', filter: `user_id=eq.${profile.id}` }, (payload) => {
        const notification = payload.new as TeamNotification;
        setNotifications((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current].slice(0, 30));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'th_notifications', filter: `user_id=eq.${profile.id}` }, (payload) => {
        const notification = payload.new as TeamNotification;
        setNotifications((current) => current.map((item) => item.id === notification.id ? notification : item));
      })
      .subscribe((status, subscriptionError) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (subscriptionError) console.error('Notification realtime subscription failed:', subscriptionError);
          if (active) setError('توقف التحديث المباشر مؤقتًا. أعد تحميل القائمة للمحاولة مجددًا.');
        }
      });
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [profile?.id, reloadKey]);

  async function markRead(notification: TeamNotification) {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('th_notifications').update({ read_at: readAt }).eq('id', notification.id);
    if (updateError) {
      console.error('Failed to mark notification as read:', updateError);
      setError('لم يتم حفظ حالة القراءة. حاول مرة أخرى.');
      return;
    }
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
  }

  async function markAllRead() {
    if (!profile || unread === 0 || markingAll) return;
    setMarkingAll(true);
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('th_notifications')
      .update({ read_at: readAt })
      .eq('user_id', profile.id)
      .is('read_at', null);
    if (updateError) {
      console.error('Failed to mark all notifications as read:', updateError);
      setError('لم يتم تحديث حالة القراءة. حاول مرة أخرى.');
      setMarkingAll(false);
      return;
    }
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    setError('');
    setMarkingAll(false);
  }

  async function openNotification(notification: TeamNotification) {
    await markRead(notification);
    setOpen(false);
    if (notification.task_id) router.push(`/tasks?task=${notification.task_id}`);
    else if (notification.channel_id) router.push(`/chat?channel=${encodeURIComponent(notification.channel_id)}`);
    else router.push('/chat');
  }

  function notificationIcon(kind: string) {
    if (kind === 'task_assigned') return '📌';
    if (kind === 'task_status') return '🔄';
    if (kind === 'mention_chat') return '💬';
    if (kind === 'mention_task') return '✦';
    return '🔔';
  }

  return (
    <div className="relative">
      <button type="button" aria-label={`الإشعارات${unread ? `، ${unread} غير مقروءة` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/50 text-lg text-slate-600 transition hover:border-coral/30 hover:bg-coral/5 hover:text-coral">
        🔔
        {unread > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <div className="absolute left-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#5b4631]/15 bg-[#fffdfa] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#5b4631]/10 px-4 py-3">
          <div><h3 className="font-bold">الإشعارات</h3><span className="text-xs text-slate-500">{unread} غير مقروء</span></div>
          <button type="button" onClick={() => void markAllRead()} disabled={unread === 0 || markingAll} className="rounded-lg px-2.5 py-2 text-[11px] font-semibold text-coral transition hover:bg-coral/5 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent">{markingAll ? 'جارٍ التحديث…' : '✓ تحديد الكل كمقروء'}</button>
        </div>
        {error && <div role="status" aria-live="polite" className="flex items-center gap-3 border-b border-[#5b4631]/10 bg-[#fbf4e8] px-4 py-3">
          <span aria-hidden="true" className="text-sm">ⓘ</span>
          <p className="flex-1 text-xs leading-5 text-amber-900">{error}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-coral shadow-sm transition hover:bg-[#f8eadd]">إعادة المحاولة</button>
        </div>}
        <div className="scroll-thin max-h-[min(65vh,28rem)] overflow-y-auto p-2">
          {notifications.map((notification) => {
            const actor = notification.actor_id ? people.get(notification.actor_id) : undefined;
            return <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-right transition hover:bg-[#f5eee5] focus-visible:bg-[#f5eee5] ${notification.read_at ? '' : 'bg-[#f8f1e8]'}`}>
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${notification.read_at ? 'bg-stone-100' : 'bg-coral/10'}`}>{notificationIcon(notification.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5">{notification.body}</span>
                <span className="mt-1 block text-[10px] text-slate-500">{actor?.display_name ? `${actor.display_name} · ` : ''}{timeAgo(notification.created_at)}</span>
              </span>
              {!notification.read_at && <i aria-label="غير مقروء" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />}
            </button>;
          })}
          {loading && !notifications.length && <p className="px-4 py-8 text-center text-sm text-slate-500">جارٍ تحميل الإشعارات…</p>}
          {!loading && !notifications.length && !error && <div className="px-4 py-8 text-center">
            <span aria-hidden="true" className="text-2xl">🔔</span>
            <p className="mt-2 text-sm text-slate-500">لا توجد إشعارات بعد.</p>
          </div>}
        </div>
        <Link href="/tasks" onClick={() => setOpen(false)} className="block border-t border-[#5b4631]/10 px-4 py-3 text-center text-xs font-semibold text-coral">عرض لوحة المهام</Link>
      </div>}
    </div>
  );
}
