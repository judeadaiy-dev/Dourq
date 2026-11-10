'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { AuthShell, Avatar, Button, Input, Textarea } from '@/components/ui/ui';
import { SPECIALTIES, Specialty } from '@/lib/types';
import { cn, fileExt, privateStoragePath } from '@/lib/utils';

export default function Onboarding() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [spec, setSpec] = useState<Specialty | null>(null);
  const [bio, setBio] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (profile?.onboarded) router.replace('/workspace');
  }, [loading, user, profile, router]);
  useEffect(() => { if (profile) { setName(profile.display_name); setSpec(profile.specialty); setBio(profile.bio ?? ''); } }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!spec) { setErr('اختر تخصصك.'); return; }
    setBusy(true); setErr('');
    let avatar_url = profile?.avatar_url ?? null;
    let uploadedAvatarPath: string | null = null;
    if (file) {
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setErr('يجب أن تكون الصورة أقل من 5 ميغابايت.'); setBusy(false); return; }
      const path = `${user.id}/avatar-${Date.now()}.${fileExt(file.name)}`;
      const up = await supabase.storage.from('th-avatars').upload(path, file, { contentType: file.type });
      if (up.error) { setErr('تعذر رفع الصورة. حاول مرة أخرى.'); setBusy(false); return; }
      avatar_url = path;
      uploadedAvatarPath = path;
    }
    const { error } = await supabase.from('th_profiles').update({ display_name: name.trim(), specialty: spec, bio: bio.trim() || null, avatar_url, onboarded: true }).eq('id', user.id);
    if (error) {
      if (uploadedAvatarPath) await supabase.storage.from('th-avatars').remove([uploadedAvatarPath]);
      setErr('تعذر حفظ الملف الشخصي. حاول مرة أخرى.'); setBusy(false); return;
    }
    const previousAvatarPath = privateStoragePath(profile?.avatar_url, 'th-avatars');
    if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath) await supabase.storage.from('th-avatars').remove([previousAvatarPath]);
    await refreshProfile(); router.replace('/workspace');
  }

  return (
    <AuthShell eyebrow="الخطوة الأخيرة" title="عرّف الفريق بنفسك">
      <form onSubmit={save} className="mt-7">
        <div className="flex items-center gap-4">
          <Avatar name={name} url={file ? URL.createObjectURL(file) : profile?.avatar_url} size={64} />
          <label className="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:border-coral/50">أضف صورة
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="mt-5 block text-sm font-semibold">الاسم الظاهر<Input value={name} required onChange={(e) => setName(e.target.value)} /></label>
        <p className="mt-5 text-sm font-semibold">التخصص</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPECIALTIES.map((s) => (
            <button type="button" key={s.id} onClick={() => setSpec(s.id)} className={cn('rounded-xl border px-3.5 py-2 text-xs font-semibold transition', spec === s.id ? 'border-coral/50 bg-coral/15 text-amber-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25')}>{s.label}</button>
          ))}
        </div>
        <label className="mt-5 block text-sm font-semibold">نبذة قصيرة<Textarea rows={3} dir="auto" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="ما الذي تعمل على بنائه؟" /></label>
        <p className="mt-3 min-h-[1.25rem] text-xs text-red-300">{err}</p>
        <Button type="submit" disabled={busy} className="mt-2 w-full">{busy ? 'جارٍ الحفظ…' : 'ادخل إلى مساحة العمل ←'}</Button>
      </form>
    </AuthShell>
  );
}
