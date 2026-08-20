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
  status       text        check (status in ('doing', 'waiting')),
  collapsed    boolean     not null default true,
  position     double precision not null default 0,
  subtasks     jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- מיגרציות. הקובץ כולו בטוח להרצה חוזרת — אם הטבלה כבר קיימת
-- מגרסה קודמת, השורות האלה משלימות את מה שחסר בלי לפגוע בנתונים.
-- ------------------------------------------------------------
alter table public.tasks add column if not exists status text;

-- שיוך ללקוח, שעת ביצוע מתוכננת, ומדידת זמן בפועל
alter table public.tasks add column if not exists client      text;
alter table public.tasks add column if not exists planned_at  text;   -- 'HH:MM'
alter table public.tasks add column if not exists started_at  timestamptz;
alter table public.tasks add column if not exists finished_at timestamptz;

-- היום שממנו המשימה נדחתה — כדי שהיא תמשיך להופיע גם ביום המקורי
alter table public.tasks add column if not exists moved_from date;

-- קטגוריה: עבודה / שיווק אישי / אישי
alter table public.tasks add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_category_check'
  ) then
    alter table public.tasks
      add constraint tasks_category_check
      check (category in ('work', 'marketing', 'personal'));
  end if;
end
$$;

create index if not exists tasks_user_category_idx    on public.tasks (user_id, category);
create index if not exists tasks_user_client_idx     on public.tasks (user_id, client);
create index if not exists tasks_user_movedfrom_idx  on public.tasks (user_id, moved_from);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_status_check'
  ) then
    alter table public.tasks
      add constraint tasks_status_check check (status in ('doing', 'waiting'));
  end if;
end
$$;

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

-- ============================================================
--  מנויים והוצאות — בקרה על ההוצאות החודשיות
-- ============================================================

-- ------------------------------------------------------------
-- מנויים קבועים (סונו, מיד'ג'רני וכו'). הרשומה הזאת היא ההגדרה
-- של המנוי — כמה הוא עולה ומתי הוא מחויב. החיובים עצמם נשמרים
-- בטבלת expenses, כדי שביטול מנוי לא ימחק את מה שכבר שולם.
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  name         text    not null check (char_length(name) between 1 and 120),
  amount       numeric(10,2) not null default 0,
  billing_day  int     not null default 1 check (billing_day between 1 and 28),
  active       boolean not null default true,
  started_on   date,
  cancelled_on date,
  note         text,
  position     double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists subs_user_idx on public.subscriptions (user_id, active);

-- ------------------------------------------------------------
-- הוצאות. שני סוגים:
--   'subscription' — חיוב חודשי שנוצר אוטומטית ממנוי פעיל
--   'oneoff'       — רכישה חד־פעמית, למשל קרדיטים נוספים
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  spend_date      date not null,
  title           text not null check (char_length(title) between 1 and 200),
  amount          numeric(10,2) not null default 0,
  kind            text not null default 'oneoff'
                    check (kind in ('oneoff', 'subscription')),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  period          text,     -- 'YYYY-MM' לחיוב מנוי, כדי למנוע כפילות
  client          text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ההוצאה כבר נגבתה בדף הבנק — סימון עצמאי, לא קיזוז מול תקבול מסוים
alter table public.expenses add column if not exists settled_bank boolean not null default false;

create index if not exists expenses_user_date_idx on public.expenses (user_id, spend_date);

-- חיוב אחד בלבד לכל מנוי בכל חודש
create unique index if not exists expenses_sub_period_idx
  on public.expenses (user_id, subscription_id, period)
  where subscription_id is not null;

-- ------------------------------------------------------------
-- RLS לשתי הטבלאות החדשות
-- ------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.expenses      enable row level security;

drop policy if exists "subs_select_own" on public.subscriptions;
drop policy if exists "subs_insert_own" on public.subscriptions;
drop policy if exists "subs_update_own" on public.subscriptions;
drop policy if exists "subs_delete_own" on public.subscriptions;

create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "subs_insert_own" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subs_update_own" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subs_delete_own" on public.subscriptions
  for delete using (auth.uid() = user_id);

drop policy if exists "expenses_select_own" on public.expenses;
drop policy if exists "expenses_insert_own" on public.expenses;
drop policy if exists "expenses_update_own" on public.expenses;
drop policy if exists "expenses_delete_own" on public.expenses;

create policy "expenses_select_own" on public.expenses
  for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on public.expenses
  for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_delete_own" on public.expenses
  for delete using (auth.uid() = user_id);

drop trigger if exists subs_touch_updated_at on public.subscriptions;
create trigger subs_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- תנועות שהגיעו מדף הבנק נושאות את המזהה של הבנק, שאינו uuid.
-- source_id נשאר uuid לקישור פנימי; source_ref מחזיק מזהה חיצוני.
-- ------------------------------------------------------------
alter table public.pot_txns add column if not exists source_ref text;

-- משימה שממתינה בלוח השבועי לשיבוץ — שומרת תאריך, אבל לא יושבת על היום
alter table public.tasks add column if not exists unplanned boolean not null default false;
