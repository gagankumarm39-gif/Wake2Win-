-- Wake2Win — AI Test Generator & AI Notes Studio
-- Run via: supabase db push  (or paste into the Supabase SQL editor)
--
-- Two self-contained feature tables. No existing table is altered.
-- Both are plain "own rows" data (no secrets), so — like reminders and
-- pomodoro_sessions — the browser may read/write them directly under RLS.

-- ── AI-generated mock tests ──────────────────────────────
create table ai_tests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  -- Exam registry id, e.g. 'neet', 'jee-main', 'cbse' (extensible — new
  -- exams need no migration, only a registry entry).
  exam text not null,
  exam_name text not null,
  -- Full TestConfig snapshot (subjects, chapters, difficulty, counts,
  -- negative marking, duration) so old tests survive registry changes.
  config jsonb not null,
  -- Chapter-wise question distribution the AI planned before generating.
  blueprint jsonb not null default '[]'::jsonb,
  -- TestQuestion[] — includes answers/explanations (needed for review mode;
  -- grading is still done server-side on submit).
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('ready', 'in_progress', 'completed')),
  -- Student progress: answers keyed by question id, flagged ids, position,
  -- remaining time — everything needed to resume an unfinished attempt.
  answers jsonb not null default '{}'::jsonb,
  flagged jsonb not null default '[]'::jsonb,
  current_index int not null default 0,
  time_left_seconds int,
  started_at timestamptz,
  completed_at timestamptz,
  score numeric(7,2),
  total_marks numeric(7,2) not null default 0,
  -- TestAnalysis computed on submit (accuracy, weak chapters, mistakes…).
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_tests_user_time on ai_tests (user_id, created_at desc);

-- ── AI-generated short notes ─────────────────────────────
create table ai_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  exam text not null,
  exam_name text not null,
  subject text not null,
  chapter text not null,
  language text not null default 'English',
  length text not null default '1 Page',
  focus text not null default 'NCERT Only',
  -- The generated markdown.
  content text not null,
  -- Generated add-ons keyed by kind: flashcards (JSON cards), checklist,
  -- lastminute, conceptmap, formulas, reactions, definitions, summary.
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_notes_user_time on ai_notes (user_id, created_at desc);

-- ── updated_at maintenance ───────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_ai_tests_touch
  before update on ai_tests
  for each row execute function touch_updated_at();

create trigger trg_ai_notes_touch
  before update on ai_notes
  for each row execute function touch_updated_at();

-- ── Row Level Security ───────────────────────────────────
alter table ai_tests enable row level security;
alter table ai_notes enable row level security;

create policy "own ai tests" on ai_tests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own ai notes" on ai_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
