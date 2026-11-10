'use client';
import { useRef, useState } from 'react';

export default function VideoMessage({ src, filename }: { src: string; filename?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  function formatTime(value: number) {
    if (!Number.isFinite(value)) return '0:00';
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || failed) return;
    if (video.paused) {
      try {
        await video.play();
        setFailed(false);
      } catch {
        setFailed(true);
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  }

  const progress = duration ? current / duration : 0;

  return (
    <figure className="w-full max-w-sm">
      <div className="group relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-[#322b26] via-[#201d1a] to-[#49382e]">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          muted={muted}
          aria-label={filename ? `تشغيل الفيديو ${filename}` : 'تشغيل فيديو مرفق'}
          onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(0); }}
          onError={() => { setFailed(true); setPlaying(false); }}
          onClick={() => void togglePlayback()}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {!playing && !failed && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); void togglePlayback(); }}
            aria-label="تشغيل الفيديو"
            className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-xl text-white shadow-xl backdrop-blur-sm transition hover:scale-105 hover:bg-coral"
          >▶</button>
        )}
        {failed && <p role="status" className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-white">تعذر تشغيل هذا الفيديو</p>}
      </div>
      <div dir="ltr" className="flex items-center gap-2.5 px-1 py-2.5 text-[#51483d]">
        <button type="button" onClick={() => void togglePlayback()} disabled={failed} aria-label={playing ? 'إيقاف الفيديو' : 'تشغيل الفيديو'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition hover:bg-[#5b4631]/10 disabled:opacity-50">
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{formatTime(current)}</span>
        <button
          type="button"
          role="slider"
          aria-label="موضع الفيديو"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(current)}
          aria-valuetext={`${formatTime(current)} من ${formatTime(duration)}`}
          onClick={(event) => {
            const video = videoRef.current;
            if (!video || !duration) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            video.currentTime = ratio * duration;
            setCurrent(video.currentTime);
          }}
          className="group flex h-7 min-w-0 flex-1 items-center rounded-full"
        >
          <span className="relative block h-1 w-full overflow-hidden rounded-full bg-[#5b4631]/15">
            <span className="absolute inset-y-0 left-0 rounded-full bg-coral" style={{ width: `${progress * 100}%` }} />
          </span>
        </button>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{formatTime(duration)}</span>
        <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-[#51483d] transition hover:bg-[#5b4631]/10">
          {muted ? '◖×' : '◖'}
        </button>
      </div>
      {filename && <figcaption dir="auto" className="truncate px-1 text-xs text-slate-500">{filename}</figcaption>}
    </figure>
  );
}
