'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PresenceProvider } from '@/lib/presence';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (profile && !profile.onboarded) router.replace('/onboarding');
    else if (profile?.approved === false && !profile.is_owner) router.replace('/pending');
  }, [loading, user, profile, router]);

  if (loading || !user || !profile) return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">جارٍ التحميل…</main>;
  return (
    <PresenceProvider>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[46rem] -translate-x-1/2 rounded-full bg-amberx/10 blur-[140px]" />
        <div className="absolute left-[-10rem] top-[46rem] h-[28rem] w-[28rem] rounded-full bg-amberx/10 blur-[120px]" />
      </div>
      <Sidebar />
      <div className="md:pr-64">
        <Topbar />
        <main className="mx-auto max-w-6xl px-5 pb-28 pt-8 md:pb-12 lg:px-8">{children}</main>
      </div>
    </PresenceProvider>
  );
}
