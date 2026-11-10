'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthShell, Button, Input } from '@/components/ui/ui';

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
    if (error) { setErr('تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.'); setBusy(false); } else router.replace('/');
  }
  return (
    <AuthShell eyebrow="مرحبًا بعودتك" title="سجّل الدخول إلى فريقك">
      <form onSubmit={submit} className="mt-7">
        <label className="block text-sm font-semibold">البريد الإلكتروني<Input name="email" type="email" required placeholder="name@example.com" /></label>
        <label className="mt-4 block text-sm font-semibold">كلمة المرور<Input name="password" type="password" required minLength={6} placeholder="••••••••" /></label>
        <p className="mt-3 min-h-[1.25rem] text-xs text-red-300">{err}</p>
        <Button type="submit" disabled={busy} className="mt-2 w-full">{busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول ←'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">مستخدم جديد؟ <Link href="/signup" className="font-semibold text-coral">أنشئ حسابًا</Link></p>
    </AuthShell>
  );
}
