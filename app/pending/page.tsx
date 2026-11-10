'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { sendJoinRequestNotice } from '@/lib/join-requests';
import { AuthShell, Button } from '@/components/ui/ui';

export default function PendingPage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const notifiedProfile = useRef<string | null>(null);
  const [emailStatus, setEmailStatus] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  async function sendNotice() {
    setSendingEmail(true);
    setEmailStatus('جارٍ إرسال طلب الانضمام إلى بريد المالك…');
    try {
      await sendJoinRequestNotice();
      setEmailStatus('تم إرسال طلب الانضمام إلى بريد المالك. ستتمكن من الدخول بعد الموافقة.');
    } catch (error) {
      console.error('Unable to email join request:', error);
      setEmailStatus(error instanceof Error ? error.message : 'تعذر إرسال البريد. حاول مرة أخرى.');
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if ((profile?.is_approved && !profile.is_rejected) || profile?.is_owner) router.replace(profile.onboarded ? '/workspace' : '/onboarding');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!profile || profile.is_approved || profile.is_rejected || notifiedProfile.current === profile.id) return;
    notifiedProfile.current = profile.id;
    void sendNotice();
  }, [profile?.id, profile?.is_approved, profile?.is_rejected]);

  return (
    <AuthShell eyebrow="بانتظار الموافقة" title="طلبك قيد المراجعة">
      <p className="mt-5 text-sm leading-7 text-slate-300">{profile?.is_rejected ? 'لم تتم الموافقة على طلب انضمامك. لا يمكنك دخول مساحة الفريق.' : 'لا يمكن دخول مساحة الفريق أو رؤية محتواها حتى يراجع المالك طلبك ويوافق عليه.'}</p>
      {emailStatus && <p role="status" className="mt-4 text-xs leading-6 text-slate-300">{emailStatus}</p>}
      {!profile?.is_rejected && <>
        <Button onClick={() => void sendNotice()} disabled={sendingEmail} className="mt-6 w-full">{sendingEmail ? 'جارٍ الإرسال…' : 'إعادة إرسال الطلب بالبريد'}</Button>
        <Button onClick={async () => { await refreshProfile(); window.location.assign('/workspace'); }} variant="ghost" className="mt-3 w-full">تحقق من حالة الطلب</Button>
      </>}
      <Button onClick={async () => { await signOut(); router.replace('/login'); }} variant="ghost" className="mt-3 w-full">تسجيل الخروج</Button>
    </AuthShell>
  );
}
