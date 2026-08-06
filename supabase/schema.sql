-- ============================================================
--  "המשימות שלי" — Supabase schema
--  הריצי את כל הקובץ פעם אחת ב-  Supabase → SQL Editor → New query
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- טבלת המשימות. תת-המשימות נשמרות כ-JSON בתוך המשימה הראשית.
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  task_date    date        not null,
  title        text        not null check (char_length(title) between 1 and 300),
  done         boolean     not null default false,
  completed_at timestamptz,
  collapsed    boolean     not null default true,
  position     double precision not null default 0,
  subtasks     jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);
create index if not exists tasks_user_open_idx on public.tasks (user_id, done, task_date);

-- ------------------------------------------------------------
-- Row Level Security — כל משתמש רואה ועורך אך ורק את השורות שלו.
-- בלי זה אף אחד לא יכול לגשת לטבלה דרך הדפדפן.
-- ------------------------------------------------------------
alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);

create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);

create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id)
              with check (auth.uid() = user_id);

create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- updated_at מתעדכן אוטומטית בכל שמירה
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();
