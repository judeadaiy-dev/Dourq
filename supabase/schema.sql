-- ============================================================
-- TeamHub — مخطط قاعدة البيانات (شغّله كاملاً في Supabase > SQL Editor)
-- كل الأسماء بادئتها th_ / th- حتى لا تتعارض مع جداول موقعك الحالي (profiles, messages ...)
-- لا يلمس أي جدول أو trigger أو policy موجود مسبقاً. آمن لإعادة التشغيل.
-- يعيّن البريد الموثّق أدناه مالكاً للمساحة.
-- ============================================================

-- 1) الملفات الشخصية
create table if not exists public.th_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  specialty    text check (specialty in ('frontend','backend','fullstack','mobile','ui_ux','devops','ai','qa','content_writer')),
  bio          text check (bio is null or char_length(bio) <= 500),
  avatar_url   text,
  job_title    text check (job_title is null or char_length(job_title) <= 100),
  experience_years integer check (experience_years is null or experience_years between 0 and 60),
  resume_path  text,
  linkedin_url text check (linkedin_url is null or char_length(linkedin_url) <= 2048),
  github_url   text check (github_url is null or char_length(github_url) <= 2048),
  is_owner     boolean not null default false,
  is_approved boolean not null default false,
  is_rejected boolean not null default false,
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.th_profiles enable row level security;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'th_profiles' and column_name = 'approved'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'th_profiles' and column_name = 'is_approved'
  ) then
    alter table public.th_profiles rename column approved to is_approved;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'th_profiles' and column_name = 'is_approved'
  ) then
    alter table public.th_profiles add column is_approved boolean not null default false;
  end if;
end $$;
alter table public.th_profiles add column if not exists is_rejected boolean not null default false;
alter table public.th_profiles alter column is_approved set default false;
alter table public.th_profiles drop constraint if exists th_profiles_specialty_check;
alter table public.th_profiles add constraint th_profiles_specialty_check
  check (specialty is null or specialty in ('frontend','backend','fullstack','mobile','ui_ux','devops','ai','qa','content_writer'));
alter table public.th_profiles add column if not exists job_title text check (job_title is null or char_length(job_title) <= 100);
alter table public.th_profiles add column if not exists experience_years integer check (experience_years is null or experience_years between 0 and 60);
alter table public.th_profiles add column if not exists resume_path text;
alter table public.th_profiles add column if not exists linkedin_url text check (linkedin_url is null or char_length(linkedin_url) <= 2048);
alter table public.th_profiles add column if not exists github_url text check (github_url is null or char_length(github_url) <= 2048);

create or replace function public.th_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_owner and lower(u.email) = 'bariqaday@gmail.com' and u.email_confirmed_at is not null
    from public.th_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
  ), false)
$$;

create or replace function public.th_is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (is_approved and not is_rejected) or is_owner from public.th_profiles where id = auth.uid()), false)
$$;
revoke all on function public.th_is_member() from public, anon;
grant execute on function public.th_is_member() to authenticated;

drop policy if exists "th_profiles_select" on public.th_profiles;
create policy "th_profiles_select" on public.th_profiles for select to authenticated
  using (
    id = auth.uid()
    or public.th_is_owner()
    or (public.th_is_member() and is_approved and not is_rejected)
  );
drop policy if exists "th_profiles_update_own" on public.th_profiles;
create policy "th_profiles_update_own" on public.th_profiles for update to authenticated
  using (id = auth.uid()) with check (
    id = auth.uid()
    and (avatar_url is null or avatar_url like auth.uid()::text || '/%')
    and (resume_path is null or resume_path like auth.uid()::text || '/%')
  );

-- لا إدخال مباشر، ولا تعديل لـ is_owner أبداً
revoke insert, update on public.th_profiles from authenticated, anon;
grant update (display_name, specialty, bio, avatar_url, job_title, experience_years, resume_path, linkedin_url, github_url, onboarded) on public.th_profiles to authenticated;
drop policy if exists "th_profiles_approve" on public.th_profiles;
create policy "th_profiles_approve" on public.th_profiles for update to authenticated
  using (public.th_is_owner()) with check (public.th_is_owner());

