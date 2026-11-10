import { supabase } from '@/lib/supabase';

export async function sendJoinRequestNotice() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('تعذر التحقق من جلسة الحساب.');
  if (!session) throw new Error('سجّل الدخول لإرسال طلب الانضمام.');

  const response = await fetch('/api/join-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  const result = await response.json() as { error?: string; alreadySent?: boolean };
  if (!response.ok) throw new Error(result.error || 'تعذر إرسال طلب الانضمام إلى بريد المالك.');
  return result;
}
