'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Card } from '@/components/ui/ui';
import { cn, fileExt, privateStoragePath } from '@/lib/utils';
import VoiceMessage from '@/components/VoiceMessage';
import VideoMessage from '@/components/VideoMessage';
import MentionTextarea from '@/components/MentionTextarea';
import type { ChatChannel, Message, MessageReaction, Profile } from '@/lib/types';

function isVoiceMessage(message: Message) {
  return message.attachment_type?.startsWith('audio/')
    || Boolean(message.waveform?.length)
    || message.attachment_name?.startsWith('رسالة-صوتية.') === true;
}

export default function ChatPage() {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [newChannelName, setNewChannelName] = useState('');
  const [channelError, setChannelError] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<number, string>>(new Map());
  const [recording, setRecording] = useState(false);
  const [reactions, setReactions] = useState<Map<number, MessageReaction[]>>(new Map());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionMenuId, setReactionMenuId] = useState<number | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [pinningMessageId, setPinningMessageId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [status, setStatus] = useState('متصل');
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>('default');
  const peopleRef = useRef(people); peopleRef.current = people;
  const activeChannelRef = useRef(activeChannel); activeChannelRef.current = activeChannel;
  const endRef = useRef<HTMLDivElement>(null);
  const meRef = useRef(profile?.id); meRef.current = profile?.id;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const cancelRecordingRef = useRef(false);
  const waveformRef = useRef<number[]>([]);
  const frequencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);

  useEffect(() => {
    if (!imagePreview) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setImagePreview(null); setImageZoom(1); }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [imagePreview]);

  useEffect(() => {
    if (!channels.length) return;
    const requestedChannel = new URLSearchParams(window.location.search).get('channel');
    if (requestedChannel && channels.some((channel) => channel.id === requestedChannel)) setActiveChannel(requestedChannel);
  }, [channels]);

  async function resolveMedia(message: Message) {
    const path = message.attachment_path || privateStoragePath(message.image_url, 'th-chat');
    if (!path) return null;
    const { data } = await supabase.storage.from('th-chat').createSignedUrl(path, 3600);
    return data?.signedUrl ? [message.id, data.signedUrl] as const : null;
  }

  useEffect(() => { setNotif(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from('th_profiles').select('*'),
        supabase.from('th_channels').select('*').order('created_at', { ascending: true })
      ]);
      if (!alive) return;
      setPeople(new Map(((p.data ?? []) as Profile[]).map((x) => [x.id, x])));
      if (c.data) setChannels(c.data as ChatChannel[]);
      if (c.error) setStatus('تعذر تحميل القنوات. شغّل مخطط قاعدة البيانات المحدّث.');
    })();
    const ch = supabase.channel('chat-room');
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_messages' }, async (pl) => {
      if (pl.eventType === 'DELETE') {
        const id = (pl.old as { id: number }).id;
        setMsgs((prev) => prev.filter((message) => message.id !== id));
        setMediaUrls((prev) => { const next = new Map(prev); next.delete(id); return next; });
        setReactions((prev) => { const next = new Map(prev); next.delete(id); return next; });
        return;
      }
      if (pl.eventType === 'INSERT') {
        const m = pl.new as Message;
        if (!peopleRef.current.has(m.user_id)) {
          const { data } = await supabase.from('th_profiles').select('*').eq('id', m.user_id).maybeSingle();
          if (data) setPeople((prev) => new Map(prev).set(m.user_id, data as Profile));
        }
        if ((m.channel_id ?? 'general') === activeChannelRef.current) {
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        const media = await resolveMedia(m);
        if (media) setMediaUrls((prev) => new Map(prev).set(media[0], media[1]));
        if (m.user_id !== meRef.current && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = peopleRef.current.get(m.user_id)?.display_name ?? 'TeamHub';
          new Notification(n, { body: m.content || m.attachment_name || 'أرسل مرفقًا' });
        }
      }
      if (pl.eventType === 'UPDATE') {
        const updated = pl.new as Message;
        setMsgs((prev) => prev.map((message) => message.id === updated.id ? { ...message, pinned: updated.pinned } : message));
      }
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_message_reactions' }, (pl) => {
      const reaction = (pl.eventType === 'DELETE' ? pl.old : pl.new) as MessageReaction;
      if (pl.eventType === 'DELETE') {
        setReactions((prev) => {
          const next = new Map(prev);
          next.set(reaction.message_id, (next.get(reaction.message_id) ?? []).filter((item) => item.user_id !== reaction.user_id));
          return next;
        });
      } else if (pl.eventType === 'INSERT') {
        setReactions((prev) => {
          const next = new Map(prev);
          const list = next.get(reaction.message_id) ?? [];
          next.set(reaction.message_id, [...list.filter((item) => item.user_id !== reaction.user_id), reaction]);
          return next;
        });
      }
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_channels' }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const updated = payload.new as ChatChannel;
        setChannels((current) => [...current.filter((item) => item.id !== updated.id), updated].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }
    });
    ch.subscribe();
    return () => {
      alive = false;
      cancelRecordingRef.current = true;
      recorderRef.current?.stop();
      if (frequencyTimerRef.current) clearInterval(frequencyTimerRef.current);
      void audioContextRef.current?.close();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setMsgs([]);
    (async () => {
      const { data, error } = await supabase.from('th_messages').select('*').eq('channel_id', activeChannel).order('created_at', { ascending: false }).limit(100);
      if (!active) return;
      if (error) { setStatus('تعذر تحميل رسائل القناة. تحقق من تحديث قاعدة البيانات.'); setMsgs([]); return; }
      const loaded = ((data ?? []) as Message[]).reverse();
      setMsgs((current) => {
        const currentChannelMessages = current.filter((message) => (message.channel_id ?? 'general') === activeChannel);
        const combined = new Map(loaded.map((message) => [message.id, message]));
        for (const message of currentChannelMessages) combined.set(message.id, message);
        return [...combined.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      const [reactionResult, urls] = await Promise.all([
        loaded.length
          ? supabase.from('th_message_reactions').select('*').in('message_id', loaded.map((message) => message.id))
          : Promise.resolve({ data: [], error: null }),
        Promise.all(loaded.map(resolveMedia))
      ]);
      if (!active) return;
      if (reactionResult.error) setStatus('تعذر تحميل تفاعلات الرسائل.');
      else if (reactionResult.data) {
        setReactions(reactionResult.data.reduce((grouped, reaction) => {
          const list = grouped.get(reaction.message_id) ?? [];
          grouped.set(reaction.message_id, [...list, reaction as MessageReaction]);
          return grouped;
        }, new Map<number, MessageReaction[]>()));
      }
      setMediaUrls((previous) => {
        const next = new Map(previous);
        for (const message of loaded) next.delete(message.id);
        for (const entry of urls) if (entry) next.set(entry[0], entry[1]);
        return next;
      });
    })();
    return () => { active = false; };
  }, [activeChannel]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  async function sendMessage(content: string, attachment: File | null, waveform: number[] = [], replyToId = replyTo?.id ?? null, mentionedUserIds: string[] = []) {
    if (!profile || (!content.trim() && !attachment)) return;
    setStatus(attachment ? 'جارٍ رفع المرفق…' : 'جارٍ الإرسال…');
    let path: string | null = null;
    if (attachment) {
      const mime = getAttachmentMime(attachment);
      if (attachment.size > 100 * 1024 * 1024 || !isAllowedAttachment(mime, attachment.name)) {
        setStatus('نوع الملف غير مدعوم أو يتجاوز حجمه 100 ميغابايت.');
        return;
      }
      path = `${profile.id}/${crypto.randomUUID()}.${fileExt(attachment.name)}`;
      const up = await supabase.storage.from('th-chat').upload(path, attachment, { contentType: mime });
      if (up.error) {
        const detail = `${up.error.message} ${(up.error as unknown as { statusCode?: string }).statusCode ?? ''}`.toLowerCase();
        setStatus(/bucket|mime|not found|415/.test(detail)
          ? 'قاعدة البيانات الحالية لا تدعم هذا المرفق. شغّل ملف supabase/schema.sql المحدّث.'
          : `تعذر رفع المرفق (${(up.error as unknown as { statusCode?: string }).statusCode ?? 'خطأ'}).`);
        return;
      }
    }
    const payload: Record<string, unknown> = attachment ? {
      content: content.trim() || null,
      attachment_path: path,
      attachment_name: attachment.name,
      attachment_type: getAttachmentMime(attachment),
      waveform
    } : { content: content.trim() };
    payload.channel_id = activeChannel;
    payload.mentions = mentionedUserIds;
    if (replyToId) payload.reply_to_id = replyToId;
    const { data, error } = await supabase.from('th_messages').insert(payload).select('*').single();
    if (error) {
      if (path) await supabase.storage.from('th-chat').remove([path]);
      const code = (error as { code?: string }).code;
      setStatus(code === '42703' || code === 'PGRST204' || code === 'PGRST202'
        ? 'مخطط قاعدة البيانات قديم. شغّل أحدث ملف supabase/schema.sql.'
        : code === '42501'
          ? 'لا تسمح صلاحيات العضوية بإرسال الرسالة. تحقق من موافقة مالك المساحة.'
          : `تعذر إرسال الرسالة (${code ?? 'خطأ'}).`);
      return;
    }
    const message = data as Message;
    setMsgs((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, message]);
    const media = await resolveMedia(message);
    if (media) setMediaUrls((prev) => new Map(prev).set(media[0], media[1]));
    setText(''); setMentionIds([]); setFile(null); setReplyTo(null); setStatus('تم الإرسال');
  }

  async function send(e: React.FormEvent) { e.preventDefault(); await sendMessage(text, file, [], replyTo?.id ?? null, mentionIds); }

  async function createChannel(event: React.FormEvent) {
    event.preventDefault();
    const name = newChannelName.trim();
    if (!profile?.is_owner || !name) return;
    if (name.length > 60) { setChannelError('اسم القناة يجب ألا يتجاوز 60 حرفًا.'); return; }
    const id = `channel-${crypto.randomUUID().slice(0, 12)}`;
    const { data, error } = await supabase.from('th_channels').insert({ id, name, description: null }).select('*').single();
    if (error) { setChannelError(`تعذر إنشاء القناة: ${error.message}`); return; }
    setChannels((current) => [...current, data as ChatChannel]);
    setActiveChannel(id);
    setNewChannelName('');
    setChannelError('');
  }

  const VIDEO_MIME_BY_EXT: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    ogv: 'video/ogg', ogg: 'video/ogg', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    wmv: 'video/x-ms-wmv', flv: 'video/x-flv', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    mpeg: 'video/mpeg', mpg: 'video/mpeg', ts: 'video/mp2t', mts: 'video/mp2t'
  };

  function getAttachmentMime(attachment: File) {
    const type = attachment.type.split(';')[0].toLowerCase();
    const extension = fileExt(attachment.name);
    if (type.startsWith('audio/') || type.startsWith('image/')) return type;
    return VIDEO_MIME_BY_EXT[extension] ?? type;
  }

  function isAllowedAttachment(type: string, name = '') {
    const extension = fileExt(name);
    return type.startsWith('video/') || !!VIDEO_MIME_BY_EXT[extension] || /^(image\/(jpeg|png|webp|gif)|audio\/(webm|ogg|mp4|mpeg|wav|x-wav)|application\/(pdf|zip|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|text\/plain)$/.test(type);
  }

  function pick(f?: File) {
    if (!f) return;
    if (!isAllowedAttachment(getAttachmentMime(f), f.name)) return setStatus('اختر صورة أو صوتًا أو فيديو أو PDF أو مستندًا نصيًا.');
    if (f.size > 100 * 1024 * 1024) return setStatus('يجب ألا يتجاوز حجم الملف 100 ميغابايت.');
    setFile(f); setStatus('المرفق جاهز للإرسال');
  }

  async function toggleRecording() {
    if (recorderRef.current?.state === 'recording') { recorderRef.current.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      waveformRef.current = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      cancelRecordingRef.current = false;
      frequencyTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(frequencies);
        const levels = Array.from(frequencies.slice(0, 40), (value) => Math.round((value / 255) * 100));
        setAudioLevels(levels);
        waveformRef.current.push(Math.round(levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length)));
      }, 100);
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (frequencyTimerRef.current) clearInterval(frequencyTimerRef.current);
        frequencyTimerRef.current = null;
        void audioContext.close();
        audioContextRef.current = null;
        recordingStreamRef.current = null;
        recorderRef.current = null;
        if (cancelRecordingRef.current) return;
        setRecording(false);
        setAudioLevels([]);
        const type = recorder.mimeType.split(';')[0] || 'audio/webm';
        const extension = type === 'audio/mp4' ? 'mp4' : type === 'audio/ogg' ? 'ogg' : 'webm';
        const samples = waveformRef.current;
        const bucketSize = Math.max(1, Math.ceil(samples.length / 80));
        const waveform = Array.from({ length: Math.min(80, Math.ceil(samples.length / bucketSize)) }, (_, index) => {
          const bucket = samples.slice(index * bucketSize, (index + 1) * bucketSize);
          return Math.round(bucket.reduce((sum, value) => sum + value, 0) / Math.max(1, bucket.length));
        });
        void sendMessage('', new File(chunks, `رسالة-صوتية.${extension}`, { type }), waveform);
      };
      recorder.onerror = () => { setStatus('تعذر تسجيل الصوت. حاول مرة أخرى.'); };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus('جارٍ تسجيل رسالة صوتية…');
    } catch {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (frequencyTimerRef.current) clearInterval(frequencyTimerRef.current);
      frequencyTimerRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      setRecording(false);
      setAudioLevels([]);
      setStatus('تعذر الوصول إلى الميكروفون. تحقق من صلاحيات المتصفح.');
    }
  }

  async function deleteMessage(message: Message) {
    if (deletingMessageId !== null) return;
    setDeletingMessageId(message.id);
    const { error } = await supabase.from('th_messages').delete().eq('id', message.id);
    if (error) { setStatus('لا تملك صلاحية حذف هذه الرسالة.'); setDeletingMessageId(null); return; }
    const path = message.attachment_path || privateStoragePath(message.image_url, 'th-chat');
    if (path) await supabase.storage.from('th-chat').remove([path]);
    setMsgs((prev) => prev.filter((item) => item.id !== message.id));
    setMediaUrls((prev) => { const next = new Map(prev); next.delete(message.id); return next; });
    setDeletingMessageId(null);
    setMessageToDelete(null);
    setStatus('تم حذف الرسالة');
  }

  async function togglePin(message: Message) {
    if (!profile?.is_owner || pinningMessageId !== null) return;
    setPinningMessageId(message.id);
    const { data, error } = await supabase.rpc('th_toggle_message_pin', { p_message_id: message.id });
    if (error) setStatus('تعذر تثبيت الرسالة. حدّث مخطط قاعدة البيانات.');
    else setMsgs((prev) => prev.map((item) => item.id === message.id ? { ...item, pinned: !!data } : item));
    setPinningMessageId(null);
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!profile) return;
    const mine = (reactions.get(message.id) ?? []).find((reaction) => reaction.user_id === profile.id);
    if (mine?.emoji === emoji) {
      const { error } = await supabase.from('th_message_reactions').delete().eq('message_id', message.id).eq('user_id', profile.id);
      if (error) { setStatus('التفاعلات غير مهيأة. شغّل مخطط قاعدة البيانات المحدّث.'); return; }
    } else {
      if (mine) {
        const { error } = await supabase.from('th_message_reactions').delete().eq('message_id', message.id).eq('user_id', profile.id);
        if (error) { setStatus('تعذر تغيير التفاعل.'); return; }
      }
      const { error } = await supabase.from('th_message_reactions').insert({ message_id: message.id, user_id: profile.id, emoji });
      if (error) { setStatus('التفاعلات غير مهيأة. شغّل مخطط قاعدة البيانات المحدّث.'); return; }
    }
    setReactionMenuId(null);
  }

  const deletingMessage = messageToDelete !== null && deletingMessageId === messageToDelete.id;
  const deletingVoiceMessage = messageToDelete ? isVoiceMessage(messageToDelete) : false;
  const deletionDescription = messageToDelete
    ? deletingVoiceMessage
      ? messageToDelete.content || 'رسالة صوتية'
      : messageToDelete.content || messageToDelete.attachment_name || (messageToDelete.image_url || messageToDelete.attachment_type?.startsWith('image/') ? 'صورة مرفقة' : 'مرفق')
    : '';

  return (
    <Card className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col overflow-hidden md:h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3"><i className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /><b className="display text-lg">محادثة الفريق</b></div>
        <div className="flex items-center gap-3">
          {notif === 'default' && <button onClick={async () => setNotif(await Notification.requestPermission())} className="text-xs font-semibold text-coral">🔔 تفعيل التنبيهات</button>}
          <span className="text-xs text-slate-500">{status}</span>
        </div>
      </div>
      <nav aria-label="قنوات المحادثة" className="scroll-thin flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3">
        {channels.map((channel) => (
          <button key={channel.id} type="button" onClick={() => setActiveChannel(channel.id)} className={cn('shrink-0 rounded-xl border px-4 py-2 text-sm transition', activeChannel === channel.id ? 'border-coral/30 bg-coral/10 font-semibold text-coral' : 'border-transparent text-slate-500 hover:bg-white/5 hover:text-coral')}>
            # {channel.name}
          </button>
        ))}
        {channels.length === 0 && <span className="px-2 py-1 text-xs text-slate-500">شغّل مخطط قاعدة البيانات لتحميل القنوات.</span>}
        {profile?.is_owner && <form onSubmit={(event) => void createChannel(event)} className="ms-auto flex shrink-0 items-center gap-2">
          <input value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} maxLength={60} aria-label="اسم القناة الجديدة" placeholder="قناة جديدة" className="w-28 rounded-lg border border-white/10 bg-white/50 px-2.5 py-2 text-xs outline-none focus:border-coral" />
          <button type="submit" disabled={!newChannelName.trim()} className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-semibold text-coral disabled:opacity-50">إضافة +</button>
        </form>}
      </nav>
      {channelError && <p role="status" className="border-b border-white/10 px-5 py-2 text-xs text-red-500">{channelError}</p>}
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {msgs.map((m) => {
          const mine = m.user_id === profile?.id; const a = people.get(m.user_id);
          const mediaUrl = mediaUrls.get(m.id);
          const storedMediaType = m.attachment_type || (m.image_url ? 'image/legacy' : '');
          const isRecordedWebm = storedMediaType === 'video/webm' && isVoiceMessage(m);
          const mediaType = isRecordedWebm ? 'audio/webm' : storedMediaType;
          return (
            <div key={m.id} className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')} aria-label={`${mine ? 'رسالتك' : `رسالة من ${a?.display_name ?? 'عضو'}`}`}>
              <Avatar name={a?.display_name} url={a?.avatar_url} size={32} />
              <div className={cn('flex min-w-0 max-w-[82%] flex-col gap-1 sm:max-w-[76%]', mine ? 'items-end' : 'items-start')}>
                {mediaUrl && mediaType.startsWith('image/') && (
                  <button
                    type="button"
                    onClick={() => { setImagePreview({ url: mediaUrl, name: m.attachment_name ?? 'صورة مشتركة' }); setImageZoom(1); }}
                    aria-label="تكبير الصورة"
                    className="group block max-w-full overflow-hidden rounded-xl text-right"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl} alt={m.attachment_name ?? 'صورة مشتركة'} loading="lazy" className="max-h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  </button>
                )}
                {mediaUrl && mediaType.startsWith('audio/') && <VoiceMessage src={mediaUrl} waveform={m.waveform} />}
                {mediaUrl && mediaType.startsWith('video/') && <VideoMessage src={mediaUrl} filename={m.attachment_name} />}
                {mediaUrl && !mediaType.startsWith('image/') && !mediaType.startsWith('audio/') && !mediaType.startsWith('video/') && <a href={mediaUrl} download={m.attachment_name ?? true} className="mt-2 block text-coral underline">📎 {m.attachment_name ?? 'تنزيل المرفق'}</a>}
                {(m.content || m.mentions?.length) && (
                  <div className={cn('max-w-full rounded-[1.35rem] px-4 py-2.5 text-sm', mine ? 'rounded-br-md bg-[#ead8cb]' : 'rounded-bl-md bg-[#eeeae4]')}>
                    {m.content && <p dir="auto" className="whitespace-pre-wrap break-words leading-6 text-[#40382f]">{m.content}</p>}
                    {m.mentions?.length ? <div className="mt-2 flex flex-wrap gap-1">{m.mentions.map((id) => people.get(id)).filter((person): person is Profile => !!person).map((person) => <span key={person.id} className="rounded-full bg-coral/10 px-2 py-0.5 text-[10px] text-coral">@{person.display_name}</span>)}</div> : null}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 px-1">
                  <time className="text-[10px] leading-4 text-slate-500">{new Date(m.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</time>
                  {(mine || profile?.is_owner) && <button onClick={() => setMessageToDelete(m)} className="text-[10px] text-slate-400 transition hover:text-red-500">حذف</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {imagePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#211e1a]/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="عرض الصورة"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) { setImagePreview(null); setImageZoom(1); }
          }}
        >
          <div className="flex max-h-full max-w-full flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between gap-4 text-white">
              <p dir="auto" className="min-w-0 truncate text-sm">{imagePreview.name}</p>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => setImageZoom((zoom) => Math.max(1, zoom - 0.25))} aria-label="تصغير الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20">−</button>
                <button type="button" onClick={() => setImageZoom((zoom) => Math.min(3, zoom + 0.25))} aria-label="تكبير الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20">+</button>
                <button type="button" onClick={() => { setImagePreview(null); setImageZoom(1); }} aria-label="إغلاق الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20">×</button>
              </div>
            </div>
            <div className="scroll-thin max-h-[82vh] max-w-[92vw] overflow-auto rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview.url} alt={imagePreview.name} className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl transition-transform duration-200" style={{ transform: `scale(${imageZoom})` }} />
            </div>
          </div>
        </div>
      )}
      <form onSubmit={send} className="border-t border-white/10 p-4">
        {recording && <div dir="ltr" aria-label="الترددات المباشرة للرسالة الصوتية" className="mb-3 flex h-10 items-center justify-center gap-[2px] overflow-hidden rounded-lg bg-coral/5">{audioLevels.map((level, index) => <span key={index} className="w-[3px] shrink-0 rounded-full bg-coral" style={{ height: `${Math.max(4, level)}%` }} />)}</div>}
        {file && <p className="mb-3 text-xs text-slate-300"><span className="rounded-full border border-coral/30 bg-coral/10 px-3 py-1">📎 {file.name}</span> <button type="button" onClick={() => setFile(null)} className="ml-2 text-slate-500 hover:text-coral">✕</button></p>}
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:border-coral/50">📎<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/*,video/*,application/pdf,text/plain,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button type="button" onClick={toggleRecording} disabled={!!file} className={cn('rounded-xl border px-4 py-3 text-sm transition disabled:opacity-50', recording ? 'border-red-400/40 bg-red-400/10 text-red-200' : 'border-white/10 bg-white/5 hover:border-coral/50')} aria-label={recording ? 'إيقاف وإرسال التسجيل' : 'تسجيل رسالة صوتية'}>{recording ? 'إيقاف التسجيل' : '🎙 صوت'}</button>
          <MentionTextarea value={text} onChange={setText} people={[...people.values()].filter((person) => person.approved || person.is_owner)} mentionIds={mentionIds} onMentionIdsChange={setMentionIds} rows={1} maxLength={2000} placeholder="اكتب رسالة… استخدم @ للإشارة" className="mt-0 min-w-0 flex-1" />
          <Button type="submit">إرسال</Button>
        </div>
      </form>
      {messageToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#352f28]/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingMessage) setMessageToDelete(null); }}>
        <Card role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <Avatar name={people.get(messageToDelete.user_id)?.display_name} url={people.get(messageToDelete.user_id)?.avatar_url} size={44} />
            <div className="min-w-0"><p className="text-xs text-slate-500">هوية مرسل الرسالة</p><p className="truncate font-semibold">{people.get(messageToDelete.user_id)?.display_name ?? 'عضو'}</p></div>
          </div>
          <h2 id="delete-message-title" className="display mt-5 text-xl font-bold">{deletingVoiceMessage ? 'هل أنت متأكد من حذف هذه الرسالة الصوتية؟' : 'تأكيد حذف الرسالة'}</h2>
          <p dir="auto" className="mt-2 break-words rounded-xl bg-white/10 p-3 text-sm text-slate-300">{deletionDescription}</p>
          <p className="mt-3 text-sm text-slate-500">سيُحذف محتوى الرسالة ومرفقها نهائيًا.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" disabled={deletingMessage} onClick={() => setMessageToDelete(null)}>إلغاء</Button>
            <Button type="button" disabled={deletingMessage} onClick={() => { if (messageToDelete) void deleteMessage(messageToDelete); }} className="bg-red-700 hover:bg-red-800">{deletingMessage ? 'جارٍ الحذف…' : 'احذف الرسالة'}</Button>
          </div>
        </Card>
      </div>}
    </Card>
  );
}
