'use client';
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [promptError, setPromptError] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => {
      setInstalled(displayMode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    updateInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    displayMode.addEventListener('change', updateInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      displayMode.removeEventListener('change', updateInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (outcome === 'accepted') setInstalled(true);
    } catch {
      setPromptError(true);
      setShowInstructions(true);
    }
  }

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void installApp()}
        className="flex shrink-0 items-center gap-2 rounded-xl border border-coral/25 bg-coral/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-coral/15"
      >
        <span aria-hidden="true">⬇</span>
        <span className="hidden sm:inline">تثبيت التطبيق</span>
        <span className="sm:hidden">تثبيت</span>
      </button>
      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#352f28]/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInstructions(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-app-title"
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#F8F6F1] p-6 text-slate-800 shadow-2xl"
          >
            <h2 id="install-app-title" className="display text-lg font-bold">تثبيت TeamHub</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {promptError && 'لم يفتح خيار التثبيت تلقائيًا. '}
              {/iphone|ipad|ipod/i.test(navigator.userAgent)
                ? 'من Safari، اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».'
                : 'افتح قائمة المتصفح (⋮ أو ⋯)، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'}
            </p>
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="mt-5 rounded-xl bg-coral px-4 py-2 text-sm font-semibold text-white"
            >
              حسنًا
            </button>
          </section>
        </div>
      )}
    </>
  );
}
