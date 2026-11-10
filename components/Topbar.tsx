'use client';
import { usePathname } from 'next/navigation';
import { usePresence } from '@/lib/presence';
import { Avatar } from '@/components/ui/ui';
import InstallAppButton from '@/components/InstallAppButton';
import NotificationCenter from '@/components/NotificationCenter';

const TITLES: Record<string, string> = { workspace: 'مساحة العمل', chat: 'المحادثة', tasks: 'المهام', people: 'الفريق', account: 'الحساب الشخصي' };

export default function Topbar() {
  const path = usePathname();
  const online = usePresence();
  const here = online.filter((o) => o.path === path);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#F8F6F1]/95 px-5 py-4 backdrop-blur-xl lg:px-8">
      <h2 className="display text-xl font-bold">{TITLES[path.split('/')[1]] ?? 'TeamHub'}</h2>
      <div className="flex items-center gap-3">
        <NotificationCenter />
        <InstallAppButton />
        <span className="hidden text-xs text-slate-500 sm:block">{here.length} يتصفحون الآن</span>
        <div className="flex -space-x-2">
          {here.slice(0, 5).map((o) => (
            <span key={o.id} title={o.name} className="rounded-full ring-2 ring-[#F8F6F1]"><Avatar name={o.name} url={o.avatar} size={30} /></span>
          ))}
          {here.length > 5 && <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/10 text-[10px] ring-2 ring-[#F8F6F1]">+{here.length - 5}</span>}
        </div>
      </div>
    </header>
  );
}
