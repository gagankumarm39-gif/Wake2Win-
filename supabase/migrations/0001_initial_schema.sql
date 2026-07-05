-- Wake2Win — initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

create extension if not exists "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────
create type exam_type as enum ('NEET','JEE','UPSC','SSC','GATE','CAT','BOARDS');
create type difficulty_level as enum ('easy','medium','hard');
create type alarm_event_status as enum ('ringing','dismissed','snoozed','missed','abandoned');
create type mission_type as enum ('daily','weekly');
create type reminder_type as enum ('water','stretch','revision','sleep','mock_test');
create type question_source as enum ('gemini','openrouter','local');
create type suspicious_kind as enum ('app_switch','repeated_failures','timeout_abuse','fullscreen_exit');

-- ── Profiles (Feature 10) ────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  exam exam_type,
  target_rank text,
  target_college text,
  study_hours_per_day numeric(4,1) default 4,
  wake_up_goal time,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  onboarded boolean not null default false,
  xp bigint not null default 0,
  coins bigint not null default 0,
  level int not null default 1,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Alarms (Feature 1) ───────────────────────────────────
create table alarms (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null default 'Wake up!',
  time time not null,
  repeat_days smallint[] not null default '{}',       -- 0=Sun … 6=Sat, empty = one-off
  sound text not null default 'sunrise',
  volume smallint not null default 80 check (volume between 0 and 100),
  vibration boolean not null default true,
  snooze_enabled boolean not null default true,
  snooze_minutes smallint not null default 5,
  max_snoozes smallint not null default 1,
  question_count smallint not null default 3 check (question_count between 2 and 4),
  subject text not null,
  chapter text,
  difficulty difficulty_level not null default 'medium',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Alarm events + anti-cheat telemetry ──────────────────
create table alarm_events (
  id uuid primary key default uuid_generate_v4(),
  alarm_id uuid references alarms(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  fired_at timestamptz not null default now(),
  dismissed_at timestamptz,
  status alarm_event_status not null default 'ringing',
  questions_attempted int not null default 0,
  questions_correct int not null default 0,
  avg_solve_seconds numeric(6,2),
  app_switches int not null default 0,
  suspicious boolean not null default false
);

create table suspicious_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  alarm_event_id uuid references alarm_events(id) on delete cascade,
  kind suspicious_kind not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ── Question bank + attempts (Features 2, 3, 5) ──────────
create table question_bank (
  id uuid primary key default uuid_generate_v4(),
  exam exam_type not null,
  subject text not null,
  chapter text,
  difficulty difficulty_level not null,
  question text not null,
  options jsonb not null,               -- ["A","B","C","D"]
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text,
  hint text,
  verified boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_qbank_lookup on question_bank (exam, subject, difficulty);

create table question_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  alarm_event_id uuid references alarm_events(id) on delete set null,
  exam exam_type,
  subject text not null,
  chapter text,
  difficulty difficulty_level,
  source question_source not null,
  correct boolean not null,
  time_taken_seconds numeric(6,2),
  created_at timestamptz not null default now()
);
create index idx_attempts_user_time on question_attempts (user_id, created_at);

-- ── Pomodoro (Features 4, 5) ─────────────────────────────
create table pomodoro_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  focus_minutes smallint not null check (focus_minutes between 5 and 240),
  break_minutes smallint not null check (break_minutes in (5,10,15)),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completed boolean not null default false
);
create index idx_pomodoro_user_time on pomodoro_sessions (user_id, started_at);

-- ── Gamification (Feature 7) ─────────────────────────────
create table badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null,
  xp_reward int not null default 0
);

create table user_badges (
  user_id uuid not null references profiles(id) on delete cascade,
  badge_code text not null references badges(code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create table missions (
  code text primary key,
  title text not null,
  type mission_type not null,
  criteria jsonb not null,              -- e.g. {"metric":"study_minutes","target":120}
  xp_reward int not null default 50,
  coin_reward int not null default 10,
  active boolean not null default true
);

create table user_missions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  mission_code text not null references missions(code) on delete cascade,
  period_start date not null,
  progress numeric not null default 0,
  completed_at timestamptz,
  unique (user_id, mission_code, period_start)
);

-- ── Reminders (Feature 9) ────────────────────────────────
create table reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type reminder_type not null,
  time time not null,
  repeat_days smallint[] not null default '{0,1,2,3,4,5,6}',
  enabled boolean not null default true
);

-- ── Leaderboard (Feature 7) ──────────────────────────────
create view leaderboard as
  select id, display_name, exam, xp, level, current_streak
  from profiles
  order by xp desc
  limit 100;

-- ── Row Level Security ───────────────────────────────────
alter table profiles enable row level security;
alter table alarms enable row level security;
alter table alarm_events enable row level security;
alter table suspicious_events enable row level security;
alter table question_attempts enable row level security;
alter table pomodoro_sessions enable row level security;
alter table user_badges enable row level security;
alter table user_missions enable row level security;
alter table reminders enable row level security;
alter table question_bank enable row level security;
alter table badges enable row level security;
alter table missions enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own alarms" on alarms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alarm events" on alarm_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own suspicious" on suspicious_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own attempts" on question_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pomodoro" on pomodoro_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own user badges" on user_badges for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own user missions" on user_missions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminders" on reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read question bank" on question_bank for select using (auth.role() = 'authenticated');
create policy "read badges" on badges for select using (true);
create policy "read missions" on missions for select using (true);

-- ── Auto-create profile on signup ────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
