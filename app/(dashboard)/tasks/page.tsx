'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import TaskCard from '@/components/TaskCard';
import { Button, Card, Eyebrow, Input, Textarea } from '@/components/ui/ui';
import type { Profile, Reply, Task, TaskPriority, TaskStatus } from '@/lib/types';

const COLUMNS: { id: TaskStatus; label: string; tone: string }[] = [
  { id: 'open', label: 'قيد الانتظار', tone: 'border-stone-300 bg-stone-100' },
  { id: 'in_progress', label: 'قيد التنفيذ', tone: 'border-amber-300 bg-amber-50' },
  { id: 'review', label: 'قيد المراجعة', tone: 'border-blue-300 bg-blue-50' },
  { id: 'done', label: 'مكتملة', tone: 'border-emerald-300 bg-emerald-50' }
];

export default function TasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [requestedTask, setRequestedTask] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [taskResult, replyResult, peopleResult] = await Promise.all([
      supabase.from('th_tasks').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('th_task_replies').select('*').order('created_at', { ascending: true }),
      supabase.from('th_profiles').select('*')
    ]);
    if (taskResult.error || replyResult.error || peopleResult.error) {
      setErr('تعذر تحميل بيانات لوحة المهام. تحقق من تشغيل مخطط قاعدة البيانات المحدّث ثم أعد المحاولة.');
      setLoading(false);
      return;
    }
    setTasks((taskResult.data ?? []) as Task[]);
    setReplies((replyResult.data ?? []) as Reply[]);
    setPeople(new Map(((peopleResult.data ?? []) as Profile[]).map((person) => [person.id, person])));
    setErr('');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('tasks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'th_tasks' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'th_task_replies' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    const assignedProfile = new URLSearchParams(window.location.search).get('assign');
    if (assignedProfile && people.has(assignedProfile)) setAssignedTo(assignedProfile);
  }, [people]);

  useEffect(() => {
    const taskId = Number(new URLSearchParams(window.location.search).get('task'));
    if (Number.isSafeInteger(taskId) && taskId > 0) setRequestedTask(taskId);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('th_tasks').insert({
      title: title.trim(),
      body: body.trim() || null,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
      priority
    });
    if (error) {
      setErr(`تعذر نشر المهمة: ${error.message}. إذا كانت قاعدة البيانات قديمة شغّل supabase/schema.sql.`);
      return;
    }
    setTitle('');
    setBody('');
    setAssignedTo('');
    setDueDate('');
    setPriority('medium');
    setErr('');
    void load();
  }

  const visibleTasks = useMemo(() => filter === 'mine'
    ? tasks.filter((task) => task.assigned_to === profile?.id || task.author_id === profile?.id)
    : tasks, [filter, profile?.id, tasks]);

  return (
    <div>
      <Eyebrow>لوحة المهام</Eyebrow>
      <h1 className="display mt-4 text-4xl font-bold sm:text-5xl">من الفكرة إلى الإنجاز.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">لوحة كانبان للفريق مع مسؤول واضح وأولوية وموعد تسليم ونقاش ومرفقات لكل مهمة.</p>
      <Card className="mt-7 p-5 sm:p-6">
        <form onSubmit={(event) => void create(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input dir="auto" className="mt-0" placeholder="عنوان المهمة" value={title} required maxLength={160} onChange={(event) => setTitle(event.target.value)} />
            <select aria-label="المسؤول عن المهمة" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="rounded-xl border border-white/10 bg-[#fffdfa] px-4 py-3 text-sm text-[#352f28] outline-none focus:border-coral">
              <option value="">اختر المسؤول (اختياري)</option>
              {[...people.values()].filter((person) => (person.is_approved && !person.is_rejected) || person.is_owner).map((person) => <option key={person.id} value={person.id}>{person.display_name}{person.specialty ? ` · ${person.specialty}` : ''}</option>)}
            </select>
            <Textarea dir="auto" rows={2} placeholder="التفاصيل (اختياري)" value={body} onChange={(event) => setBody(event.target.value)} className="mt-0 md:col-span-2" />
            <label className="text-xs font-semibold text-slate-500">الأولوية
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="mt-2 block w-full rounded-xl border border-white/10 bg-[#fffdfa] px-4 py-3 text-sm text-[#352f28] outline-none focus:border-coral">
                <option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">موعد التسليم
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/10 bg-[#fffdfa] px-4 py-3 text-sm text-[#352f28] outline-none focus:border-coral" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs text-red-500">{err}</p>
            <Button type="submit" disabled={!title.trim()}>أضف المهمة</Button>
          </div>
        </form>
      </Card>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">{profile?.is_owner ? 'ثبّت المهام المهمة، وأسند العمل إلى أعضاء الفريق.' : 'حدّث حالة المهام المسندة إليك وتابع النقاش.'}</p>
        <select aria-label="تصفية المهام" value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'mine')} className="rounded-xl border border-white/10 bg-[#fffdfa] px-3 py-2 text-xs text-[#352f28]">
          <option value="all">كل المهام</option><option value="mine">مهامي</option>
        </select>
      </div>
      {loading && <p className="mt-8 text-center text-sm text-slate-500">جارٍ تحميل اللوحة…</p>}
      {!loading && <div className="scroll-thin mt-5 grid items-start gap-4 overflow-x-auto pb-3 md:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnTasks = visibleTasks.filter((task) => task.status === column.id);
          return <section key={column.id} className={`min-w-[min(84vw,22rem)] rounded-2xl border p-3 ${column.tone}`}>
            <header className="mb-3 flex items-center justify-between px-1 py-1">
              <h2 className="text-sm font-bold">{column.label}</h2>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs text-slate-500">{columnTasks.length}</span>
            </header>
            <div className="space-y-3">
              {columnTasks.map((task) => <TaskCard key={task.id} task={task} replies={replies.filter((reply) => reply.task_id === task.id)} people={people} onChange={() => { void load(); }} initialOpen={requestedTask === task.id} />)}
              {columnTasks.length === 0 && <p className="rounded-xl border border-dashed border-[#5b4631]/15 bg-white/35 px-3 py-6 text-center text-xs text-slate-500">لا توجد مهام هنا</p>}
            </div>
          </section>;
        })}
      </div>}
      {!loading && visibleTasks.length === 0 && !err && <p className="mt-8 text-center text-sm text-slate-500">لا توجد مهام بعد. أضف المهمة الأولى.</p>}
    </div>
  );
}
