'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { usePresence } from '@/lib/presence';
import { useAuth } from '@/lib/auth';
import { Avatar, Badge, Card, Eyebrow } from '@/components/ui/ui';
import { SPECIALTIES, specialtyLabel, Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

function ResumeLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.storage.from('th-resumes').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (!active) return;
      if (error) { setFailed(true); return; }
      setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);

  if (failed) return <span className="text-xs text-red-400">تعذر تحميل السيرة الذاتية</span>;
  if (!url) return <span className="text-xs text-slate-500">جارٍ تجهيز السيرة الذاتية…</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-coral hover:underline">عرض السيرة الذاتية ↗</a>;
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [activeTaskCounts, setActiveTaskCounts] = useState<Map<string, number>>(new Map());
  const [directoryError, setDirectoryError] = useState('');
  const online = usePresence();
  const { profile } = useAuth();
  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const [profilesResult, tasksResult] = await Promise.all([
        supabase.from('th_profiles').select('*').order('created_at'),
        supabase.from('th_tasks').select('assigned_to').neq('status', 'done').not('assigned_to', 'is', null)
      ]);
      if (profilesResult.error || tasksResult.error) setDirectoryError('تعذر تحميل بيانات الفريق كاملة. حدّث الصفحة أو تحقق من مخطط قاعدة البيانات.');
      const profiles = (profilesResult.data ?? []) as Profile[];
      setPeople(profiles.filter((person) => person.is_approved && !person.is_rejected));
      const counts = new Map<string, number>();
      for (const task of tasksResult.data ?? []) {
        if (task.assigned_to) counts.set(task.assigned_to, (counts.get(task.assigned_to) ?? 0) + 1);
      }
      setActiveTaskCounts(counts);
    };
    void load();
    const channel = supabase.channel(`directory-tasks-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'th_tasks' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile?.id]);
  const shown = people.filter((person) => {
    const matchesSpecialty = filter === 'all' || person.specialty === filter;
    const haystack = [person.display_name, person.job_title, person.bio, specialtyLabel(person.specialty)].join(' ').toLocaleLowerCase();
    return matchesSpecialty && haystack.includes(search.trim().toLocaleLowerCase());
  });

  return (
    <div>
      <Eyebrow>أعضاء الفريق</Eyebrow>
      <h1 className="display mt-4 text-4xl font-bold sm:text-5xl">فريق يصنع الفرق.</h1>
      <label className="mt-6 block max-w-xl text-sm font-semibold">ابحث عن عضو أو تخصص
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مثال: تصميم، أحمد، واجهات…" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-normal text-white outline-none focus:border-coral" />
      </label>
      {directoryError && <p role="status" className="mt-4 text-sm text-red-400">{directoryError}</p>}
      <div className="mt-8 flex flex-wrap gap-2">
        {[{ id: 'all', label: 'الكل' }, ...SPECIALTIES].map((s) => (
          <button key={s.id} onClick={() => setFilter(s.id)} className={cn('rounded-xl border px-4 py-2.5 text-sm transition', filter === s.id ? 'border-coral/30 bg-coral/10 text-amber-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25')}>{s.label}</button>
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <Card key={p.id} className="rise p-6">
            <div className="flex items-center gap-4">
              <span className="relative"><Avatar name={p.display_name} url={p.avatar_url} size={56} /><i className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${online.some((person) => person.id === p.id) ? activeTaskCounts.get(p.id) ? 'bg-amber-400' : 'bg-emerald-400' : 'bg-stone-400'}`} /></span>
              <div className="min-w-0"><h3 className="display truncate text-xl font-bold">{p.display_name}</h3><div className="mt-1 flex flex-wrap gap-2"><Badge>{specialtyLabel(p.specialty)}</Badge>{p.is_owner && <Badge className="bg-amberx/15 text-amber-100">مالك المساحة</Badge>}</div>{p.job_title && <p className="mt-1 truncate text-xs text-slate-500">{p.job_title}</p>}</div>
            </div>
            {p.bio && <p dir="auto" className="mt-4 text-sm leading-6 text-slate-400">{p.bio}</p>}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {online.some((person) => person.id === p.id)
                    ? activeTaskCounts.get(p.id) ? `مشغول · ${activeTaskCounts.get(p.id)} مهمة مفتوحة` : 'متصل ومتفرغ'
                    : 'غير متصل'}
                </span>
                <Link href={`/tasks?assign=${encodeURIComponent(p.id)}`} className="rounded-lg border border-coral/20 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/10">إسناد مهمة</Link>
              </div>
              {(p.experience_years != null || p.resume_path || p.linkedin_url || p.github_url) && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4">
                  {p.experience_years != null && <span className="text-xs text-slate-500">{p.experience_years} سنوات خبرة</span>}
                  {p.resume_path && <ResumeLink path={p.resume_path} />}
                  {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-coral">LinkedIn ↗</a>}
                  {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-coral">GitHub ↗</a>}
                </div>
              )}
          </Card>
        ))}
        {shown.length === 0 && <p className="text-sm text-slate-500">لا يوجد أعضاء لعرضهم بعد.</p>}
      </div>
    </div>
  );
}
