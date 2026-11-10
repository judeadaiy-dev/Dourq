'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/ui/ui';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/workspace', label: 'مساحة العمل', icon: '◈' },
  { href: '/chat', label: 'المحادثة', icon: '✉' },
  { href: '/tasks', label: 'المهام', icon: '✦' },
  { href: '/people', label: 'الفريق', icon: '◉' },
  { href: '/account', label: 'الحساب', icon: '◎' }
];

export default function Sidebar() {
  const path = usePathname();
  const { profile, signOut } = useAuth();

  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-64 flex-col border-l border-white/10 bg-[#F8F6F1]/95 p-5 backdrop-blur-xl md:flex">
        <p className="display text-lg font-bold">Team<span className="text-coral">Hub</span> <i className="mr-1 inline-block h-2 w-2 rounded-full bg-coral shadow-[0_0_12px_#975B3B]" /></p>
        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition', path.startsWith(l.href) ? 'bg-coral/15 font-semibold text-amber-100 ring-1 ring-coral/30' : 'text-slate-400 hover:bg-white/5 hover:text-coral')}>
              <span className="text-coral">{l.icon}</span>{l.label}
            </Link>
          ))}
        </nav>
        <Link href="/account" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-coral/30 hover:bg-coral/5">
          <Avatar name={profile?.display_name} url={profile?.avatar_url} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{profile?.display_name}</span><span className="mt-1 block text-xs text-slate-500">الملف الشخصي والإعدادات</span></span>
          <span className="text-coral">←</span>
        </Link>
        <button type="button" onClick={() => void signOut()} className="mt-3 rounded-xl px-4 py-2 text-right text-xs text-slate-500 transition hover:bg-red-500/5 hover:text-red-500">تسجيل الخروج</button>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#F8F6F1]/95 backdrop-blur-xl md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={cn('flex flex-1 flex-col items-center gap-1 py-3 text-[11px]', path.startsWith(l.href) ? 'text-coral' : 'text-slate-500')}>
            <span className="text-base">{l.icon}</span>{l.label}
          </Link>
        ))}
        <button type="button" onClick={signOut} className="flex flex-1 flex-col items-center gap-1 py-3 text-[11px] text-slate-500">
          <span className="text-base">↪</span>خروج
        </button>
      </nav>
    </>
  );
}
