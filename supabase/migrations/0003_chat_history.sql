-- Wake2Win — AI chat history (conversations + messages)
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

-- ── Enums ────────────────────────────────────────────────
create type chat_role as enum ('user','assistant');

-- ── Conversations ────────────────────────────────────────
create table conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'New chat',
  pinned boolean not null default false,
  -- Rolling summary of older messages, maintained by the API so the model
  -- never needs the full history (conversation memory).
  summary text,
  -- Number of messages already folded into `summary`.
  summarized_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sidebar query: newest conversations for a user, pinned handled client-side.
create index idx_conversations_user_updated on conversations (user_id, updated_at desc);

-- ── Messages ─────────────────────────────────────────────
create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role chat_role not null,
  content text not null,
  -- Which model actually produced an assistant message (fallback visibility).
  model text,
  liked boolean,
  created_at timestamptz not null default now()
);

-- Chat load / memory-window query: last N messages of a conversation.
create index idx_messages_conversation_time on messages (conversation_id, created_at);

-- ── updated_at bump on any conversation change ───────────
create or replace function touch_conversation_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_conversations_touch
  before update on conversations
  for each row execute function touch_conversation_updated_at();

-- Bump the parent conversation whenever a message is added, so the
-- sidebar's recency grouping stays correct without extra client writes.
create or replace function touch_parent_conversation()
returns trigger language plpgsql as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_messages_touch_parent
  after insert on messages
  for each row execute function touch_parent_conversation();

-- ── Row Level Security ───────────────────────────────────
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "own conversations" on conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Messages are owned through their conversation.
create policy "own messages" on messages
  for all using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- ── Full-text search over conversation titles ────────────
create index idx_conversations_title_search
  on conversations using gin (to_tsvector('simple', title));
