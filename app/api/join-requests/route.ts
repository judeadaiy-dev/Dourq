import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL;
  const ownerEmail = process.env.TEAMHUB_OWNER_EMAIL?.trim().toLowerCase();
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !resendApiKey || !resendFrom || !ownerEmail) {
    console.error('Join request email is not configured. Set the required server environment variables.');
    return NextResponse.json({ error: 'إرسال البريد غير مهيأ بعد. أبلغ مدير المنصة.' }, { status: 503 });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 });
  const userId = user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: profile, error: profileError } = await admin
    .from('th_profiles')
    .select('display_name,specialty,is_approved,is_rejected,is_owner')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('Failed to validate join request profile:', profileError);
    return NextResponse.json({ error: 'تعذر التحقق من بيانات طلب الانضمام.' }, { status: 500 });
  }
  if (!profile || profile.is_approved || profile.is_rejected || profile.is_owner) {
    return NextResponse.json({ error: 'لا يوجد طلب انضمام صالح لهذا الحساب.' }, { status: 403 });
  }

  const { error: createError } = await admin.from('th_join_requests').upsert(
    { profile_id: userId, status: 'pending' },
    { onConflict: 'profile_id', ignoreDuplicates: true }
  );
  if (createError) {
    console.error('Failed to save join request:', createError);
    return NextResponse.json({ error: 'تعذر تسجيل طلب الانضمام. تحقق من تحديث قاعدة البيانات.' }, { status: 500 });
  }

  const { data: savedRequest, error: requestError } = await admin
    .from('th_join_requests')
    .select('status,attempts,updated_at')
    .eq('profile_id', userId)
    .single();
  if (requestError) {
    console.error('Failed to load join request state:', requestError);
    return NextResponse.json({ error: 'تعذر قراءة حالة طلب الانضمام.' }, { status: 500 });
  }
  if (savedRequest.status === 'sent') return NextResponse.json({ alreadySent: true });
  if (savedRequest.attempts >= 5 && savedRequest.status === 'failed') {
    return NextResponse.json({ error: 'وصل الطلب إلى الحد الأقصى لمحاولات البريد. تواصل مع مدير المنصة.' }, { status: 429 });
  }

  const staleSending = savedRequest.status === 'sending'
    && Date.now() - Date.parse(savedRequest.updated_at) > 5 * 60 * 1000;
  if (savedRequest.status === 'sending' && !staleSending) {
    return NextResponse.json({ alreadySent: true }, { status: 202 });
  }
  if (!['pending', 'failed'].includes(savedRequest.status) && !staleSending) {
    return NextResponse.json({ error: 'حالة طلب الانضمام غير صالحة.' }, { status: 409 });
  }

  const claimQuery = admin.from('th_join_requests')
    .update({ status: 'sending', attempts: savedRequest.attempts + 1, updated_at: new Date().toISOString() })
    .eq('profile_id', userId);
  const { data: claim, error: claimError } = staleSending
    ? await claimQuery.eq('status', 'sending').eq('updated_at', savedRequest.updated_at).select('profile_id').maybeSingle()
    : await claimQuery.eq('status', savedRequest.status).select('profile_id').maybeSingle();
  if (claimError) {
    console.error('Failed to claim join request email:', claimError);
    return NextResponse.json({ error: 'تعذر تجهيز رسالة طلب الانضمام.' }, { status: 500 });
  }
  if (!claim) return NextResponse.json({ alreadySent: true }, { status: 202 });

  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '');
  const specialty = profile.specialty ? `التخصص: ${profile.specialty}\n` : '';
  async function markRequestFailed() {
    const { error } = await admin.from('th_join_requests').update({
      status: 'failed',
      updated_at: new Date().toISOString()
    }).eq('profile_id', userId).eq('status', 'sending');
    if (error) console.error('Failed to mark join request email as failed:', error);
  }
  const text = [
    'وصلك طلب انضمام جديد إلى TeamHub.',
    `الاسم: ${profile.display_name}`,
    `البريد الإلكتروني: ${user.email ?? 'غير متاح'}`,
    specialty.trimEnd(),
    siteUrl ? `راجع الطلب من لوحة المدير: ${siteUrl}/admin` : 'راجع طلب الانضمام من لوحة المدير داخل المنصة.'
  ].filter(Boolean).join('\n');

  let emailResponse: Response;
  try {
    emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resendFrom,
        to: [ownerEmail],
        subject: `طلب انضمام جديد إلى TeamHub: ${profile.display_name}`,
        text
      })
    });
  } catch (error) {
    console.error('Resend request failed:', error);
    await markRequestFailed();
    return NextResponse.json({ error: 'تعذر الاتصال بخدمة البريد. حاول مجددًا لاحقًا.' }, { status: 502 });
  }

  if (!emailResponse.ok) {
    const details = await emailResponse.text();
    console.error('Resend rejected join request email:', emailResponse.status, details);
    await markRequestFailed();
    return NextResponse.json({ error: 'رفضت خدمة البريد إرسال الطلب. تحقق من إعدادات Resend.' }, { status: 502 });
  }

  const { error: sentError } = await admin.from('th_join_requests').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('profile_id', userId).eq('status', 'sending');
  if (sentError) {
    console.error('Email was sent, but join request state could not be updated:', sentError);
    return NextResponse.json({ error: 'أُرسل البريد لكن تعذر تحديث حالة الطلب. أبلغ مدير المنصة.' }, { status: 500 });
  }
  return NextResponse.json({ alreadySent: false });
}
