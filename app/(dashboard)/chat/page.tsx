'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, CircleStop, FileText, Hash, Menu, Mic, MoreHorizontal, Paperclip, Pin, Plus, Reply, Send, Settings2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Card } from '@/components/ui/ui';
import { cn, fileExt, privateStoragePath } from '@/lib/utils';
import VoiceMessage from '@/components/VoiceMessage';
import VideoMessage from '@/components/VideoMessage';
import MentionTextarea from '@/components/MentionTextarea';
import type { ChatChannel, Message, MessageRead, MessageReaction, Profile } from '@/lib/types';

function isVoiceMessage(message: Message) {
  return message.attachment_type?.startsWith('audio/')
    || Boolean(message.waveform?.length)
    || message.attachment_name?.startsWith('رسالة-صوتية.') === true;
}

interface QueuedMessage {
  id: string;
  local_id: number;
  channel_id: string;
  content: string;
  mentions: string[];
  reply_to_id: number | null;
  created_at: string;
}

export default function ChatPage() {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [editingChannelDescription, setEditingChannelDescription] = useState('');
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [channelListOpen, setChannelListOpen] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [activeRoomMemberIds, setActiveRoomMemberIds] = useState<string[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [outboxReady, setOutboxReady] = useState(false);
  const [outboxOwnerId, setOutboxOwnerId] = useState<string | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<ChatChannel | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<number, string>>(new Map());
  const [recording, setRecording] = useState(false);
  const [reactions, setReactions] = useState<Map<number, MessageReaction[]>>(new Map());
  const [messageReads, setMessageReads] = useState<Map<number, string[]>>(new Map());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionMenuId, setReactionMenuId] = useState<number | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const [savingMessageId, setSavingMessageId] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [pinningMessageId, setPinningMessageId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [status, setStatus] = useState('متصل');
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>('default');
  const peopleRef = useRef(people); peopleRef.current = people;
  const activeChannelRef = useRef(activeChannel); activeChannelRef.current = activeChannel;
  const activeMessageIdsRef = useRef<Set<number>>(new Set());
  activeMessageIdsRef.current = new Set(msgs.map((message) => message.id));
  const messagesRef = useRef(msgs);
  messagesRef.current = msgs;
  const flushingOutboxRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const meRef = useRef(profile?.id); meRef.current = profile?.id;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const cancelRecordingRef = useRef(false);
  const waveformRef = useRef<number[]>([]);
  const frequencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [fileWaveform, setFileWaveform] = useState<number[]>([]);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const activeChannelDetails = channels.find((channel) => channel.id === activeChannel);
  const approvedMemberCount = [...people.values()].filter((person) => (person.is_approved && !person.is_rejected) || person.is_owner).length;
  const roomMembersOnline = activeRoomMemberIds.filter((id) => {
    const member = people.get(id);
    return member && (member.is_approved && !member.is_rejected || member.is_owner);
  });
  const connectionLabel = !isOnline ? 'غير متصل' : realtimeConnected ? 'متصل' : 'جارٍ الاتصال';

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setImagePreview(null); setImageZoom(1); }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [imagePreview]);

  useEffect(() => () => {
    cancelRecordingRef.current = true;
    recorderRef.current?.stop();
    if (frequencyTimerRef.current) clearInterval(frequencyTimerRef.current);
    void audioContextRef.current?.close();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

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

  async function markMessagesRead(messages: Message[]) {
    if (!profile || document.visibilityState !== 'visible') return;
    const unread = messages.filter((message) => message.id > 0 && message.user_id !== profile.id);
    if (!unread.length) return;
    const rows = unread.map((message) => ({ message_id: message.id, user_id: profile.id }));
    const { error } = await supabase.from('th_message_reads').upsert(rows, {
      onConflict: 'message_id,user_id',
      ignoreDuplicates: true
    });
    if (error) {
      console.error('Failed to save chat read receipts:', error);
      setStatus('تعذر تحديث حالة قراءة الرسائل.');
      return;
    }
    setMessageReads((current) => {
      const next = new Map(current);
      for (const message of unread) {
        const readers = next.get(message.id) ?? [];
        if (!readers.includes(profile.id)) next.set(message.id, [...readers, profile.id]);
      }
      return next;
    });
  }

  useEffect(() => { setNotif(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);

  useEffect(() => {
    if (!audioPreviewUrl) return;
    return () => URL.revokeObjectURL(audioPreviewUrl);
  }, [audioPreviewUrl]);

  useEffect(() => {
    const markVisibleMessagesRead = () => {
      if (document.visibilityState === 'visible') {
        void markMessagesRead(messagesRef.current.filter((message) => message.channel_id === activeChannel));
      }
    };
    document.addEventListener('visibilitychange', markVisibleMessagesRead);
    return () => document.removeEventListener('visibilitychange', markVisibleMessagesRead);
  }, [activeChannel, profile?.id]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) {
      setQueuedMessages([]);
      setOutboxReady(false);
      setOutboxOwnerId(null);
      return;
    }
    setOutboxReady(false);
    try {
      const saved = localStorage.getItem(`teamhub:chat-outbox:${profile.id}`);
      const parsed = saved ? JSON.parse(saved) as QueuedMessage[] : [];
      if (!Array.isArray(parsed) || parsed.some((message) =>
        typeof message.id !== 'string' || typeof message.local_id !== 'number' || typeof message.channel_id !== 'string' ||
        typeof message.content !== 'string' || !Array.isArray(message.mentions) ||
        typeof message.created_at !== 'string'
      )) throw new Error('Invalid offline message queue');
      setQueuedMessages(parsed);
      setMsgs(parsed.map((message) => ({
        id: message.local_id,
        user_id: profile.id,
        content: message.content,
        image_url: null,
        channel_id: message.channel_id,
        mentions: message.mentions,
        reply_to_id: message.reply_to_id,
        created_at: message.created_at,
        delivery_state: 'pending'
      })));
      setOutboxOwnerId(profile.id);
    } catch (error) {
      console.error('Failed to restore queued chat messages:', error);
      setStatus('تعذر استعادة الرسائل المحفوظة دون اتصال.');
      setQueuedMessages([]);
      setOutboxOwnerId(profile.id);
    } finally {
      setOutboxReady(true);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !outboxReady || outboxOwnerId !== profile.id) return;
    try {
      const key = `teamhub:chat-outbox:${profile.id}`;
      if (queuedMessages.length) localStorage.setItem(key, JSON.stringify(queuedMessages));
      else localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to persist queued chat messages:', error);
      setStatus('تعذر حفظ الرسائل محليًا. أفرغ مساحة التخزين في المتصفح.');
    }
  }, [outboxOwnerId, outboxReady, profile?.id, queuedMessages]);

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
    const ch = supabase.channel('chat-channels');
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_channels' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const deleted = payload.old as ChatChannel;
        setChannels((current) => current.filter((channel) => channel.id !== deleted.id));
        if (activeChannelRef.current === deleted.id) setActiveChannel('general');
      } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const updated = payload.new as ChatChannel;
        setChannels((current) => [...current.filter((item) => item.id !== updated.id), updated].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }
    });
    ch.subscribe((subscriptionStatus, subscriptionError) => {
      if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
        console.error('Chat channel realtime subscription failed:', subscriptionError);
        if (alive) setStatus('تعذر تحديث قائمة الغرف مباشرة.');
      }
    });
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setMsgs([]);
    setPinnedMessages([]);
    setReactions(new Map());
    setMessageReads(new Map());
    setMediaUrls(new Map());
    setActiveRoomMemberIds([]);
    setReplyTo(null);

    const ch = supabase.channel(`chat-room-${activeChannel}`, { config: { presence: { key: profile?.id ?? 'anonymous' } } });
    ch.on('presence', { event: 'sync' }, () => {
      if (!active) return;
      const members = Object.values(ch.presenceState<{ id: string; channel_id: string }>())
        .flat()
        .filter((member) => member.channel_id === activeChannel)
        .map((member) => member.id);
      setActiveRoomMemberIds([...new Set(members)]);
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'th_messages', filter: `channel_id=eq.${activeChannel}` }, async (payload) => {
      if (!active) return;
      const message = payload.new as Message;
      if (!peopleRef.current.has(message.user_id)) {
        const { data } = await supabase.from('th_profiles').select('*').eq('id', message.user_id).maybeSingle();
        if (!active) return;
        if (data) setPeople((current) => new Map(current).set(message.user_id, data as Profile));
      }
      setMsgs((current) => current.some((item) => item.id === message.id) ? current : [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      if (message.pinned) setPinnedMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      if (message.user_id !== meRef.current) void markMessagesRead([message]);
      const media = await resolveMedia(message);
      if (active && media) setMediaUrls((current) => new Map(current).set(media[0], media[1]));
      if (message.user_id !== meRef.current && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const senderName = peopleRef.current.get(message.user_id)?.display_name ?? 'TeamHub';
        new Notification(senderName, { body: message.content || message.attachment_name || 'أرسل مرفقًا' });
      }
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'th_messages', filter: `channel_id=eq.${activeChannel}` }, (payload) => {
      if (!active) return;
      const updated = payload.new as Message;
      setMsgs((current) => current.map((message) => message.id === updated.id ? updated : message));
      setPinnedMessages((current) => updated.pinned
        ? [updated, ...current.filter((message) => message.id !== updated.id)].sort((a, b) => b.created_at.localeCompare(a.created_at))
        : current.filter((message) => message.id !== updated.id));
    });
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'th_messages' }, (payload) => {
      if (!active) return;
      const id = Number((payload.old as { id: number }).id);
      setMsgs((current) => current.filter((message) => message.id !== id));
      setPinnedMessages((current) => current.filter((message) => message.id !== id));
      setMediaUrls((current) => { const next = new Map(current); next.delete(id); return next; });
      setReactions((current) => { const next = new Map(current); next.delete(id); return next; });
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_message_reactions' }, (payload) => {
      if (!active) return;
      const reaction = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MessageReaction;
      if (!activeMessageIdsRef.current.has(reaction.message_id)) return;
      if (payload.eventType === 'DELETE') {
        setReactions((current) => {
          const next = new Map(current);
          next.set(reaction.message_id, (next.get(reaction.message_id) ?? []).filter((item) => item.user_id !== reaction.user_id));
          return next;
        });
      } else if (payload.eventType === 'INSERT') {
        setReactions((current) => {
          const next = new Map(current);
          const list = next.get(reaction.message_id) ?? [];
          next.set(reaction.message_id, [...list.filter((item) => item.user_id !== reaction.user_id), reaction]);
          return next;
        });
      }
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'th_message_reads' }, (payload) => {
      if (!active) return;
      const read = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MessageRead;
      if (!activeMessageIdsRef.current.has(read.message_id)) return;
      setMessageReads((current) => {
        const next = new Map(current);
        const readers = next.get(read.message_id) ?? [];
        next.set(read.message_id, payload.eventType === 'DELETE'
          ? readers.filter((id) => id !== read.user_id)
          : [...new Set([...readers, read.user_id])]);
        return next;
      });
    });
    ch.subscribe((subscriptionStatus, subscriptionError) => {
      if (subscriptionStatus === 'SUBSCRIBED') {
        if (!active) return;
        setRealtimeConnected(true);
        if (profile) void ch.track({ id: profile.id, channel_id: activeChannel });
      } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT' || subscriptionStatus === 'CLOSED') {
        setRealtimeConnected(false);
        console.error(`Realtime subscription failed for channel ${activeChannel}:`, subscriptionError);
        if (active) setStatus('تعذر تحديث رسائل هذه الغرفة مباشرة.');
      }
    });

    (async () => {
      const [messageResult, pinnedResult] = await Promise.all([
        supabase.from('th_messages').select('*').eq('channel_id', activeChannel).order('created_at', { ascending: false }).limit(100),
        supabase.from('th_messages').select('*').eq('channel_id', activeChannel).eq('pinned', true).order('created_at', { ascending: false }).limit(20)
      ]);
      if (!active) return;
      if (messageResult.error) {
        setStatus('تعذر تحميل رسائل القناة. تحقق من تحديث قاعدة البيانات.');
        setMsgs([]);
        return;
      }
      const loaded = ((messageResult.data ?? []) as Message[]).reverse();
      const pinned = (pinnedResult.data ?? []) as Message[];
      let hasLoadError = false;
      if (pinnedResult.error) {
        console.error('Failed to load pinned messages:', pinnedResult.error);
        setStatus('تعذر تحميل الرسائل المثبتة. تحقق من تحديث قاعدة البيانات.');
        hasLoadError = true;
      }
      setPinnedMessages(pinned);
      setMsgs((current) => {
        const combined = new Map(loaded.map((message) => [message.id, message]));
        for (const message of current.filter((item) => item.channel_id === activeChannel)) combined.set(message.id, message);
        return [...combined.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      const [reactionResult, receiptResult, urls] = await Promise.all([
        loaded.length
          ? supabase.from('th_message_reactions').select('*').in('message_id', loaded.map((message) => message.id))
          : Promise.resolve({ data: [], error: null }),
        loaded.length
          ? supabase.from('th_message_reads').select('*').in('message_id', loaded.map((message) => message.id))
          : Promise.resolve({ data: [], error: null }),
        Promise.all([...new Map([...loaded, ...pinned].map((message) => [message.id, message])).values()].map(resolveMedia))
      ]);
      if (!active) return;
      if (reactionResult.error) {
        setStatus('تعذر تحميل تفاعلات الرسائل.');
        hasLoadError = true;
      }
      else if (reactionResult.data) {
        setReactions(reactionResult.data.reduce((grouped, reaction) => {
          const list = grouped.get(reaction.message_id) ?? [];
          grouped.set(reaction.message_id, [...list, reaction as MessageReaction]);
          return grouped;
        }, new Map<number, MessageReaction[]>()));
      }
      if (receiptResult.error) {
        console.error('Failed to load chat read receipts:', receiptResult.error);
        setStatus('تعذر تحميل حالة قراءة الرسائل. شغّل مخطط قاعدة البيانات المحدّث.');
        hasLoadError = true;
      } else if (receiptResult.data) {
        setMessageReads(receiptResult.data.reduce((grouped, receipt) => {
          const readers = grouped.get(receipt.message_id) ?? [];
          grouped.set(receipt.message_id, [...readers, receipt.user_id]);
          return grouped;
        }, new Map<number, string[]>()));
      }
      setMediaUrls((previous) => {
        const next = new Map(previous);
        for (const message of [...loaded, ...pinned]) next.delete(message.id);
        for (const entry of urls) if (entry) next.set(entry[0], entry[1]);
        return next;
      });
      void markMessagesRead(loaded);
      if (!hasLoadError) setStatus('متصل');
    })();

    return () => {
      active = false;
      setRealtimeConnected(false);
      supabase.removeChannel(ch);
    };
  }, [activeChannel, profile?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  async function flushQueuedMessages() {
    if (!profile || !navigator.onLine || flushingOutboxRef.current || queuedMessages.length === 0) return;
    flushingOutboxRef.current = true;
    let failed = false;
    try {
      for (const queued of queuedMessages) {
        if (!navigator.onLine) break;
        const { data, error } = await supabase.from('th_messages').insert({
          content: queued.content,
          channel_id: queued.channel_id,
          mentions: queued.mentions,
          reply_to_id: queued.reply_to_id
        }).select('*').single();
        if (error) {
          console.error('Failed to sync queued chat message:', error);
          setMsgs((current) => current.map((message) => message.id === queued.local_id ? { ...message, delivery_state: 'failed' } : message));
          setStatus('تعذرت مزامنة رسالة محفوظة. ستبقى في قائمة الإرسال للمحاولة مجددًا.');
          failed = true;
          break;
        }
        const synced = data as Message;
        setMsgs((current) => [...current.filter((message) => message.id !== queued.local_id), synced].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        setQueuedMessages((current) => current.filter((message) => message.id !== queued.id));
      }
      if (navigator.onLine && !failed) setStatus('تمت مزامنة الرسائل المحفوظة.');
    } finally {
      flushingOutboxRef.current = false;
    }
  }

  function cancelRecording() {
    if (!recorderRef.current || recorderRef.current.state !== 'recording') return;
    cancelRecordingRef.current = true;
    recorderRef.current.stop();
    setRecording(false);
    setAudioLevels([]);
    setStatus('تم إلغاء التسجيل الصوتي.');
  }

  function clearAttachment() {
    setFile(null);
    setFileWaveform([]);
    setAudioPreviewUrl(null);
  }

  useEffect(() => {
    if (isOnline && outboxReady && queuedMessages.length) void flushQueuedMessages();
  }, [isOnline, outboxReady, queuedMessages, profile?.id]);

  async function sendMessage(content: string, attachment: File | null, waveform: number[] = [], replyToId = replyTo?.id ?? null, mentionedUserIds: string[] = []) {
    if (!profile || (!content.trim() && !attachment)) return;
    const targetChannel = activeChannel;
    if (!navigator.onLine) {
      if (attachment) {
        setStatus('لا يمكن إرسال المرفقات دون اتصال. سيبقى المرفق محددًا حتى يعود الاتصال.');
        return;
      }
      if (!outboxReady) {
        setStatus('جارٍ تجهيز قائمة الرسائل المحفوظة. حاول مرة أخرى بعد لحظة.');
        return;
      }
      const localId = -Number.parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 12), 16);
      const queued: QueuedMessage = {
        id: crypto.randomUUID(),
        local_id: localId,
        channel_id: targetChannel,
        content: content.trim(),
        mentions: mentionedUserIds,
        reply_to_id: replyToId,
        created_at: new Date().toISOString()
      };
      const nextQueue = [...queuedMessages, queued];
      try {
        localStorage.setItem(`teamhub:chat-outbox:${profile.id}`, JSON.stringify(nextQueue));
      } catch (error) {
        console.error('Failed to save offline chat message:', error);
        setStatus('تعذر حفظ الرسالة محليًا. أفرغ مساحة التخزين في المتصفح وحاول مجددًا.');
        return;
      }
      setQueuedMessages(nextQueue);
      setMsgs((current) => [...current, {
        id: queued.local_id,
        user_id: profile.id,
        content: queued.content,
        image_url: null,
        channel_id: queued.channel_id,
        mentions: queued.mentions,
        reply_to_id: queued.reply_to_id,
        created_at: queued.created_at,
        delivery_state: 'pending'
      }]);
      setText('');
      setMentionIds([]);
      setReplyTo(null);
      setStatus('حُفظت الرسالة على هذا الجهاز وستُرسل عند عودة الاتصال.');
      return;
    }
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
    payload.channel_id = targetChannel;
    payload.mentions = mentionedUserIds;
    if (replyToId) payload.reply_to_id = replyToId;
    const { data, error } = await supabase.from('th_messages').insert(payload).select('*').single();
    if (error) {
      if (path) await supabase.storage.from('th-chat').remove([path]);
      const code = (error as { code?: string }).code;
      setStatus(code === '42703' || code === 'PGRST204' || code === 'PGRST202'
        ? 'مخطط قاعدة البيانات قديم. شغّل أحدث ملف supabase/schema.sql.'
        : code === '42501'
          ? 'لا تسمح صلاحيات قاعدة البيانات بإرسال الرسالة. تحقق من إعدادات Supabase.'
          : `تعذر إرسال الرسالة (${code ?? 'خطأ'}).`);
      return;
    }
    const message = data as Message;
    if (activeChannelRef.current === targetChannel) {
      setMsgs((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, message]);
      const media = await resolveMedia(message);
      if (media) setMediaUrls((prev) => new Map(prev).set(media[0], media[1]));
    }
    setText('');
    setMentionIds([]);
    clearAttachment();
    setReplyTo(null);
    setStatus('تم الإرسال');
  }

  async function send(e: React.FormEvent) { e.preventDefault(); await sendMessage(text, file, fileWaveform, replyTo?.id ?? null, mentionIds); }

  async function createChannel(event: React.FormEvent) {
    event.preventDefault();
    const name = newChannelName.trim();
    if ((!profile?.is_approved || profile.is_rejected) && !profile?.is_owner || !name) return;
    if (name.length > 60) { setChannelError('اسم القناة يجب ألا يتجاوز 60 حرفًا.'); return; }
    const id = `channel-${crypto.randomUUID().slice(0, 12)}`;
    const description = newChannelDescription.trim();
    const { data, error } = await supabase.from('th_channels').insert({ id, name, description: description || null }).select('*').single();
    if (error) {
      console.error('Failed to create chat channel:', error);
      setChannelError('تعذر إنشاء الغرفة. تأكد من صلاحية عضويتك وحاول مرة أخرى.');
      return;
    }
    setChannels((current) => [...current, data as ChatChannel]);
    setActiveChannel(id);
    setNewChannelName('');
    setNewChannelDescription('');
    setCreatingChannel(false);
    setChannelListOpen(false);
    setChannelError('');
  }

  async function renameChannel(channel: ChatChannel, event: React.FormEvent) {
    event.preventDefault();
    const name = editingChannelName.trim();
    const description = editingChannelDescription.trim();
    if (!profile || channel.created_by !== profile.id || !name) return;
    if (name.length > 60) { setChannelError('اسم القناة يجب ألا يتجاوز 60 حرفًا.'); return; }
    const { data, error } = await supabase.from('th_channels').update({ name, description: description || null }).eq('id', channel.id).select('*').single();
    if (error) {
      console.error('Failed to rename chat channel:', error);
      setChannelError('تعذر تعديل اسم الغرفة. تأكد من صلاحياتك وحاول مرة أخرى.');
      return;
    }
    setChannels((current) => current.map((item) => item.id === channel.id ? data as ChatChannel : item));
    setEditingChannelId(null);
    setEditingChannelName('');
    setEditingChannelDescription('');
    setChannelError('');
  }

  async function deleteChannel(channel: ChatChannel) {
    if (!profile || channel.created_by !== profile.id || deletingChannelId) return;
    setDeletingChannelId(channel.id);
    setChannelError('');
    const messages: Pick<Message, 'attachment_path' | 'image_url'>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: messagesError } = await supabase
        .from('th_messages')
        .select('attachment_path,image_url')
        .eq('channel_id', channel.id)
        .range(offset, offset + 999);
      if (messagesError) {
        setChannelError('تعذر تجهيز مرفقات الغرفة للحذف. حاول مرة أخرى.');
        setDeletingChannelId(null);
        return;
      }
      messages.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }

    const paths = messages
      .map((message) => message.attachment_path || privateStoragePath(message.image_url, 'th-chat'))
      .filter((path): path is string => !!path);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error: removeError } = await supabase.storage.from('th-chat').remove(paths.slice(offset, offset + 100));
      if (removeError) {
        console.error('Failed to remove channel attachments:', removeError);
        setChannelError('تعذر حذف مرفقات الغرفة. لم تُحذف الغرفة؛ حاول مرة أخرى.');
        setDeletingChannelId(null);
        return;
      }
    }
    const { error } = await supabase.from('th_channels').delete().eq('id', channel.id);
    if (error) {
      console.error('Failed to delete chat channel:', error);
      setChannelError('تعذر حذف الغرفة. تأكد من أنك منشئها ثم حاول مرة أخرى.');
      setDeletingChannelId(null);
      return;
    }

    setChannels((current) => current.filter((item) => item.id !== channel.id));
    if (activeChannel === channel.id) {
      setMsgs([]);
      setMediaUrls(new Map());
      setReactions(new Map());
      setActiveChannel('general');
    }
    setChannelToDelete(null);
    setDeletingChannelId(null);
    setStatus('تم حذف الغرفة ورسائلها ومرفقاتها');
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
    setFile(f);
    setFileWaveform([]);
    setAudioPreviewUrl(null);
    setStatus('المرفق جاهز للإرسال');
  }

  async function toggleRecording() {
    if (recorderRef.current?.state === 'recording') { recorderRef.current.stop(); return; }
    if (!navigator.onLine) { setStatus('اتصل بالإنترنت قبل بدء تسجيل رسالة صوتية.'); return; }
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
        setRecording(false);
        setAudioLevels([]);
        if (cancelRecordingRef.current) return;
        const type = recorder.mimeType.split(';')[0] || 'audio/webm';
        const extension = type === 'audio/mp4' ? 'mp4' : type === 'audio/ogg' ? 'ogg' : 'webm';
        const samples = waveformRef.current;
        const bucketSize = Math.max(1, Math.ceil(samples.length / 80));
        const waveform = Array.from({ length: Math.min(80, Math.ceil(samples.length / bucketSize)) }, (_, index) => {
          const bucket = samples.slice(index * bucketSize, (index + 1) * bucketSize);
          return Math.round(bucket.reduce((sum, value) => sum + value, 0) / Math.max(1, bucket.length));
        });
        const audioFile = new File(chunks, `رسالة-صوتية.${extension}`, { type });
        setFile(audioFile);
        setFileWaveform(waveform);
        setAudioPreviewUrl(URL.createObjectURL(audioFile));
        setStatus('استمع إلى التسجيل، ثم أرسله أو ألغِه.');
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
    setReplyTo((current) => current?.id === message.id ? null : current);
    setDeletingMessageId(null);
    setMessageToDelete(null);
    setStatus('تم حذف الرسالة');
  }

  function canEditMessage(message: Message) {
    const createdAt = Date.parse(message.created_at);
    return message.user_id === profile?.id
      && message.delivery_state !== 'pending'
      && message.delivery_state !== 'failed'
      && Number.isFinite(createdAt)
      && clock >= createdAt
      && clock - createdAt < 10 * 60 * 1000;
  }

  function startEditingMessage(message: Message) {
    if (!canEditMessage(message)) {
      setStatus('انتهت مهلة تعديل الرسالة (١٠ دقائق).');
      return;
    }
    setEditingMessageId(message.id);
    setEditingMessageContent(message.content ?? '');
  }

  async function saveMessageEdit(message: Message, event: React.FormEvent) {
    event.preventDefault();
    if (!profile || savingMessageId !== null) return;
    if (!canEditMessage(message)) {
      setEditingMessageId(null);
      setStatus('انتهت مهلة تعديل الرسالة (١٠ دقائق).');
      return;
    }
    const content = editingMessageContent.trim();
    if (!content && !message.attachment_path && !message.image_url) {
      setStatus('لا يمكن أن تكون الرسالة النصية فارغة.');
      return;
    }

    setSavingMessageId(message.id);
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('th_messages')
      .update({ content: content || null })
      .eq('id', message.id)
      .eq('user_id', profile.id)
      .gt('created_at', cutoff)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to edit chat message:', error);
      setStatus(error ? 'تعذر تعديل الرسالة. قد تكون انتهت مهلة التعديل أو لا تملك الصلاحية.' : 'انتهت مهلة تعديل الرسالة (١٠ دقائق).');
      setSavingMessageId(null);
      return;
    }

    const updated = data as Message;
    setMsgs((current) => current.map((item) => item.id === message.id ? updated : item));
    setPinnedMessages((current) => current.map((item) => item.id === message.id ? updated : item));
    setEditingMessageId(null);
    setEditingMessageContent('');
    setSavingMessageId(null);
    setStatus('تم تعديل الرسالة');
  }

  async function togglePin(message: Message) {
    if (!profile?.is_owner || pinningMessageId !== null) return;
    setPinningMessageId(message.id);
    const { data, error } = await supabase.rpc('th_toggle_message_pin', { p_message_id: message.id });
    if (error) {
      console.error('Failed to toggle pinned message:', error);
      setStatus('تعذر تثبيت الرسالة. حدّث مخطط قاعدة البيانات.');
    } else {
      const updated = { ...message, pinned: !!data };
      setMsgs((current) => current.map((item) => item.id === message.id ? updated : item));
      setPinnedMessages((current) => data
        ? [updated, ...current.filter((item) => item.id !== message.id)].sort((a, b) => b.created_at.localeCompare(a.created_at))
        : current.filter((item) => item.id !== message.id));
    }
    setPinningMessageId(null);
  }

  async function jumpToPinnedMessage(message: Message) {
    if (!msgs.some((item) => item.id === message.id)) {
      setMsgs((current) => [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      const media = await resolveMedia(message);
      if (activeChannelRef.current === message.channel_id && media) setMediaUrls((current) => new Map(current).set(media[0], media[1]));
    }
    window.setTimeout(() => document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function jumpToRepliedMessage(messageId: number) {
    let target = msgs.find((message) => message.id === messageId);
    if (!target) {
      const { data, error } = await supabase.from('th_messages').select('*').eq('id', messageId).eq('channel_id', activeChannelRef.current).maybeSingle();
      if (error) {
        console.error('Failed to load replied-to message:', error);
        setStatus('تعذر فتح الرسالة المشار إليها.');
        return;
      }
      if (!data) {
        setStatus('الرسالة الأصلية لم تعد متاحة.');
        return;
      }
      target = data as Message;
      setMsgs((current) => current.some((message) => message.id === target?.id)
        ? current
        : [...current, target!].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      const media = await resolveMedia(target);
      if (media) setMediaUrls((current) => new Map(current).set(media[0], media[1]));
    }
    window.setTimeout(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
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
  const pendingForActiveChannel = queuedMessages
    .filter((message) => message.channel_id === activeChannel)
    .map((message): Message => ({
      id: message.local_id,
      user_id: profile?.id ?? '',
      content: message.content,
      image_url: null,
      channel_id: message.channel_id,
      mentions: message.mentions,
      reply_to_id: message.reply_to_id,
      created_at: message.created_at,
      delivery_state: 'pending'
    }));
  const displayedMessages = [
    ...msgs,
    ...pendingForActiveChannel.filter((pending) => !msgs.some((message) => message.id === pending.id))
  ].filter((message) => message.channel_id === activeChannel)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className="relative flex h-full min-h-0 w-full flex-row overflow-hidden border-y border-[#5b4631]/10 bg-[#fffdfa] text-[#352f28] md:border-x">
      {channelListOpen && <button type="button" aria-label="إغلاق قائمة الغرف" onClick={() => setChannelListOpen(false)} className="absolute inset-0 z-20 bg-[#352f28]/30 md:hidden" />}
      <aside className={cn(
        'scroll-thin absolute inset-y-0 right-0 z-30 flex w-[min(84vw,17rem)] flex-col border-l border-[#5b4631]/10 bg-[#faf8f4] transition-transform md:static md:z-auto md:w-[17rem] md:shrink-0 md:translate-x-0',
        channelListOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
      )}>
        <div className="flex items-center justify-between border-b border-[#5b4631]/10 px-4 py-4">
          <h2 className="text-sm font-bold">غرف الفريق</h2>
          {((profile?.is_approved && !profile.is_rejected) || profile?.is_owner) && (
            <button type="button" onClick={() => { setCreatingChannel((value) => !value); setChannelError(''); }} aria-label="إنشاء غرفة" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#eee8de] hover:text-coral">
              {creatingChannel ? <X size={17} /> : <Plus size={18} />}
            </button>
          )}
        </div>
        {creatingChannel && (
          <form onSubmit={(event) => { void createChannel(event); }} className="space-y-2 border-b border-[#5b4631]/10 p-3">
            <input autoFocus value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} maxLength={60} aria-label="اسم الغرفة" placeholder="اسم الغرفة" className="w-full rounded-lg border border-[#5b4631]/10 bg-white px-3 py-2 text-xs outline-none focus:border-coral" />
            <input value={newChannelDescription} onChange={(event) => setNewChannelDescription(event.target.value)} maxLength={200} aria-label="وصف الغرفة" placeholder="موضوع الغرفة (اختياري)" className="w-full rounded-lg border border-[#5b4631]/10 bg-white px-3 py-2 text-xs outline-none focus:border-coral" />
            <button type="submit" disabled={!newChannelName.trim()} className="w-full rounded-lg bg-coral px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">إنشاء الغرفة</button>
          </form>
        )}
        <nav aria-label="قنوات المحادثة" className="scroll-thin flex-1 space-y-1 overflow-y-auto p-2.5">
          {channels.map((channel) => {
            const isActive = activeChannel === channel.id;
            return (
              <div key={channel.id}>
                {editingChannelId === channel.id ? (
                  <form onSubmit={(event) => { void renameChannel(channel, event); }} className="space-y-2 p-2.5">
                    <input autoFocus value={editingChannelName} onChange={(event) => setEditingChannelName(event.target.value)} maxLength={60} aria-label="اسم الغرفة الجديد" className="w-full rounded-lg border border-[#5b4631]/10 bg-white px-2.5 py-2 text-xs outline-none focus:border-coral" />
                    <input value={editingChannelDescription} onChange={(event) => setEditingChannelDescription(event.target.value)} maxLength={200} aria-label="وصف الغرفة الجديد" placeholder="وصف الغرفة" className="w-full rounded-lg border border-[#5b4631]/10 bg-white px-2.5 py-2 text-xs outline-none focus:border-coral" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={!editingChannelName.trim()} className="flex-1 rounded-lg bg-coral px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50">حفظ</button>
                      <button type="button" onClick={() => { setEditingChannelId(null); setEditingChannelName(''); setEditingChannelDescription(''); }} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white">إلغاء</button>
                    </div>
                  </form>
                ) : (
                  <div className="px-2.5 py-1">
                    <button type="button" onClick={() => { setActiveChannel(channel.id); setChannelListOpen(false); setChannelSettingsOpen(false); }} aria-current={isActive ? 'page' : undefined} className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-start transition', isActive ? 'bg-[#eee8de] text-[#352f28]' : 'text-slate-600 hover:bg-[#f1eee8]')}>
                      <Hash size={16} className={cn('shrink-0', isActive ? 'text-coral' : 'text-slate-400')} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{channel.name}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {channels.length === 0 && <p className="px-2 py-3 text-xs leading-6 text-slate-500">لا توجد غرف بعد. أنشئ غرفة لبدء تنظيم محادثات الفريق.</p>}
        </nav>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex min-h-[4.25rem] shrink-0 items-center justify-between border-b border-[#5b4631]/10 bg-[#fffdfa]/95 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button type="button" onClick={() => setChannelListOpen(true)} aria-label="فتح قائمة الغرف" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f1eee8] md:hidden"><Menu size={19} /></button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eee8de] text-coral"><Hash size={19} /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold sm:text-base">{activeChannelDetails?.name ?? 'محادثة الفريق'}</h1>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 sm:text-xs">
                <span>{approvedMemberCount} أعضاء</span>
                <span aria-hidden="true">·</span>
                <span>{roomMembersOnline.length} نشطون الآن</span>
                <i aria-label={connectionLabel} title={connectionLabel} className={cn('h-1.5 w-1.5 rounded-full', connectionLabel === 'متصل' ? 'bg-emerald-500' : connectionLabel === 'جارٍ الاتصال' ? 'bg-amber-500' : 'bg-red-500')} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {notif === 'default' && <button onClick={async () => setNotif(await Notification.requestPermission())} aria-label="تفعيل التنبيهات" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f1eee8] hover:text-coral sm:w-auto sm:gap-2 sm:px-2"><Bell size={16} strokeWidth={1.8} /><span className="hidden text-xs font-semibold sm:inline">التنبيهات</span></button>}
            {activeChannelDetails && (
              <div className="relative">
                <button type="button" onClick={() => setChannelSettingsOpen((open) => !open)} aria-label="إعدادات الغرفة" aria-expanded={channelSettingsOpen} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f1eee8] hover:text-[#352f28]"><MoreHorizontal size={20} /></button>
                {channelSettingsOpen && (
                  <>
                    <button type="button" aria-label="إغلاق إعدادات الغرفة" onClick={() => setChannelSettingsOpen(false)} className="fixed inset-0 z-20 cursor-default" />
                    <div className="absolute left-0 top-full z-30 mt-2 w-52 rounded-xl border border-[#5b4631]/10 bg-white p-1.5 shadow-xl">
                      <p className="truncate px-3 py-2 text-[11px] font-semibold text-slate-400">{activeChannelDetails.name}</p>
                      <button type="button" disabled={!pinnedMessages.length} onClick={() => { setChannelSettingsOpen(false); document.getElementById('pinned-messages')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-xs text-slate-600 transition hover:bg-[#f7f4ef] hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"><Pin size={15} /> الرسائل المثبتة ({pinnedMessages.length})</button>
                      {activeChannelDetails.created_by === profile?.id && <>
                        <button type="button" onClick={() => { setEditingChannelId(activeChannelDetails.id); setEditingChannelName(activeChannelDetails.name); setEditingChannelDescription(activeChannelDetails.description ?? ''); setChannelSettingsOpen(false); setChannelListOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-xs text-slate-600 transition hover:bg-[#f7f4ef] hover:text-coral"><Settings2 size={15} /> إعدادات الغرفة</button>
                        <button type="button" onClick={() => { setChannelToDelete(activeChannelDetails); setChannelSettingsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-xs text-red-700 transition hover:bg-red-50"><Trash2 size={15} /> حذف الغرفة</button>
                      </>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>
        {status !== 'متصل' && <p role="status" className="shrink-0 border-b border-[#5b4631]/10 bg-[#faf8f4] px-4 py-2 text-xs leading-5 text-slate-600">{status}</p>}
        {channelError && !channelToDelete && <p role="alert" className="shrink-0 border-b border-red-500/10 bg-red-50 px-4 py-2 text-xs leading-5 text-red-700">{channelError}</p>}
      {pinnedMessages.length > 0 && (
        <div id="pinned-messages" className="flex shrink-0 items-center gap-3 border-b border-[#5b4631]/10 bg-[#faf7f1] px-4 py-2.5">
          <Pin size={15} className="shrink-0 text-coral" />
          <span className="shrink-0 text-xs font-semibold text-[#5b4631]">مثبتة</span>
          <div className="scroll-thin flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {pinnedMessages.map((message) => (
              <button key={message.id} type="button" onClick={() => void jumpToPinnedMessage(message)} className="max-w-64 shrink-0 truncate rounded-lg bg-white/80 px-3 py-1.5 text-start text-xs text-slate-600 transition hover:bg-white hover:text-coral">
                {message.content || message.attachment_name || 'مرفق مثبت'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {displayedMessages.map((m) => {
          const mine = m.user_id === profile?.id; const a = people.get(m.user_id);
          const repliedMessage = m.reply_to_id ? displayedMessages.find((message) => message.id === m.reply_to_id) : undefined;
          const repliedAuthor = repliedMessage ? people.get(repliedMessage.user_id)?.display_name ?? 'عضو' : 'رسالة سابقة';
          const mediaUrl = mediaUrls.get(m.id);
          const seenCount = (messageReads.get(m.id) ?? []).filter((readerId) => readerId !== m.user_id).length;
          const storedMediaType = m.attachment_type || (m.image_url ? 'image/legacy' : '');
          const isRecordedWebm = storedMediaType === 'video/webm' && isVoiceMessage(m);
          const mediaType = isRecordedWebm ? 'audio/webm' : storedMediaType;
          return (
            <div id={`chat-message-${m.id}`} key={m.id} className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')} aria-label={`${mine ? 'رسالتك' : `رسالة من ${a?.display_name ?? 'عضو'}`}`}>
              <Avatar name={a?.display_name} url={a?.avatar_url} size={32} />
              <div className={cn('flex min-w-0 max-w-[82%] flex-col gap-1 sm:max-w-[76%]', mine ? 'items-end' : 'items-start')}>
                <div className={cn('w-fit max-w-full overflow-hidden rounded-2xl', mine ? 'bg-[#f4ece2]' : 'bg-[#f1f0ed]')}>
                  {m.reply_to_id && (
                    <button
                      type="button"
                      onClick={() => void jumpToRepliedMessage(m.reply_to_id!)}
                      className="mx-2 mt-2 block max-w-[calc(100%-1rem)] border-r-2 border-coral/60 px-2 text-start"
                    >
                      <span className="block truncate text-[10px] font-semibold text-coral">{repliedAuthor}</span>
                      <span className="block max-w-full truncate text-xs text-slate-500">{repliedMessage?.content || repliedMessage?.attachment_name || (repliedMessage ? 'مرفق' : 'عرض الرسالة')}</span>
                    </button>
                  )}
                  {mediaUrl && mediaType.startsWith('image/') && (
                    <button
                      type="button"
                      onClick={() => { setImagePreview({ url: mediaUrl, name: m.attachment_name ?? 'صورة مشتركة' }); setImageZoom(1); }}
                      aria-label="تكبير الصورة"
                      className="group m-1 block max-w-[calc(100%-0.5rem)] overflow-hidden rounded-xl text-right"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl} alt={m.attachment_name ?? 'صورة مشتركة'} loading="lazy" className="max-h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    </button>
                  )}
                  {mediaUrl && mediaType.startsWith('audio/') && <div className="px-3 py-2"><VoiceMessage src={mediaUrl} waveform={m.waveform} /></div>}
                  {mediaUrl && mediaType.startsWith('video/') && <div className="p-1"><VideoMessage src={mediaUrl} filename={m.attachment_name} /></div>}
                  {mediaUrl && !mediaType.startsWith('image/') && !mediaType.startsWith('audio/') && !mediaType.startsWith('video/') && (
                    <a href={mediaUrl} download={m.attachment_name ?? true} className="m-2 flex max-w-full items-center gap-2 rounded-xl bg-[#5b4631]/[.04] px-3 py-2 text-sm text-coral transition hover:bg-[#5b4631]/[.08]">
                      <FileText size={17} className="shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{m.attachment_name ?? 'تنزيل المرفق'}</span>
                    </a>
                  )}
                  {editingMessageId === m.id ? (
                    <form onSubmit={(event) => void saveMessageEdit(m, event)} className="space-y-2 p-2.5">
                      <textarea
                        autoFocus
                        dir="auto"
                        value={editingMessageContent}
                        onChange={(event) => setEditingMessageContent(event.target.value)}
                        maxLength={2000}
                        aria-label="تعديل نص الرسالة"
                        className="max-h-40 min-h-20 w-full resize-y rounded-lg border border-[#5b4631]/15 bg-white px-3 py-2 text-sm leading-6 text-[#40382f] outline-none focus:border-coral"
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" disabled={savingMessageId === m.id} onClick={() => { setEditingMessageId(null); setEditingMessageContent(''); }} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-white disabled:opacity-50">إلغاء</button>
                        <button type="submit" disabled={savingMessageId === m.id || editingMessageContent.length > 2000} className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50">{savingMessageId === m.id ? 'جارٍ الحفظ…' : 'حفظ'}</button>
                      </div>
                    </form>
                  ) : m.content && <p dir="auto" className="whitespace-pre-wrap break-words px-3 pt-2.5 text-sm leading-6 text-[#40382f]">{m.content}</p>}
                  {m.mentions?.length ? <div className="flex flex-wrap gap-1 px-3 pt-2">{m.mentions.map((id) => people.get(id)).filter((person): person is Profile => !!person).map((person) => <span key={person.id} className="rounded-full bg-coral/10 px-2 py-0.5 text-[10px] text-coral">@{person.display_name}</span>)}</div> : null}
                  <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1">
                    <time className="text-[10px] leading-4 text-slate-500">{new Date(m.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</time>
                    {mine && (m.delivery_state === 'pending'
                      ? <span title="بانتظار الاتصال لإرسال الرسالة" aria-label="بانتظار الإرسال" className="flex h-3 w-3 items-center justify-center rounded-full border border-amber-600/70" />
                      : m.delivery_state === 'failed'
                        ? <X size={12} className="text-red-600" aria-label="تعذر الإرسال" />
                        : seenCount
                          ? <span title={`شوهدت من ${seenCount} أعضاء`} aria-label={`شوهدت من ${seenCount} أعضاء`} className="inline-flex items-center gap-0.5 text-coral"><CheckCheck size={14} /><span className="text-[9px]">{seenCount}</span></span>
                          : <Check size={13} className="text-slate-400" aria-label="تم الإرسال إلى الخادم" />)}
                    {profile?.is_owner && <button type="button" onClick={() => void togglePin(m)} disabled={pinningMessageId === m.id} aria-label={m.pinned ? 'إلغاء تثبيت الرسالة' : 'تثبيت الرسالة'} className="text-slate-400 transition hover:text-coral disabled:opacity-50"><Pin size={13} fill={m.pinned ? 'currentColor' : 'none'} /></button>}
                    {!m.delivery_state && <button type="button" onClick={() => { setReplyTo(m); setEditingMessageId(null); setEditingMessageContent(''); }} aria-label="الرد على الرسالة" className="inline-flex items-center gap-1 text-[10px] text-slate-500 transition hover:text-coral"><Reply size={13} /> رد</button>}
                    {canEditMessage(m) && editingMessageId !== m.id && <button type="button" onClick={() => startEditingMessage(m)} className="text-[10px] text-slate-500 transition hover:text-coral">تعديل</button>}
                    {(mine || profile?.is_owner) && <button type="button" onClick={() => setMessageToDelete(m)} className="text-[10px] text-red-600 transition hover:text-red-800">حذف</button>}
                  </div>
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
                <button type="button" onClick={() => setImageZoom((zoom) => Math.max(1, zoom - 0.25))} aria-label="تصغير الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ZoomOut size={17} /></button>
                <button type="button" onClick={() => setImageZoom((zoom) => Math.min(3, zoom + 0.25))} aria-label="تكبير الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ZoomIn size={17} /></button>
                <button type="button" onClick={() => { setImagePreview(null); setImageZoom(1); }} aria-label="إغلاق الصورة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X size={17} /></button>
              </div>
            </div>
            <div className="scroll-thin max-h-[82vh] max-w-[92vw] overflow-auto rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview.url} alt={imagePreview.name} className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl transition-transform duration-200" style={{ transform: `scale(${imageZoom})` }} />
            </div>
          </div>
        </div>
      )}
      <form onSubmit={send} className="w-full border-t border-white/10 p-4">
        <div className="mx-auto w-full max-w-4xl">
        {replyTo && <div className="mb-3 flex items-center gap-3 rounded-xl border-r-2 border-coral bg-[#f7f4ef] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-coral">الرد على {people.get(replyTo.user_id)?.display_name ?? 'عضو'}</p>
            <p dir="auto" className="truncate text-xs text-slate-600">{replyTo.content || replyTo.attachment_name || 'مرفق'}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="إلغاء الرد" className="shrink-0 rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-coral"><X size={15} /></button>
        </div>}
        {recording && <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#f7f4ef] px-3 py-2">
          <div dir="ltr" aria-label="الترددات المباشرة للرسالة الصوتية" className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden">{audioLevels.map((level, index) => <span key={index} className="w-[3px] shrink-0 rounded-full bg-coral" style={{ height: `${Math.max(4, level)}%` }} />)}</div>
          <button type="button" onClick={cancelRecording} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-red-700 transition hover:bg-red-50">إلغاء</button>
          <button type="button" onClick={toggleRecording} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-coral px-2.5 py-1.5 text-xs font-semibold text-white"><CircleStop size={14} /> إيقاف ومراجعة</button>
        </div>}
        {file && (audioPreviewUrl
          ? <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#f7f4ef] px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">التسجيل الصوتي</span>
              <div className="min-w-[12rem] flex-1"><VoiceMessage src={audioPreviewUrl} waveform={fileWaveform} /></div>
              <button type="button" onClick={clearAttachment} aria-label="إلغاء التسجيل الصوتي" className="rounded-full p-1.5 text-red-700 transition hover:bg-red-50"><X size={16} /></button>
            </div>
          : <p className="mb-3 flex items-center gap-2 text-xs text-slate-600"><span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-coral/30 bg-coral/10 px-3 py-1"><Paperclip size={14} className="shrink-0" /><span className="truncate">{file.name}</span></span><button type="button" onClick={clearAttachment} aria-label="إزالة المرفق المحدد" className="text-slate-500 hover:text-coral"><X size={15} /></button></p>)}
        <div className="flex items-center gap-2">
          <label aria-label="إرفاق ملف" className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:border-coral/50"><Paperclip size={18} /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/*,video/*,application/pdf,text/plain,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button type="button" onClick={toggleRecording} disabled={!!file || recording} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm transition hover:border-coral/50 disabled:opacity-50" aria-label="تسجيل رسالة صوتية"><Mic size={17} /><span className="hidden sm:inline">صوت</span></button>
          <MentionTextarea value={text} onChange={setText} people={[...people.values()].filter((person) => (person.is_approved && !person.is_rejected) || person.is_owner)} mentionIds={mentionIds} onMentionIdsChange={setMentionIds} rows={1} maxLength={2000} placeholder="اكتب رسالة… استخدم @ للإشارة" className="mt-0 min-w-0 flex-1" />
          <Button type="submit" aria-label={audioPreviewUrl ? 'إرسال التسجيل الصوتي' : 'إرسال الرسالة'} disabled={!text.trim() && !file} className="inline-flex items-center gap-1.5 px-3 sm:px-5"><Send size={16} /><span className="hidden sm:inline">{audioPreviewUrl ? 'إرسال التسجيل' : 'إرسال'}</span></Button>
        </div>
        </div>
      </form>
      {messageToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#352f28]/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingMessage) setMessageToDelete(null); }}>
        <Card role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-xs p-4 shadow-2xl">
          <div className="mb-3 flex justify-end"><button type="button" aria-label="إغلاق" disabled={deletingMessage} onClick={() => setMessageToDelete(null)} className="rounded-full p-1.5 text-slate-500 transition hover:bg-black/5 hover:text-[#352f28]"><X size={17} /></button></div>
          <div className="flex items-center gap-3">
            <Avatar name={profile?.display_name} url={profile?.avatar_url} size={38} />
            <div className="min-w-0"><p id="delete-message-title" className="truncate font-semibold">{profile?.display_name ?? 'حسابي'}</p><p className="text-xs text-slate-500"><span className="font-semibold text-red-700">حذف</span> هذه الرسالة؟</p></div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={deletingMessage} onClick={() => setMessageToDelete(null)}>إلغاء</Button>
            <Button type="button" disabled={deletingMessage} onClick={() => { if (messageToDelete) void deleteMessage(messageToDelete); }} className="bg-red-700 hover:bg-red-800">{deletingMessage ? 'جارٍ الحذف…' : 'احذف الرسالة'}</Button>
          </div>
        </Card>
      </div>}
      {channelToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#352f28]/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingChannelId) setChannelToDelete(null); }}>
        <Card role="alertdialog" aria-modal="true" aria-labelledby="delete-channel-title" className="w-full max-w-xs p-4 shadow-2xl">
          <div className="mb-3 flex justify-end"><button type="button" aria-label="إغلاق" disabled={deletingChannelId !== null} onClick={() => { setChannelToDelete(null); setChannelError(''); }} className="rounded-full p-1.5 text-slate-500 transition hover:bg-black/5 hover:text-[#352f28]"><X size={17} /></button></div>
          <div className="flex items-center gap-3">
            <Avatar name={profile?.display_name} url={profile?.avatar_url} size={38} />
            <div className="min-w-0">
              <p id="delete-channel-title" className="truncate font-semibold"><span className="text-red-700">حذف</span> #{channelToDelete.name}؟</p>
              <p className="text-xs text-slate-500">ستُحذف رسائل الغرفة ومرفقاتها.</p>
            </div>
          </div>
          {channelError && <p role="status" className="mt-3 text-xs text-red-500">{channelError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={deletingChannelId !== null} onClick={() => { setChannelToDelete(null); setChannelError(''); }}>إلغاء</Button>
            <Button type="button" disabled={deletingChannelId !== null} onClick={() => void deleteChannel(channelToDelete)} className="bg-red-700 hover:bg-red-800">{deletingChannelId === channelToDelete.id ? 'جارٍ الحذف…' : 'احذف الغرفة'}</Button>
          </div>
        </Card>
      </div>}
      </section>
    </div>
  );
}
