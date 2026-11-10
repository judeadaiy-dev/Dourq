'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthShell, Button, Input } from '@/components/ui/ui';

export default function SignupPage() {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); setInfo('');
    const f = new FormData(e.currentTarget);
    const { data, error } = await supabase.auth.signUp({
      email: String(f.get('email')).trim(), password: String(f.get('password')),
      options: { data: { display_name: String(f.get('name')).trim() } }
    });
    if (error) { setErr('تعذر إنشاء الحساب. تحقق من البيانات وحاول مجددًا.'); setBusy(false); return; }
    if (!data.session) { setInfo('تم إنشاء الحساب. تحقّق من بريدك الإلكتروني لتأكيده، ثم سجّل الدخول.'); setBusy(false); return; }
    router.replace('/onboarding');
  }
  return (
    <AuthShell eyebrow="انضم إلى الفريق" title="أنشئ حسابك">
      <form onSubmit={submit} className="mt-7">
        <label className="block text-sm font-semibold">الاسم<Input name="name" required placeholder="الاسم الكامل" /></label>
        <label className="mt-4 block text-sm font-semibold">البريد الإلكتروني<Input name="email" type="email" required placeholder="name@example.com" /></label>
        <label className="mt-4 block text-sm font-semibold">كلمة المرور<Input name="password" type="password" required minLength={6} placeholder="6 أحرف على الأقل" /></label>
        <p className="mt-3 min-h-[1.25rem] text-xs text-red-300">{err}<span className="text-emerald-300">{info}</span></p>
        <Button type="submit" disabled={busy} className="mt-2 w-full">{busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب ←'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">لديك حساب؟ <Link href="/login" className="font-semibold text-coral">سجّل الدخول</Link></p>
    </AuthShell>
  );
}
