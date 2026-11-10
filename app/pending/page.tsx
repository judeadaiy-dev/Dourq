'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { AuthShell, Button } from '@/components/ui/ui';

export default function PendingPage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (profile?.approved !== false || profile?.is_owner) router.replace('/workspace');
    else if (profile && !profile.onboarded) router.replace('/onboarding');
  }, [loading, user, profile, router]);

  return (
    <AuthShell eyebrow="بانتظار الموافقة" title="طلبك قيد المراجعة">
      <p className="mt-5 text-sm leading-7 text-slate-300">سيصبح بإمكانك دخول مساحة الفريق بعد موافقة مالك المساحة.</p>
      <Button onClick={async () => { await refreshProfile(); window.location.assign('/workspace'); }} className="mt-6 w-full">تحقق من حالة الطلب</Button>
      <Button onClick={async () => { await signOut(); router.replace('/login'); }} variant="ghost" className="mt-3 w-full">تسجيل الخروج</Button>
    </AuthShell>
  );
}