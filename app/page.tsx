'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const steps = [
  { number: '01', title: 'نشارك الأفكار', text: 'نستمع لبعضنا ونختار الأفكار التي تستحق أن تتحول إلى شيء حقيقي.' },
  { number: '02', title: 'نبني ونتعلّم', text: 'نقسّم العمل إلى مهام واضحة، ونتعاون على تطويرها واختبارها.' },
  { number: '03', title: 'ننمو معًا', text: 'نتبادل الخبرة ونحتفي بما ننجزه، ونتطلع إلى فرص النجاح كفريق.' },
];

const values = [
  { icon: '✳', title: 'فريق واحد', text: 'نتعاون ونتشارك المعرفة، فكل مهارة تضيف شيئًا للمشروع.' },
  { icon: '↗', title: 'تقدير للجهد', text: 'نؤمن أن تقدير المساهمة يكون بوضوح وعدل، بحسب الجهد والمهمة.' },
  { icon: '♡', title: 'بداية بسيطة', text: 'نتعلّم ونجرّب معًا، دون مدفوعات مسبقة أو تعقيدات في هذه المرحلة.' },
];

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (profile && !profile.onboarded) router.replace('/onboarding');
    else if (profile) router.replace('/workspace');
  }, [loading, user, profile, router]);

  if (!loading && user && !profile) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">جارٍ التحميل…</main>;
  }

  return (
    <main className="grid-bg min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label="TeamHub - الرئيسية" className="display text-xl font-extrabold tracking-tight text-[#352f28]">
          Team<span className="text-coral">Hub</span>
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-coral align-middle" />
        </Link>
        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex">
          <a className="transition hover:text-coral" href="#about">عن الفريق</a>
          <a className="transition hover:text-coral" href="#how">كيف نعمل</a>
          <a className="transition hover:text-coral" href="#join">هل يناسبك؟</a>
        </nav>
        <Link href="/login" className="rounded-xl border border-[#5b4631]/15 bg-white/70 px-4 py-2.5 text-sm font-bold text-[#51483d] transition hover:border-coral hover:text-coral">
          تسجيل الدخول
        </Link>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:px-12 lg:pb-32 lg:pt-20">
        <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-amberx/15 blur-[100px]" />
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-coral/20 bg-white/75 px-4 py-2 text-xs font-bold text-coral shadow-sm">
            <span className="h-2 w-2 rounded-full bg-coral" />
            مساحة فريق ساليكس
          </div>
          <h1 className="display max-w-2xl text-4xl font-extrabold leading-[1.45] tracking-tight text-[#352f28] sm:text-5xl lg:text-6xl">
            الأفكار تكبر
            <br />
            <span className="text-coral">حين نبنيها معًا.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-500 sm:text-lg sm:leading-9">
            أهلًا بك في TeamHub، مساحة فريق ساليكس للتعاون وبناء الأفكار وتطويرها واختبارها. نشارك ما نعرفه، نتعلّم من بعضنا، ونتقدم كفريق واحد.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="inline-flex items-center justify-center gap-3 rounded-xl bg-coral px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-coral/25 transition hover:-translate-y-0.5 hover:bg-[#824a30]">
              انضم إلينا وابدأ الآن
              <span aria-hidden="true">←</span>
            </Link>
            <a href="#about" className="inline-flex items-center justify-center rounded-xl border border-[#5b4631]/15 bg-white/65 px-6 py-3.5 text-sm font-bold text-[#51483d] transition hover:border-coral/50 hover:bg-white">
              تعرّف على الفريق
            </a>
          </div>
          <div className="mt-8 flex items-center gap-3 text-xs leading-6 text-slate-400">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9e1d5] text-coral">✳</span>
            مساحة للتعلّم والعمل المشترك — والبداية لا تحتاج إلى رأس مال.
          </div>
        </div>

        <div aria-label="نحوّل الفكرة إلى عمل جماعي" className="relative mx-auto w-full max-w-lg lg:mr-auto">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-coral/10 via-transparent to-amberx/20 blur-2xl" />
          <div className="glass coral-glow relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-[#5b4631]/10 pb-5">
              <div>
                <p className="text-xs font-semibold text-slate-400">مساحة العمل</p>
                <h2 className="display mt-1 text-lg font-bold text-[#352f28]">فكرة اليوم</h2>
              </div>
              <span className="rounded-full bg-emerald-100/70 px-3 py-1.5 text-[11px] font-bold text-emerald-700">نعمل عليها</span>
            </div>
            <div className="my-6 rounded-2xl bg-[#f5f0e8] p-5 sm:p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl text-coral shadow-sm">✦</div>
              <p className="display mt-5 text-xl font-bold leading-9 text-[#352f28]">من فكرة صغيرة، إلى مشروع يصنع فرقًا.</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">كل خطوة تبدأ بسؤال، وكل إجابة تقرّبنا من الحل.</p>
            </div>
            <div className="space-y-3">
              {[
                ['مشاركة الفكرة', 'نسمع ونخطط'],
                ['بناء النموذج', 'نجرب ونتعلم'],
                ['إطلاق المشروع', 'نكبر معًا'],
              ].map(([title, detail], index) => (
                <div key={title} className="flex items-center gap-4 rounded-xl border border-[#5b4631]/[.07] bg-white/65 px-4 py-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-coral text-white' : 'bg-[#eee8de] text-[#82786c]'}`}>{index + 1}</span>
                  <span className="flex-1 text-sm font-bold text-[#51483d]">{title}</span>
                  <span className="text-xs text-slate-400">{detail}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#5b4631]/10 pt-5">
              <span className="text-xs font-semibold text-slate-400">فريق ساليكس</span>
              <span className="text-sm font-bold text-coral">معًا نصنعها</span>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-3 hidden rounded-2xl border border-[#5b4631]/10 bg-white px-4 py-3 shadow-lg sm:block">
            <p className="text-xs font-bold text-[#51483d]">فكرة + فريق</p>
            <p className="mt-1 text-[11px] text-slate-400">بداية كل إنجاز</p>
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-8 border-y border-[#5b4631]/[.08] bg-white/55 px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-extrabold tracking-wide text-coral">من نحن؟</p>
            <h2 className="display mt-3 text-3xl font-extrabold leading-relaxed text-[#352f28] sm:text-4xl">فريق يجمعه الفضول والرغبة في الإنجاز</h2>
            <p className="mt-4 text-sm leading-8 text-slate-500 sm:text-base">
              نحن شركاء ومتعاونون، لكل منا فكرة أو مهارة. ندرس الأفكار ونبنيها ونختبرها ونسوّقها معًا، في بيئة تحترم مساهمة الجميع وتشجّع على التعلم والنمو.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {values.map((value) => (
              <article key={value.title} className="rise rounded-2xl border border-[#5b4631]/10 bg-white/80 p-6 sm:p-7">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4ece2] text-xl font-bold text-coral">{value.icon}</span>
                <h3 className="display mt-5 text-lg font-bold text-[#352f28]">{value.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">{value.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-8 mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-coral">كيف نعمل؟</p>
            <h2 className="display mt-3 text-3xl font-extrabold leading-relaxed text-[#352f28] sm:text-4xl">خطوات صغيرة، وإنجازات مشتركة.</h2>
            <p className="mt-4 text-sm leading-8 text-slate-500">
              لا نحتاج أن نعرف كل شيء من البداية. نبدأ بما لدينا، ونطوّر مهاراتنا ومشاريعنا خطوة بخطوة.
            </p>
          </div>
          <div className="space-y-3">
            {steps.map((step) => (
              <article key={step.number} className="flex gap-5 rounded-2xl border border-[#5b4631]/10 bg-white/70 p-5 sm:gap-7 sm:p-6">
                <span className="display pt-1 text-sm font-extrabold text-coral">{step.number}</span>
                <div>
                  <h3 className="display font-bold text-[#352f28]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-slate-500">{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="join" className="scroll-mt-8 px-5 pb-20 sm:px-8 sm:pb-24 lg:px-12">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] bg-[#352f28] px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -left-16 -top-32 h-72 w-72 rounded-full bg-coral/30 blur-[90px]" />
          <div className="pointer-events-none absolute -bottom-44 -right-10 h-80 w-80 rounded-full bg-amberx/20 blur-[100px]" />
          <div className="relative">
            <p className="text-xs font-bold text-[#dfb89b]">هل هذه المنصة تناسبك؟</p>
            <h2 className="display mx-auto mt-3 max-w-2xl text-3xl font-extrabold leading-relaxed text-white sm:text-4xl">لديك وقت أو خبرة أو فكرة؟ مكانك بيننا.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-white/70 sm:text-base">
              إذا كنت تتطلع للتعلّم والعمل الجماعي وتحويل الأفكار إلى واقع، شاركنا مهاراتك وانضم إلى فريقنا. نتعارف أولًا، ونكتشف معًا ما يمكننا صنعه.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-3 rounded-xl bg-coral px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#824a30]">
                انضم إلى الفريق <span aria-hidden="true">←</span>
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10">
                لدي حساب بالفعل
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#5b4631]/10 px-5 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-slate-400 sm:flex-row">
          <span className="display font-bold text-[#51483d]">Team<span className="text-coral">Hub</span> · فريق ساليكس</span>
          <span>نتعلّم، نبني، وننمو معًا.</span>
        </div>
      </footer>
    </main>
  );
}
