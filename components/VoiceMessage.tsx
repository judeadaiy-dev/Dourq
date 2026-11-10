'use client';
import { useEffect, useRef, useState } from 'react';

export default function VoiceMessage({ src, waveform }: { src: string; waveform?: number[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const progress = duration ? current / duration : 0;

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;
    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => setCurrent(audio.currentTime);
    const onPlay = () => { setPlaying(true); setFailed(false); };
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrent(0); };
    const onError = () => { setFailed(true); setPlaying(false); };
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [src]);

  function formatTime(value: number) {
    if (!Number.isFinite(value)) return '0:00';
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
        setFailed(true);
      }
    } else {
      audio.pause();
    }
  }

  function seekTo(time: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(duration, time));
    setCurrent(audio.currentTime);
  }

  return (
    <div dir="ltr" className="flex w-full max-w-[18rem] items-center gap-3 rounded-xl px-1 py-1">
      <button
        type="button"
        onClick={() => void togglePlayback()}
        aria-label={playing ? 'إيقاف الرسالة الصوتية' : 'تشغيل الرسالة الصوتية'}
        disabled={failed}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-sm text-white shadow-md shadow-coral/20 transition hover:bg-[#824a30] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          role="slider"
          aria-label="موضع الرسالة الصوتية"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(current)}
          aria-valuetext={`${formatTime(current)} من ${formatTime(duration)}`}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            seekTo(ratio * duration);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); seekTo(current + 5); }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); seekTo(current - 5); }
            if (event.key === 'Home') { event.preventDefault(); seekTo(0); }
            if (event.key === 'End') { event.preventDefault(); seekTo(duration); }
          }}
          className="group flex h-7 w-full items-center rounded-full focus-visible:outline-coral"
        >
          <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <span className="absolute inset-y-0 left-0 rounded-full bg-coral transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            {waveform?.length ? (
              <span className="absolute inset-0 flex items-center justify-between gap-px px-1 opacity-40">
                {waveform.slice(0, 40).map((level, index) => <i key={index} className="w-0.5 rounded-full bg-[#754b34]" style={{ height: `${Math.max(20, Math.min(100, level))}%` }} />)}
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex justify-between text-[10px] leading-3 tabular-nums text-slate-500">
          <span>{formatTime(current)}</span>
          <span>{failed ? <span className="text-red-500">تعذر تشغيل الصوت</span> : formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
