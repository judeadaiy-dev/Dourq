'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, Card, Eyebrow, Input, Textarea } from '@/components/ui/ui';
import { SPECIALTIES, Specialty } from '@/lib/types';
import { fileExt, privateStoragePath } from '@/lib/utils';

const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-coral';

export default function AccountPage() {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | ''>('');
  const [experienceYears, setExperienceYears] = useState('');
  const [bio, setBio] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [removeResume, setRemoveResume] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [securityStatus, setSecurityStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!profile || !user) return;
    setName(profile.display_name ?? '');
    setJobTitle(profile.job_title ?? '');
    setSpecialty(profile.specialty ?? '');
    setExperienceYears(profile.experience_years == null ? '' : String(profile.experience_years));
    setBio(profile.bio ?? '');
    setLinkedin(profile.linkedin_url ?? '');
    setGithub(profile.github_url ?? '');
    setEmail(user.email ?? '');
  }, [profile, user]);

  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(null); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    let active = true;
    const path = profile?.resume_path;
    setResumeUrl(null);
    if (!path) return () => { active = false; };
    supabase.storage.from('th-resumes').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setStatus({ kind: 'error', text: 'تعذر فتح السيرة الذاتية. تحقق من تشغيل مخطط قاعدة البيانات المحدّث.' });
        return;
      }
      setResumeUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [profile?.resume_path]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !profile) return;
    const trimmedName = name.trim();
    const years = experienceYears === '' ? null : Number(experienceYears);
    if (!trimmedName) { setStatus({ kind: 'error', text: 'أدخل اسمك الكامل.' }); return; }
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) {
      setStatus({ kind: 'error', text: 'أدخل سنوات خبرة بين 0 و60.' });
      return;
    }
    if (avatarFile && (!/^image\/(jpeg|png|webp|gif)$/.test(avatarFile.type) || avatarFile.size > 5 * 1024 * 1024)) {
      setStatus({ kind: 'error', text: 'اختر صورة JPG أو PNG أو WEBP أو GIF لا يتجاوز حجمها 5 ميغابايت.' });
      return;
    }
    if (resumeFile && (resumeFile.type !== 'application/pdf' || resumeFile.size > 10 * 1024 * 1024)) {
      setStatus({ kind: 'error', text: 'السيرة الذاتية يجب أن تكون PDF وألا يتجاوز حجمها 10 ميغابايت.' });
      return;
    }

    setBusy(true);
    setStatus(null);
    const uploaded: { bucket: string; path: string }[] = [];
    let avatarPath = profile.avatar_url;
    let resumePath = removeResume ? null : profile.resume_path ?? null;

    if (avatarFile) {
      avatarPath = `${user.id}/avatar-${crypto.randomUUID()}.${fileExt(avatarFile.name)}`;
      const { error } = await supabase.storage.from('th-avatars').upload(avatarPath, avatarFile, { contentType: avatarFile.type });
      if (error) {
        setStatus({ kind: 'error', text: `تعذر رفع الصورة: ${error.message}` });
        setBusy(false);
        return;
      }
      uploaded.push({ bucket: 'th-avatars', path: avatarPath });
    }
    if (resumeFile) {
      resumePath = `${user.id}/resume-${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from('th-resumes').upload(resumePath, resumeFile, { contentType: 'application/pdf' });
      if (error) {
        await Promise.all(uploaded.map((item) => supabase.storage.from(item.bucket).remove([item.path])));
        setStatus({ kind: 'error', text: `تعذر رفع السيرة الذاتية: ${error.message}. تأكد من تشغيل مخطط قاعدة البيانات المحدّث.` });
        setBusy(false);
        return;
      }
      uploaded.push({ bucket: 'th-resumes', path: resumePath });
    }

    const { error } = await supabase.from('th_profiles').update({
      display_name: trimmedName,
      job_title: jobTitle.trim() || null,
      specialty: specialty || null,
      experience_years: years,
      bio: bio.trim() || null,
      linkedin_url: linkedin.trim() || null,
      github_url: github.trim() || null,
      avatar_url: avatarPath,
      resume_path: resumePath
    }).eq('id', user.id);
    if (error) {
      await Promise.all(uploaded.map((item) => supabase.storage.from(item.bucket).remove([item.path])));
      const needsSchema = ['42703', 'PGRST204', 'PGRST202'].includes(error.code ?? '');
      setStatus({
        kind: 'error',
        text: needsSchema
          ? 'قاعدة البيانات لا تحتوي حقول الملف الشخصي الجديدة. شغّل supabase/schema.sql كاملاً من لوحة Supabase ثم أعد المحاولة.'
          : `تعذر حفظ الملف الشخصي: ${error.message}`
      });
      setBusy(false);
      return;
    }

    const oldAssets = [
      avatarFile && privateStoragePath(profile.avatar_url, 'th-avatars') ? { bucket: 'th-avatars', path: privateStoragePath(profile.avatar_url, 'th-avatars')! } : null,
      (removeResume || resumeFile) && profile.resume_path ? { bucket: 'th-resumes', path: profile.resume_path } : null
    ].filter((item): item is { bucket: string; path: string } => !!item);
    const cleanup = await Promise.all(oldAssets.map((item) => supabase.storage.from(item.bucket).remove([item.path])));
    await refreshProfile();
    setAvatarFile(null);
    setResumeFile(null);
    setRemoveResume(false);
    setBusy(false);
    setStatus(cleanup.some((result) => result.error)
      ? { kind: 'success', text: 'تم حفظ الملف الشخصي، لكن تعذر حذف أحد الملفات القديمة.' }
      : { kind: 'success', text: 'تم تحديث ملفك الشخصي بنجاح.' });
  }

  async function updateEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || email.trim() === user?.email) return;
    setEmailBusy(true);
    setSecurityStatus(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setEmailBusy(false);
    setSecurityStatus(error
      ? { kind: 'error', text: `تعذر تغيير البريد الإلكتروني: ${error.message}` }
      : { kind: 'success', text: 'أرسلنا رسالة تأكيد إلى البريد الجديد. سيُعتمد بعد تأكيده.' });
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setSecurityStatus({ kind: 'error', text: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityStatus({ kind: 'error', text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }
    setPasswordBusy(true);
    setSecurityStatus(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      setSecurityStatus({ kind: 'error', text: `تعذر تغيير كلمة المرور: ${error.message}` });
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setSecurityStatus({ kind: 'success', text: 'تم تحديث كلمة المرور.' });
  }

  async function logout() {
    await signOut();
    router.replace('/login');
  }

  if (loading || !user || !profile) {
    return <main className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">جارٍ تحميل الحساب…</main>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Eyebrow>حسابك الشخصي</Eyebrow>
      <h1 className="display mt-3 text-4xl font-bold sm:text-5xl">ملفك المهني.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">حدّث بياناتك وخبراتك حتى يعرف الفريق من أنت وما الذي تتقنه.</p>

      <form onSubmit={saveProfile} className="mt-8 space-y-6">
        <Card className="p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={name} url={avatarPreview ?? profile.avatar_url} size={80} />
            <div>
              <h2 className="display text-xl font-bold">صورتك الشخصية</h2>
              <p className="mt-1 text-xs text-slate-500">JPG أو PNG أو WEBP، بحد أقصى 5 ميغابايت.</p>
              <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:border-coral/50">
                اختيار صورة
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
              </label>
              {avatarFile && <p className="mt-2 text-xs text-slate-500">{avatarFile.name}</p>}
            </div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold">الاسم الكامل
              <Input value={name} required maxLength={100} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="text-sm font-semibold">المسمى الوظيفي
              <Input value={jobTitle} maxLength={100} onChange={(event) => setJobTitle(event.target.value)} placeholder="مثال: مطور واجهات" />
            </label>
            <label className="text-sm font-semibold">التخصص
              <select value={specialty} onChange={(event) => setSpecialty(event.target.value as Specialty | '')} className={inputClass}>
                <option value="">اختر التخصص</option>
                {SPECIALTIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">سنوات الخبرة
              <Input type="number" min={0} max={60} step={1} value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} placeholder="مثال: 3" />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">نبذة عنك
              <Textarea rows={4} maxLength={500} dir="auto" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="خبراتك واهتماماتك وما تحب العمل عليه…" />
              <span className="mt-1 block text-left text-[11px] font-normal text-slate-500">{bio.length}/500</span>
            </label>
            <label className="text-sm font-semibold">LinkedIn
              <Input type="url" dir="ltr" value={linkedin} onChange={(event) => setLinkedin(event.target.value)} placeholder="https://linkedin.com/in/username" />
            </label>
            <label className="text-sm font-semibold">GitHub
              <Input type="url" dir="ltr" value={github} onChange={(event) => setGithub(event.target.value)} placeholder="https://github.com/username" />
            </label>
          </div>
        </Card>

        <Card className="p-5 sm:p-8">
          <h2 className="display text-xl font-bold">السيرة الذاتية</h2>
          <p className="mt-1 text-xs text-slate-500">ارفع ملف PDF ليتمكن أعضاء الفريق من الاطلاع عليه وتنزيله.</p>
          {resumeUrl && !removeResume && !resumeFile && (
            <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm font-semibold text-coral">
              📄 عرض السيرة الذاتية الحالية
            </a>
          )}
          {resumeFile && <p className="mt-4 text-sm text-slate-500">الملف الجديد: {resumeFile.name}</p>}
          {removeResume && !resumeFile && <p className="mt-4 text-sm text-slate-500">ستُحذف السيرة الذاتية الحالية عند حفظ التغييرات.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:border-coral/50">
              {profile.resume_path && !removeResume ? 'استبدال الملف' : 'اختيار ملف PDF'}
              <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && (selected.type !== 'application/pdf' || selected.size > 10 * 1024 * 1024)) {
                  setStatus({ kind: 'error', text: 'اختر ملف PDF لا يتجاوز حجمه 10 ميغابايت.' });
                  event.target.value = '';
                  return;
                }
                setResumeFile(selected);
                if (selected) setRemoveResume(false);
                event.target.value = '';
              }} />
            </label>
            {profile.resume_path && !removeResume && <button type="button" onClick={() => { setResumeFile(null); setRemoveResume(true); }} className="rounded-xl px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-500/5">إزالة السيرة الذاتية</button>}
            {(resumeFile || removeResume) && <button type="button" onClick={() => { setResumeFile(null); setRemoveResume(false); }} className="rounded-xl px-4 py-2.5 text-sm text-slate-500 transition hover:bg-white/5">تراجع</button>}
          </div>
        </Card>

        {status && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${status.kind === 'error' ? 'bg-red-500/5 text-red-500' : 'bg-emerald-500/5 text-emerald-700'}`}>{status.text}</p>}
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? 'جارٍ حفظ التغييرات…' : 'حفظ الملف الشخصي'}</Button>
      </form>

      <section className="mt-12">
        <Eyebrow>الأمان والدخول</Eyebrow>
        <h2 className="display mt-2 text-2xl font-bold">إعدادات الحساب</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h3 className="font-bold">البريد الإلكتروني</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">يتطلب تغيير البريد تأكيده من الرسالة التي ستصل إلى عنوانك الجديد.</p>
            <form onSubmit={(event) => void updateEmail(event)} className="mt-4">
              <label className="text-sm font-semibold">البريد الإلكتروني
                <Input type="email" dir="ltr" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <Button type="submit" disabled={emailBusy || email.trim() === user.email} variant="ghost" className="mt-4">{emailBusy ? 'جارٍ الإرسال…' : 'تحديث البريد'}</Button>
            </form>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="font-bold">كلمة المرور</h3>
            <form onSubmit={(event) => void updatePassword(event)} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">كلمة المرور الجديدة
                <Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <label className="block text-sm font-semibold">تأكيد كلمة المرور
                <Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              <Button type="submit" disabled={passwordBusy || !newPassword || !confirmPassword} variant="ghost">{passwordBusy ? 'جارٍ التحديث…' : 'تغيير كلمة المرور'}</Button>
            </form>
          </Card>
        </div>
        {securityStatus && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${securityStatus.kind === 'error' ? 'bg-red-500/5 text-red-500' : 'bg-emerald-500/5 text-emerald-700'}`}>{securityStatus.text}</p>}
        <Card className="mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-bold">تسجيل الخروج</h3><p className="mt-1 text-xs text-slate-500">إنهاء الجلسة على هذا الجهاز.</p></div>
          <Button type="button" variant="ghost" onClick={() => void logout()} className="border-red-500/20 text-red-500 hover:border-red-500/40 hover:bg-red-500/5">تسجيل الخروج</Button>
        </Card>
      </section>
    </div>
  );
}
