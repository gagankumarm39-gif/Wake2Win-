-- Wake2Win — AI usage quota + premium entitlements
-- Run via: supabase db push  (or paste into the Supabase SQL editor)
--
-- ai_usage is the tamper-proof quota ledger: rows are written ONLY by the
-- server (service role). Browsers may read their own rows (to show "next
-- free test at …") but can never insert or delete — so deleting a test from
-- history does NOT reset the 24h free-test quota.

create table ai_usage (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('test', 'notes')),
  created_at timestamptz not null default now()
);

create index idx_ai_usage_user_kind_time on ai_usage (user_id, kind, created_at desc);

alter table ai_usage enable row level security;

-- Read-only for the owner; no insert/update/delete policy on purpose —
-- the service role bypasses RLS and is the only writer.
create policy "read own ai usage" on ai_usage
  for select using (auth.uid() = user_id);

-- ── Premium entitlements (future billing hook) ───────────
-- A row here marks a premium user; premium_until null = lifetime.
-- Written by the server only (no client policies beyond select).
create table ai_entitlements (
  user_id uuid primary key references profiles(id) on delete cascade,
  premium boolean not null default false,
  premium_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table ai_entitlements enable row level security;

create policy "read own entitlements" on ai_entitlements
  for select using (auth.uid() = user_id);
