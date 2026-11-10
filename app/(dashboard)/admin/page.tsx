'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { Avatar, Button, Card, Eyebrow } from '@/components/ui/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { specialtyLabel } from '@/lib/types';

export default function AdminPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!profile?.is_owner) return;
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('th_profiles')
      .select('*')
      .eq('is_approved', false)
      .eq('is_rejected', false)
      .eq('is_owner', false)
      .order('created_at', { ascending: true });

    if (loadError) {
      console.error('Failed to load pending join requests:', loadError);
      setError('تعذر تحميل طلبات الانضمام. تحقق من تحديث قاعدة البيانات.');
    } else {
      setRequests((data ?? []) as Profile[]);
    }
    setLoading(false);
  }, [profile?.is_owner]);

  useEffect(() => {
    if (!profile) return;
    if (!profile.is_owner) router.replace('/workspace');
    else void loadRequests();
  }, [profile, router, loadRequests]);

  async function approve(member: Profile) {
    if (processingId) return;
    setProcessingId(member.id);
    const { error: actionError } = await supabase.rpc('th_approve_member', { p_profile_id: member.id });
    if (actionError) {
      console.error('Failed to approve member:', actionError);
      setError('تعذرت الموافقة على الطلب. تحقق من صلاحيات المدير وحاول مجددًا.');
    } else {
      setRequests((current) => current.filter((request) => request.id !== member.id));
      setError('');
    }
    setProcessingId(null);
  }

  async function reject(member: Profile) {
    if (processingId || !window.confirm(`رفض طلب انضمام ${member.display_name}؟`)) return;
    setProcessingId(member.id);
    const { error: actionError } = await supabase.rpc('th_reject_member', { p_profile_id: member.id });
    if (actionError) {
      console.error('Failed to reject member:', actionError);
      setError('تعذر رفض الطلب. تحقق من صلاحيات المدير وحاول مجددًا.');
    } else {
      setRequests((current) => current.filter((request) => request.id !== member.id));
      setError('');
    }
    setProcessingId(null);
  }

  if (!profile?.is_owner) return <p className="text-sm text-slate-500">جارٍ التحقق من صلاحيات المدير…</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>لوحة خاصة بالمدير</Eyebrow>
          <h1 className="display mt-4 text-4xl font-bold sm:text-5xl">طلبات الانضمام</h1>
          <p className="mt-3 text-sm text-slate-500">لن يدخل الأعضاء الجدد إلى مساحة الفريق قبل موافقتك.</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral/10 text-coral" aria-hidden="true"><ShieldCheck size={21} /></span>
      </div>

      {error && <p role="alert" className="mt-5 text-sm text-red-400">{error}</p>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-400">{requests.length} طلبات بانتظار المراجعة</h2>
        <Button type="button" variant="ghost" disabled={loading} onClick={() => void loadRequests()} className="inline-flex items-center gap-2 px-3 py-2">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> تحديث
        </Button>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-slate-500">جارٍ تحميل الطلبات…</p>
      ) : requests.length ? (
        <div className="mt-4 space-y-3">
          {requests.map((member) => (
            <Card key={member.id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <Avatar name={member.display_name} url={member.avatar_url} size={44} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{member.display_name}</h3>
                <p className="mt-1 text-xs text-slate-500">{specialtyLabel(member.specialty)} · طلب في {new Date(member.created_at).toLocaleDateString('ar')}</p>
                {member.bio && <p dir="auto" className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{member.bio}</p>}
              </div>
              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                <Button type="button" disabled={processingId !== null} onClick={() => void approve(member)} className="flex-1 px-4 py-2 sm:flex-none">
                  {processingId === member.id ? 'جارٍ التنفيذ…' : 'موافقة'}
                </Button>
                <Button type="button" variant="ghost" disabled={processingId !== null} onClick={() => void reject(member)} className="flex-1 px-4 py-2 text-red-400 hover:text-red-300 sm:flex-none">
                  رفض
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-4 flex flex-col items-center p-10 text-center">
          <UserRound size={25} className="text-slate-500" />
          <p className="mt-3 text-sm font-semibold">لا توجد طلبات معلقة</p>
          <p className="mt-1 text-xs text-slate-500">ستظهر طلبات الأعضاء الجدد هنا بعد إكمال ملفهم.</p>
        </Card>
      )}
    </div>
  );
}