create or replace function public.th_approve_member(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.th_is_owner() then raise exception 'not authorized'; end if;
  update public.th_profiles set is_approved = true, is_rejected = false
    where id = p_profile_id and is_owner = false and is_rejected = false;
  if not found then raise exception 'pending member not found'; end if;
end $$;
revoke all on function public.th_approve_member(uuid) from public, anon;
grant execute on function public.th_approve_member(uuid) to authenticated;

create or replace function public.th_reject_member(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.th_is_owner() then raise exception 'not authorized'; end if;
  update public.th_profiles set is_approved = false, is_rejected = true
    where id = p_profile_id and is_owner = false and is_approved = false and is_rejected = false;
  if not found then raise exception 'member not found or cannot be rejected'; end if;
end $$;
revoke all on function public.th_reject_member(uuid) from public, anon;
grant execute on function public.th_reject_member(uuid) to authenticated;

create table if not exists public.th_join_requests (
  profile_id uuid primary key references public.th_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.th_join_requests enable row level security;
revoke all on public.th_join_requests from public, anon, authenticated;
grant all on public.th_join_requests to service_role;

update public.th_profiles
set avatar_url = regexp_replace(avatar_url, '^.*/object/public/th-avatars/([^?]*).*$','\1')
where avatar_url like '%/object/public/th-avatars/%';

-- ينشئ الملف الشخصي عند أول دخول (يستدعيها التطبيق).
create or replace function public.th_ensure_profile(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare owner_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select lower(email) into owner_email from auth.users
    where id = auth.uid() and email_confirmed_at is not null;
  insert into public.th_profiles (id, display_name, is_owner, is_approved)
    values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Member'),
      coalesce(owner_email = 'bariqaday@gmail.com', false),
      coalesce(owner_email = 'bariqaday@gmail.com', false))
  on conflict (id) do nothing;
end $$;
revoke all on function public.th_ensure_profile(text) from public, anon;
grant execute on function public.th_ensure_profile(text) to authenticated;

-- Topic channels; the general channel is the default for existing and new chat messages.
create table if not exists public.th_channels (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  created_by uuid references public.th_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.th_channels add column if not exists created_by uuid references public.th_profiles(id) on delete set null default auth.uid();
insert into public.th_channels (id, name, description, created_by) values
  ('general', 'عام', 'الإعلانات والنقاشات العامة', null),
  ('design', 'تصميم', 'التصميم وتجربة المستخدم', null),
  ('development', 'برمجة', 'النقاشات التقنية والتطوير', null)
on conflict (id) do update set name = excluded.name, description = excluded.description;
alter table public.th_channels enable row level security;
drop policy if exists "th_channels_select" on public.th_channels;
create policy "th_channels_select" on public.th_channels for select to authenticated using (public.th_is_member());
drop policy if exists "th_channels_insert_owner" on public.th_channels;
drop policy if exists "th_channels_insert_member" on public.th_channels;
create policy "th_channels_insert_member" on public.th_channels for insert to authenticated
  with check (public.th_is_member() and created_by = auth.uid());
drop policy if exists "th_channels_update_owner" on public.th_channels;
drop policy if exists "th_channels_update_creator" on public.th_channels;
create policy "th_channels_update_creator" on public.th_channels for update to authenticated
  using (public.th_is_member() and created_by = auth.uid())
  with check (public.th_is_member() and created_by = auth.uid());
drop policy if exists "th_channels_delete_creator" on public.th_channels;
create policy "th_channels_delete_creator" on public.th_channels for delete to authenticated
  using (public.th_is_member() and created_by = auth.uid() and id not in ('general', 'design', 'development'));
grant select on public.th_channels to authenticated;
grant insert, update on public.th_channels to authenticated;
grant delete on public.th_channels to authenticated;

-- إذا كان الحساب موجوداً مسبقاً، انقل صلاحية المالك إليه عند إعادة تشغيل المخطط.
do $$ begin
  update public.th_profiles set is_owner = false where is_owner;
  update public.th_profiles p set is_owner = true, is_approved = true, is_rejected = false
    from auth.users u where p.id = u.id and lower(u.email) = 'bariqaday@gmail.com' and u.email_confirmed_at is not null;
end $$;

update public.th_channels
set created_by = (select id from public.th_profiles where is_owner limit 1)
where created_by is null and id not in ('general', 'design', 'development');

-- 2) المحادثة
create table if not exists public.th_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  content    text check (content is null or char_length(content) <= 2000),
  image_url  text,
  attachment_path text,
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 255),
  attachment_type text check (attachment_type is null or char_length(attachment_type) <= 120),
  waveform jsonb not null default '[]'::jsonb check (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 80),
  channel_id text not null default 'general' references public.th_channels(id),
  mentions uuid[] not null default '{}'::uuid[],
  reply_to_id bigint references public.th_messages(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint th_messages_has_payload check (coalesce(trim(content), '') <> '' or image_url is not null or attachment_path is not null)
);
alter table public.th_messages add column if not exists attachment_path text;
alter table public.th_messages add column if not exists attachment_name text;
alter table public.th_messages add column if not exists attachment_type text;
alter table public.th_messages add column if not exists waveform jsonb not null default '[]'::jsonb;
alter table public.th_messages add column if not exists channel_id text not null default 'general';
alter table public.th_messages drop constraint if exists th_messages_channel_id_fkey;
alter table public.th_messages add constraint th_messages_channel_id_fkey
  foreign key (channel_id) references public.th_channels(id) on delete cascade;
alter table public.th_messages add column if not exists mentions uuid[] not null default '{}'::uuid[];
alter table public.th_messages add column if not exists reply_to_id bigint references public.th_messages(id) on delete set null;
alter table public.th_messages add column if not exists pinned boolean not null default false;
alter table public.th_messages drop constraint if exists th_messages_has_payload;
alter table public.th_messages add constraint th_messages_has_payload
  check (coalesce(trim(content), '') <> '' or image_url is not null or attachment_path is not null);
create index if not exists th_messages_created_idx on public.th_messages (created_at desc);
alter table public.th_messages enable row level security;
drop policy if exists "th_messages_select" on public.th_messages;
create policy "th_messages_select" on public.th_messages for select to authenticated
  using (public.th_is_member());
drop policy if exists "th_messages_insert" on public.th_messages;
create policy "th_messages_insert" on public.th_messages for insert to authenticated
  with check (public.th_is_member() and user_id = auth.uid() and image_url is null and
    created_at <= now() and
    (attachment_path is null or (storage.foldername(attachment_path))[1] = auth.uid()::text));
drop policy if exists "th_messages_delete" on public.th_messages;
create policy "th_messages_delete" on public.th_messages for delete to authenticated
  using (public.th_is_member() and (user_id = auth.uid() or public.th_is_owner()));
drop policy if exists "th_messages_update_own" on public.th_messages;
create policy "th_messages_update_own" on public.th_messages for update to authenticated
  using (public.th_is_member() and user_id = auth.uid() and created_at > now() - interval '10 minutes')
  with check (public.th_is_member() and user_id = auth.uid() and created_at > now() - interval '10 minutes');

create or replace function public.th_restrict_message_updates()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.content is distinct from old.content then
    if old.user_id <> auth.uid() or now() >= old.created_at + interval '10 minutes'
      or row(new.id, new.user_id, new.image_url, new.attachment_path, new.attachment_name,
        new.attachment_type, new.waveform, new.channel_id, new.mentions, new.reply_to_id,
        new.pinned, new.created_at)
        is distinct from
        row(old.id, old.user_id, old.image_url, old.attachment_path, old.attachment_name,
        old.attachment_type, old.waveform, old.channel_id, old.mentions, old.reply_to_id,
        old.pinned, old.created_at) then
      raise exception 'message content can only be edited by its author within ten minutes';
    end if;
    return new;
  end if;

  if new.pinned is distinct from old.pinned and public.th_is_owner()
    and row(new.id, new.user_id, new.content, new.image_url, new.attachment_path,
      new.attachment_name, new.attachment_type, new.waveform, new.channel_id,
      new.mentions, new.reply_to_id, new.created_at)
      is not distinct from
      row(old.id, old.user_id, old.content, old.image_url, old.attachment_path,
      old.attachment_name, old.attachment_type, old.waveform, old.channel_id,
      old.mentions, old.reply_to_id, old.created_at) then
    return new;
  end if;

  if new is distinct from old then
    raise exception 'message updates are restricted';
  end if;
  return new;
end $$;
drop trigger if exists th_messages_restrict_updates on public.th_messages;
create trigger th_messages_restrict_updates
  before update on public.th_messages
  for each row execute function public.th_restrict_message_updates();

create or replace function public.th_toggle_message_pin(p_message_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare next_pinned boolean;
begin
  if not public.th_is_owner() then raise exception 'not authorized'; end if;
  update public.th_messages set pinned = not pinned where id = p_message_id returning pinned into next_pinned;
  if next_pinned is null then raise exception 'message not found'; end if;
  return next_pinned;
end $$;
revoke all on function public.th_toggle_message_pin(bigint) from public, anon;
grant execute on function public.th_toggle_message_pin(bigint) to authenticated;

create table if not exists public.th_message_reads (
  message_id bigint not null references public.th_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.th_message_reads enable row level security;
drop policy if exists "th_message_reads_select" on public.th_message_reads;
create policy "th_message_reads_select" on public.th_message_reads for select to authenticated
  using (public.th_is_member());
drop policy if exists "th_message_reads_insert" on public.th_message_reads;
create policy "th_message_reads_insert" on public.th_message_reads for insert to authenticated
  with check (public.th_is_member() and user_id = auth.uid());
grant select, insert on public.th_message_reads to authenticated;

create table if not exists public.th_message_reactions (
  message_id bigint not null references public.th_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.th_message_reactions enable row level security;
drop policy if exists "th_message_reactions_select" on public.th_message_reactions;
create policy "th_message_reactions_select" on public.th_message_reactions for select to authenticated
  using (public.th_is_member());
drop policy if exists "th_message_reactions_insert" on public.th_message_reactions;
create policy "th_message_reactions_insert" on public.th_message_reactions for insert to authenticated
  with check (public.th_is_member() and user_id = auth.uid());
drop policy if exists "th_message_reactions_delete" on public.th_message_reactions;
create policy "th_message_reactions_delete" on public.th_message_reactions for delete to authenticated
  using (public.th_is_member() and user_id = auth.uid());

-- 3) المهام + التثبيت للمالك فقط
create table if not exists public.th_tasks (
  id         bigint generated always as identity primary key,
  author_id  uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 160),
  body       text check (body is null or char_length(body) <= 4000),
  status     text not null default 'open' check (status in ('open','in_progress','review','done')),
  assigned_to uuid references public.th_profiles(id) on delete set null,
  due_date   date,
  priority   text not null default 'medium' check (priority in ('low','medium','high')),
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.th_tasks add column if not exists assigned_to uuid references public.th_profiles(id) on delete set null;
alter table public.th_tasks add column if not exists due_date date;
alter table public.th_tasks add column if not exists priority text not null default 'medium';
alter table public.th_tasks drop constraint if exists th_tasks_status_check;
alter table public.th_tasks add constraint th_tasks_status_check check (status in ('open','in_progress','review','done'));
alter table public.th_tasks drop constraint if exists th_tasks_priority_check;
alter table public.th_tasks add constraint th_tasks_priority_check check (priority in ('low','medium','high'));
create index if not exists th_tasks_assigned_status_idx on public.th_tasks (assigned_to, status);
alter table public.th_tasks enable row level security;
drop policy if exists "th_tasks_select" on public.th_tasks;
create policy "th_tasks_select" on public.th_tasks for select to authenticated
  using (public.th_is_member());
drop policy if exists "th_tasks_insert" on public.th_tasks;
create policy "th_tasks_insert" on public.th_tasks for insert to authenticated
  with check (public.th_is_member() and author_id = auth.uid() and pinned = false and (
    assigned_to is null or exists (select 1 from public.th_profiles p where p.id = assigned_to and ((p.is_approved and not p.is_rejected) or p.is_owner))
  ));
drop policy if exists "th_tasks_update" on public.th_tasks;
create policy "th_tasks_update" on public.th_tasks for update to authenticated
  using (public.th_is_member() and (author_id = auth.uid() or public.th_is_owner())) with check (public.th_is_member() and (author_id = auth.uid() or public.th_is_owner()) and (
    assigned_to is null or exists (select 1 from public.th_profiles p where p.id = assigned_to and ((p.is_approved and not p.is_rejected) or p.is_owner))
  ));
drop policy if exists "th_tasks_delete" on public.th_tasks;
create policy "th_tasks_delete" on public.th_tasks for delete to authenticated
  using (public.th_is_member() and (author_id = auth.uid() or public.th_is_owner()));

create or replace function public.th_guard_task_pin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pinned is distinct from old.pinned and not public.th_is_owner() then
    raise exception 'Only the owner can pin tasks';
  end if;
  new.author_id := old.author_id;
  return new;
end $$;
drop trigger if exists th_tasks_guard_pin on public.th_tasks;
create trigger th_tasks_guard_pin before update on public.th_tasks
  for each row execute function public.th_guard_task_pin();

create or replace function public.th_update_task_status(p_task_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.th_is_member() then raise exception 'not authorized'; end if;
  if p_status not in ('open','in_progress','review','done') then raise exception 'invalid task status'; end if;
  update public.th_tasks set status = p_status
    where id = p_task_id and (assigned_to = auth.uid() or author_id = auth.uid() or public.th_is_owner());
  if not found then raise exception 'task not found or not authorized'; end if;
end $$;
revoke all on function public.th_update_task_status(bigint, text) from public, anon;
grant execute on function public.th_update_task_status(bigint, text) to authenticated;

create table if not exists public.th_task_replies (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references public.th_tasks(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  mentions   uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);
alter table public.th_task_replies add column if not exists mentions uuid[] not null default '{}'::uuid[];
create index if not exists th_task_replies_idx on public.th_task_replies (task_id, created_at);
alter table public.th_task_replies enable row level security;
drop policy if exists "th_replies_select" on public.th_task_replies;
create policy "th_replies_select" on public.th_task_replies for select to authenticated
  using (public.th_is_member());
drop policy if exists "th_replies_insert" on public.th_task_replies;
create policy "th_replies_insert" on public.th_task_replies for insert to authenticated
  with check (public.th_is_member() and author_id = auth.uid());
drop policy if exists "th_replies_delete" on public.th_task_replies;
create policy "th_replies_delete" on public.th_task_replies for delete to authenticated
  using (public.th_is_member() and (author_id = auth.uid() or public.th_is_owner()));

create table if not exists public.th_task_attachments (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.th_tasks(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references public.th_profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp','image/gif','text/plain')),
  created_at timestamptz not null default now()
);
create index if not exists th_task_attachments_task_idx on public.th_task_attachments (task_id, created_at);
alter table public.th_task_attachments enable row level security;
drop policy if exists "th_task_attachments_select" on public.th_task_attachments;
create policy "th_task_attachments_select" on public.th_task_attachments for select to authenticated using (public.th_is_member());
drop policy if exists "th_task_attachments_insert" on public.th_task_attachments;
create policy "th_task_attachments_insert" on public.th_task_attachments for insert to authenticated
  with check (public.th_is_member() and uploaded_by = auth.uid() and (storage.foldername(storage_path))[2] = auth.uid()::text);
drop policy if exists "th_task_attachments_delete" on public.th_task_attachments;
create policy "th_task_attachments_delete" on public.th_task_attachments for delete to authenticated
  using (public.th_is_member() and (uploaded_by = auth.uid() or public.th_is_owner() or exists (
    select 1 from public.th_tasks t where t.id = task_id and t.author_id = auth.uid()
  )));
grant select, insert, delete on public.th_task_attachments to authenticated;

create table if not exists public.th_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.th_profiles(id) on delete cascade,
  actor_id uuid references public.th_profiles(id) on delete set null,
  kind text not null check (kind in ('task_assigned','task_status','mention_chat','mention_task')),
  body text not null check (char_length(body) between 1 and 240),
  task_id bigint references public.th_tasks(id) on delete cascade,
  message_id bigint references public.th_messages(id) on delete cascade,
  channel_id text references public.th_channels(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
grant usage on schema public to authenticated;
create index if not exists th_notifications_user_created_idx on public.th_notifications (user_id, created_at desc);
alter table public.th_notifications enable row level security;
drop policy if exists "th_notifications_select_own" on public.th_notifications;
create policy "th_notifications_select_own" on public.th_notifications for select to authenticated
  using (public.th_is_member() and user_id = auth.uid());
drop policy if exists "th_notifications_update_own" on public.th_notifications;
create policy "th_notifications_update_own" on public.th_notifications for update to authenticated
  using (public.th_is_member() and user_id = auth.uid())
  with check (public.th_is_member() and user_id = auth.uid());
revoke insert, delete, update on public.th_notifications from authenticated, anon;
grant select on public.th_notifications to authenticated;
grant update (read_at) on public.th_notifications to authenticated;

create or replace function public.th_notify_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.assigned_to <> new.author_id and new.assigned_to <> auth.uid() then
    insert into public.th_notifications (user_id, actor_id, kind, body, task_id)
    values (new.assigned_to, auth.uid(), 'task_assigned', 'تم إسناد مهمة إليك: ' || new.title, new.id);
  end if;
  return new;
end $$;
drop trigger if exists th_tasks_notify_assignee on public.th_tasks;
create trigger th_tasks_notify_assignee after insert or update of assigned_to on public.th_tasks
  for each row execute function public.th_notify_task_assignment();

create or replace function public.th_notify_task_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_user uuid;
  status_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  status_label := case new.status
    when 'open' then 'قيد الانتظار'
    when 'in_progress' then 'قيد التنفيذ'
    when 'review' then 'قيد المراجعة'
    when 'done' then 'مكتملة'
    else new.status
  end;
  foreach target_user in array array(
    select distinct candidate
    from unnest(array[new.author_id, new.assigned_to]) as users(candidate)
    where candidate is not null
  ) loop
    if target_user <> auth.uid() then
      insert into public.th_notifications (user_id, actor_id, kind, body, task_id)
      values (target_user, auth.uid(), 'task_status', 'تغيرت حالة المهمة "' || new.title || '" إلى ' || status_label, new.id);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists th_tasks_notify_status on public.th_tasks;
create trigger th_tasks_notify_status after update of status on public.th_tasks
  for each row execute function public.th_notify_task_status();

create or replace function public.th_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mentioned_user uuid;
  actor uuid;
  task_ref bigint;
  message_ref bigint;
  channel_ref text;
  notification_kind text;
  notification_body text;
begin
  if tg_table_name = 'th_messages' then
    actor := new.user_id;
    task_ref := null;
    message_ref := new.id;
    channel_ref := new.channel_id;
    notification_kind := 'mention_chat';
    notification_body := 'أشار إليك في المحادثة';
  else
    actor := new.author_id;
    task_ref := new.task_id;
    message_ref := null;
    channel_ref := null;
    notification_kind := 'mention_task';
    notification_body := 'أشار إليك في نقاش مهمة';
  end if;

  foreach mentioned_user in array coalesce(new.mentions, '{}'::uuid[]) loop
    if mentioned_user <> actor and exists (
      select 1 from public.th_profiles where id = mentioned_user and ((is_approved and not is_rejected) or is_owner)
    ) then
      insert into public.th_notifications (user_id, actor_id, kind, body, task_id, message_id, channel_id)
      values (mentioned_user, actor, notification_kind, notification_body, task_ref, message_ref, channel_ref);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists th_messages_notify_mentions on public.th_messages;
create trigger th_messages_notify_mentions after insert on public.th_messages
  for each row execute function public.th_notify_mentions();
drop trigger if exists th_replies_notify_mentions on public.th_task_replies;
create trigger th_replies_notify_mentions after insert on public.th_task_replies
  for each row execute function public.th_notify_mentions();

do $$ begin alter publication supabase_realtime add table public.th_notifications; exception when duplicate_object then null; end $$;

-- 4) الوقت الحقيقي
do $$ begin alter publication supabase_realtime add table public.th_messages;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.th_channels;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.th_message_reads; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.th_message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.th_tasks;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.th_task_replies; exception when duplicate_object then null; end $$;

-- 5) التخزين (Buckets جديدة منفصلة)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('th-avatars', 'th-avatars', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('th-resumes', 'th-resumes', false, 10485760, array['application/pdf']),
  ('th-task-files', 'th-task-files', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','image/gif','text/plain']),
  ('th-chat', 'th-chat', false, 104857600, array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav',
    'video/*',
    'application/pdf','text/plain','application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ declare b text; begin
  foreach b in array array['th-avatars','th-resumes','th-task-files','th-chat'] loop
    execute format('drop policy if exists "%s_read" on storage.objects', b);
    if b = 'th-chat' then
      execute format('create policy "%s_read" on storage.objects for select to authenticated using (bucket_id = %L and public.th_is_member() and exists (select 1 from public.th_messages m where m.attachment_path = storage.objects.name or m.image_url like %L || storage.objects.name || %L))', b, b, '%/th-chat/', '%');
    elsif b = 'th-resumes' then
      execute format('create policy "%s_read" on storage.objects for select to authenticated using (bucket_id = %L and public.th_is_member() and exists (select 1 from public.th_profiles p where p.resume_path = storage.objects.name))', b, b);
    elsif b = 'th-task-files' then
      execute format('create policy "%s_read" on storage.objects for select to authenticated using (bucket_id = %L and public.th_is_member() and exists (select 1 from public.th_task_attachments a where a.storage_path = storage.objects.name))', b, b);
    else
      execute format('create policy "%s_read" on storage.objects for select to authenticated using (bucket_id = %L and public.th_is_member() and exists (select 1 from public.th_profiles p where p.avatar_url = storage.objects.name or p.avatar_url like %L || storage.objects.name || %L))', b, b, '%/th-avatars/', '%');
    end if;
    execute format('drop policy if exists "%s_upload_own" on storage.objects', b);
    if b = 'th-task-files' then
      execute format('create policy "%s_upload_own" on storage.objects for insert to authenticated with check (bucket_id = %L and public.th_is_member() and exists (select 1 from public.th_tasks t where t.id::text = (storage.foldername(name))[1]) and (storage.foldername(name))[2] = auth.uid()::text)', b, b);
    else
      execute format('create policy "%s_upload_own" on storage.objects for insert to authenticated with check (bucket_id = %L and public.th_is_member() and (storage.foldername(name))[1] = auth.uid()::text)', b, b);
    end if;
    execute format('drop policy if exists "%s_delete_own" on storage.objects', b);
    if b = 'th-task-files' then
      execute format('create policy "%s_delete_own" on storage.objects for delete to authenticated using (bucket_id = %L and public.th_is_member() and ((storage.foldername(name))[2] = auth.uid()::text or public.th_is_owner() or exists (select 1 from public.th_task_attachments a join public.th_tasks t on t.id = a.task_id where a.storage_path = storage.objects.name and t.author_id = auth.uid())))', b, b);
    else
      execute format('create policy "%s_delete_own" on storage.objects for delete to authenticated using (bucket_id = %L and public.th_is_member() and ((storage.foldername(name))[1] = auth.uid()::text or public.th_is_owner()))', b, b);
    end if;
  end loop;
end $$;

-- Refresh PostgREST's schema cache so the app can query newly-created tables immediately.
notify pgrst, 'reload schema';
