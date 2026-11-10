export const SPECIALTIES = [
  { id: 'frontend', label: 'تطوير الواجهات' },
  { id: 'backend', label: 'تطوير الخلفية' },
  { id: 'fullstack', label: 'تطوير متكامل' },
  { id: 'mobile', label: 'تطبيقات الجوال' },
  { id: 'ui_ux', label: 'تصميم UI / UX' },
  { id: 'devops', label: 'DevOps' },
  { id: 'ai', label: 'الذكاء الاصطناعي والبيانات' },
  { id: 'qa', label: 'ضمان الجودة والأمان' },
  { id: 'content_writer', label: 'كتابة المحتوى' }
] as const;

export type Specialty = (typeof SPECIALTIES)[number]['id'];
export const specialtyLabel = (id?: string | null) => SPECIALTIES.find((s) => s.id === id)?.label ?? 'غير محدد';

export interface Profile {
  id: string;
  display_name: string;
  specialty: Specialty | null;
  bio: string | null;
  avatar_url: string | null;
  job_title?: string | null;
  experience_years?: number | null;
  resume_path?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  is_owner: boolean;
  approved: boolean;
  onboarded: boolean;
  created_at: string;
}
export interface Message {
  id: number;
  user_id: string;
  content: string | null;
  image_url: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  waveform?: number[];
  channel_id?: string;
  mentions?: string[];
  reply_to_id?: number | null;
  pinned?: boolean;
  created_at: string;
}
export interface MessageReaction { message_id: number; user_id: string; emoji: string }
export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export interface Task { id: number; author_id: string; title: string; body: string | null; status: TaskStatus; assigned_to?: string | null; due_date?: string | null; priority?: TaskPriority; pinned: boolean; created_at: string }
export interface Reply { id: number; task_id: number; author_id: string; body: string; mentions?: string[]; created_at: string }
export interface TaskAttachment { id: number; task_id: number; uploaded_by: string; storage_path: string; file_name: string; mime_type: string; created_at: string }
export interface ChatChannel { id: string; name: string; description: string | null; created_at: string }
export interface TeamNotification { id: number; user_id: string; actor_id: string | null; kind: string; body: string; task_id: number | null; message_id: number | null; channel_id: string | null; created_at: string; read_at: string | null }
export interface Online { id: string; name: string; avatar: string | null; path: string }
