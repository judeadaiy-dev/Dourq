'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PresenceProvider } from '@/lib/presence';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (profile && (!profile.is_approved || profile.is_rejected) && !profile.is_owner) router.replace('/pending');
    else if (profile && !profile.onboarded) router.replace('/onboarding');
    else if (profile && pathname.startsWith('/admin') && !profile.is_owner) router.replace('/workspace');
  }, [loading, user, profile, router]);

  if (loading || !user || !profile || (pathname.startsWith('/admin') && !profile.is_owner)) return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">جارٍ التحميل…</main>;
  return (
    <PresenceProvider>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[46rem] -translate-x-1/2 rounded-full bg-amberx/10 blur-[140px]" />
        <div className="absolute left-[-10rem] top-[46rem] h-[28rem] w-[28rem] rounded-full bg-amberx/10 blur-[120px]" />
      </div>
      <Sidebar />
      <div className="md:pr-64">
        {pathname !== '/chat' && <Topbar />}
        <main className={pathname === '/chat' ? 'mx-auto h-[calc(100dvh-4rem)] w-full max-w-none overflow-hidden px-0 pb-0 pt-0 md:h-dvh' : 'mx-auto max-w-6xl px-5 pb-28 pt-8 md:pb-12 lg:px-8'}>{children}</main>
      </div>
    </PresenceProvider>
  );
}
