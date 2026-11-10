'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Badge, Button, Card, Input } from '@/components/ui/ui';
import MentionTextarea from '@/components/MentionTextarea';
import { timeAgo, cn } from '@/lib/utils';
import type { Profile, Reply, Task, TaskAttachment, TaskPriority, TaskStatus } from '@/lib/types';

const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: 'open', label: 'قيد الانتظار' },
  { id: 'in_progress', label: 'قيد التنفيذ' },
  { id: 'review', label: 'قيد المراجعة' },
  { id: 'done', label: 'مكتملة' }
];
const PRIORITIES: Record<TaskPriority, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' };

function AttachmentLink({ attachment }: { attachment: TaskAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.storage.from('th-task-files').createSignedUrl(attachment.storage_path, 3600).then(({ data, error: resultError }) => {
      if (!active) return;
      if (resultError) { setError(true); return; }
      setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [attachment.storage_path]);

  if (error) return <span className="text-xs text-red-400">تعذر فتح {attachment.file_name}</span>;
  if (!url) return <span className="text-xs text-slate-500">جارٍ تجهيز {attachment.file_name}…</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-xs font-semibold text-coral hover:underline">📎 {attachment.file_name}</a>;
}

export default function TaskCard({
  task, replies, people, onChange, initialOpen = false
}: {
  task: Task;
  replies: Reply[];
  people: Map<string, Profile>;
  onChange: () => void;
  initialOpen?: boolean;
}) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [open, setOpen] = useState(initialOpen);
  const [err, setErr] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const author = people.get(task.author_id);
  const assignee = task.assigned_to ? people.get(task.assigned_to) : undefined;
  const owner = !!profile?.is_owner;
  const canEdit = owner || profile?.id === task.author_id;
  const canChangeStatus = canEdit || profile?.id === task.assigned_to;

  useEffect(() => {
    if (!open) return;
    let active = true;
    supabase.from('th_task_attachments').select('*').eq('task_id', task.id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setErr('تعذر تحميل مرفقات المهمة. تحقق من تحديث قاعدة البيانات.'); return; }
        setAttachments((data ?? []) as TaskAttachment[]);
      });
    return () => { active = false; };
  }, [open, task.id]);

  async function run(promise: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await promise;
    setErr(error ? `تعذر حفظ التغييرات: ${error.message}` : '');
    if (!error) onChange();
  }

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase.from('th_task_replies').insert({ task_id: task.id, body: text.trim(), mentions });
    if (error) { setErr(`تعذر إضافة التعليق: ${error.message}`); return; }
    setText('');
    setMentions([]);
    setErr('');
    onChange();
  }

  async function uploadAttachment(file?: File) {
    if (!file || !profile) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain'];
    if (!allowed.includes(file.type) || file.size > 20 * 1024 * 1024) {
      setErr('ارفع PDF أو صورة أو ملفًا نصيًا بحجم أقصى 20 ميغابايت.');
      return;
    }
    setUploading(true);
    setErr('');
    const path = `${task.id}/${profile.id}/${crypto.randomUUID()}-${fileExtSafe(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('th-task-files').upload(path, file, { contentType: file.type });
    if (uploadError) {
      setErr(`تعذر رفع المرفق: ${uploadError.message}. تحقق من تشغيل مخطط قاعدة البيانات المحدّث.`);
      setUploading(false);
      return;
    }
    const { data, error: insertError } = await supabase.from('th_task_attachments').insert({
      task_id: task.id, storage_path: path, file_name: file.name, mime_type: file.type
    }).select('*').single();
    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from('th-task-files').remove([path]);
      setErr(cleanupError
        ? `تعذر ربط المرفق بالمهمة (${insertError.message}) كما تعذر حذف الملف المرفوع (${cleanupError.message}).`
        : `تعذر إضافة المرفق للمهمة: ${insertError.message}`);
      setUploading(false);
      return;
    }
    setAttachments((current) => [...current, data as TaskAttachment]);
    setUploading(false);
  }

  async function deleteAttachment(attachment: TaskAttachment) {
    const { error: storageError } = await supabase.storage.from('th-task-files').remove([attachment.storage_path]);
    if (storageError) { setErr(`تعذر حذف الملف من التخزين: ${storageError.message}`); return; }
    const { error: recordError } = await supabase.from('th_task_attachments').delete().eq('id', attachment.id);
    if (recordError) {
      setErr(`حُذف الملف من التخزين لكن تعذر حذف سجله: ${recordError.message}`);
      return;
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    setErr('');
  }

  async function deleteTask() {
    if (!window.confirm('هل تريد حذف هذه المهمة وكل نقاشاتها ومرفقاتها؟')) return;
    const { data: attachmentRows, error: attachmentResultError } = await supabase.from('th_task_attachments').select('*').eq('task_id', task.id);
    if (attachmentResultError) { setErr(`تعذر تجهيز حذف المهمة: ${attachmentResultError.message}`); return; }
    for (const attachment of (attachmentRows ?? []) as TaskAttachment[]) {
      const { error } = await supabase.storage.from('th-task-files').remove([attachment.storage_path]);
      if (error) { setErr(`لم تُحذف المهمة لأن حذف المرفق ${attachment.file_name} فشل: ${error.message}`); return; }
    }
    await run(supabase.from('th_tasks').delete().eq('id', task.id));
  }

  const statusColor: Record<TaskStatus, string> = {
    open: 'bg-white/10 text-slate-500',
    in_progress: 'bg-amberx/15 text-amber-100',
    review: 'bg-blue-500/10 text-blue-700',
    done: 'bg-emerald-400/15 text-emerald-700'
  };
  const priorityColor: Record<TaskPriority, string> = {
    low: 'text-slate-500',
    medium: 'text-amber-700',
    high: 'text-red-500'
  };

  return (
    <Card className={cn('overflow-hidden', task.pinned && 'border-coral/40 coral-glow')}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {task.pinned && <Badge>📌 مثبتة</Badge>}
          <Badge className={statusColor[task.status]}>{STATUSES.find((item) => item.id === task.status)?.label}</Badge>
          <span className={`text-xs font-semibold ${priorityColor[task.priority ?? 'medium']}`}>● أولوية {PRIORITIES[task.priority ?? 'medium']}</span>
          <span className="ms-auto text-xs text-slate-500">{timeAgo(task.created_at)}</span>
        </div>
        <h3 className="display mt-4 text-xl font-bold">{task.title}</h3>
        {task.body && <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{task.body}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-2"><Avatar name={author?.display_name} url={author?.avatar_url} size={22} />من {author?.display_name ?? 'عضو'}</span>
          {assignee && <span className="flex items-center gap-2"><Avatar name={assignee.display_name} url={assignee.avatar_url} size={22} />مسؤول: {assignee.display_name}</span>}
          {task.due_date && <span className={task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'font-semibold text-red-500' : ''}>الاستحقاق: {new Date(`${task.due_date}T00:00:00`).toLocaleDateString('ar')}</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-sm font-semibold text-coral">{replies.length} {replies.length === 1 ? 'تعليق' : 'تعليقات'} · نقاش ومرفقات {open ? '▴' : '▾'}</button>
          <div className="ms-auto flex flex-wrap gap-2 text-xs">
            {canChangeStatus && <select aria-label="حالة المهمة" value={task.status} onChange={(event) => void run(supabase.rpc('th_update_task_status', { p_task_id: task.id, p_status: event.target.value }))} className="rounded-lg border border-white/10 bg-[#fffdfa] px-2 py-1.5 text-[#352f28] outline-none">
              {STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>}
            {canEdit && <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 transition hover:border-coral/50">
              إسناد
              <select aria-label="إسناد المهمة" value={task.assigned_to ?? ''} onChange={(event) => void run(supabase.from('th_tasks').update({ assigned_to: event.target.value || null }).eq('id', task.id))} className="ms-2 max-w-32 bg-transparent text-[#352f28] outline-none">
                <option value="">غير مسندة</option>
                {[...people.values()].filter((person) => person.approved || person.is_owner).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
              </select>
            </label>}
            {owner && <button type="button" onClick={() => void run(supabase.from('th_tasks').update({ pinned: !task.pinned }).eq('id', task.id))} className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-coral/50">{task.pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button>}
            {canEdit && <button type="button" onClick={() => void deleteTask()} className="rounded-lg border border-white/10 px-3 py-1.5 text-red-500 hover:border-red-400/50">حذف</button>}
          </div>
        </div>
        {canEdit && <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-500">الأولوية
            <select value={task.priority ?? 'medium'} onChange={(event) => void run(supabase.from('th_tasks').update({ priority: event.target.value }).eq('id', task.id))} className="ms-2 rounded-lg border border-white/10 bg-[#fffdfa] px-2 py-1.5 text-[#352f28]">
              {(Object.keys(PRIORITIES) as TaskPriority[]).map((priority) => <option key={priority} value={priority}>{PRIORITIES[priority]}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">موعد التسليم
            <input type="date" value={task.due_date ?? ''} onChange={(event) => void run(supabase.from('th_tasks').update({ due_date: event.target.value || null }).eq('id', task.id))} className="ms-2 rounded-lg border border-white/10 bg-[#fffdfa] px-2 py-1.5 text-[#352f28]" />
          </label>
        </div>}
        {err && <p role="status" className="mt-3 text-xs text-red-500">{err}</p>}
      </div>
      {open && <div className="space-y-4 border-t border-white/10 bg-white/25 p-5 sm:p-6">
        <section>
          <h4 className="text-sm font-bold">المناقشة</h4>
          <div className="mt-3 space-y-3">
            {replies.map((item) => {
              const person = people.get(item.author_id);
              return <div key={item.id} className="flex gap-3 rounded-2xl bg-white/55 p-3">
                <Avatar name={person?.display_name} url={person?.avatar_url} size={28} />
                <div className="min-w-0 flex-1"><p className="text-xs text-slate-500"><b className="text-slate-700">{person?.display_name ?? 'عضو'}</b> · {timeAgo(item.created_at)}</p><p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm">{item.body}</p></div>
              </div>;
            })}
          </div>
          <form onSubmit={(event) => void reply(event)} className="mt-3 space-y-2">
            <MentionTextarea value={text} onChange={setText} people={[...people.values()].filter((person) => person.approved || person.is_owner)} mentionIds={mentions} onMentionIdsChange={setMentions} rows={2} placeholder="اكتب تعليقًا… اكتب @ للإشارة إلى عضو" />
            <div className="flex justify-end"><Button type="submit" disabled={!text.trim()}>إضافة تعليق</Button></div>
          </form>
        </section>
        <section className="border-t border-white/10 pt-4">
          <h4 className="text-sm font-bold">مرفقات المهمة</h4>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {attachments.map((item) => <span key={item.id} className="flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/60 px-3 py-2">
              <AttachmentLink attachment={item} />
              {(item.uploaded_by === profile?.id || canEdit || owner) && <button type="button" aria-label={`حذف ${item.file_name}`} onClick={() => void deleteAttachment(item)} className="text-red-400">×</button>}
            </span>)}
            {attachments.length === 0 && <p className="text-xs text-slate-500">لا توجد مرفقات بعد.</p>}
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-white/15 bg-white/50 px-3 py-2 text-xs font-semibold transition hover:border-coral/50">
            {uploading ? 'جارٍ الرفع…' : 'إرفاق ملف'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain" disabled={uploading} className="sr-only" onChange={(event) => { void uploadAttachment(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <p className="mt-1 text-[10px] text-slate-500">PDF أو صورة أو TXT · حتى 20 ميغابايت</p>
        </section>
      </div>}
    </Card>
  );
}

function fileExtSafe(filename: string) {
  return filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
}
