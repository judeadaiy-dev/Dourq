import { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes, useEffect, useState } from 'react';
import { cn, initials, privateStoragePath } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-3xl', className)} {...p} />;
}
export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  return (
    <button
      className={cn(
        'rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60',
        variant === 'primary'
          ? 'bg-coral text-white shadow-lg shadow-coral/25 hover:bg-[#824a30]'
          : 'border border-white/15 bg-white/5 hover:border-coral/50 hover:bg-coral/10',
        className
      )}
      {...p}
    />
  );
}
const field = 'mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-coral';
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(field, className)} {...p} />; }
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(field, 'resize-none', className)} {...p} />; }
export function Badge({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('rounded-full bg-coral/15 px-3 py-1 text-[10px] font-semibold text-amber-100', className)} {...p} />;
}
export function Avatar({ name, url, size = 36 }: { name?: string | null; url?: string | null; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const s = { width: size, height: size };
  useEffect(() => {
    let active = true;
    const path = privateStoragePath(url, 'th-avatars');
    if (!url || !path) { setSrc(url ?? null); return () => { active = false; }; }
    if (/^(blob:|data:)/i.test(url)) { setSrc(url); return () => { active = false; }; }
    supabase.storage.from('th-avatars').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active) setSrc(error ? null : data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [url]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name || 'صورة المستخدم'} style={s} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span style={{ ...s, fontSize: size * 0.38 }} className="display flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral to-amberx font-bold text-white">
      {initials(name)}
    </span>
  );
}
export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-bold text-coral">{children}</p>
);
export function AuthShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <main className="grid-bg relative flex min-h-screen items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[30rem] w-[40rem] -translate-x-1/2 rounded-full bg-amberx/10 blur-[140px]" />
      <Card className="coral-glow relative w-full max-w-md p-7 sm:p-9">
        <p className="display text-lg font-bold">Team<span className="text-coral">Hub</span> <i className="mr-1 inline-block h-2 w-2 rounded-full bg-coral shadow-[0_0_12px_#975B3B]" /></p>
        <div className="mt-7"><Eyebrow>{eyebrow}</Eyebrow><h1 className="display mt-3 text-3xl font-bold">{title}</h1></div>
        {children}
      </Card>
    </main>
  );
}
