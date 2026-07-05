-- Wake2Win — per-student AI provider keys ("bring your own key")
-- Run via: supabase db push  (or paste into the Supabase SQL editor)
--
-- api_key holds an AES-256-GCM ciphertext produced server-side
-- (src/lib/crypto.ts, keyed by AI_KEY_ENCRYPTION_SECRET). The browser can
-- never read it: column-level privileges below hide it from the
-- `authenticated` role, and all writes go through server API routes using
-- the service role.

-- Question attempts can now originate from a student's own OpenAI/Anthropic key.
alter type question_source add value if not exists 'openai';
alter type question_source add value if not exists 'anthropic';

create table user_ai_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openrouter', 'openai', 'anthropic')),
  -- Encrypted, format "v1:<iv>:<tag>:<ciphertext>" (base64 parts).
  api_key text not null,
  default_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One key per provider per student — the upsert target.
  unique (user_id, provider)
);

create index idx_user_ai_keys_user on user_ai_keys (user_id);

create or replace function touch_user_ai_keys_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_ai_keys_touch
  before update on user_ai_keys
  for each row execute function touch_user_ai_keys_updated_at();

-- ── Row Level Security ───────────────────────────────────
alter table user_ai_keys enable row level security;

create policy "own ai keys" on user_ai_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Column-level defense: ciphertext never reaches the browser ──
-- The authenticated role may read metadata (connection status, model,
-- timestamps) and delete its own rows, but can NOT select api_key and can
-- NOT insert/update (writes must go through the server, which encrypts).
revoke all on user_ai_keys from anon;
revoke all on user_ai_keys from authenticated;
grant select (id, user_id, provider, default_model, created_at, updated_at)
  on user_ai_keys to authenticated;
grant delete on user_ai_keys to authenticated;
