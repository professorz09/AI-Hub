-- AI Hub schema (anon access, no auth yet)
create table if not exists public.conversations (
  id          bigserial primary key,
  title       text not null,
  model       text not null default 'anthropic/claude-3.5-sonnet',
  category    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id               bigserial primary key,
  conversation_id  bigint not null references public.conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant', 'system')),
  content          text not null,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at);

create index if not exists conversations_created_at_idx
  on public.conversations (created_at desc);

-- Open access via anon key (no auth in this phase). Tighten when auth is added.
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "anon read conversations"   on public.conversations;
drop policy if exists "anon write conversations"  on public.conversations;
drop policy if exists "anon update conversations" on public.conversations;
drop policy if exists "anon delete conversations" on public.conversations;
drop policy if exists "anon read messages"        on public.messages;
drop policy if exists "anon write messages"       on public.messages;

create policy "anon read conversations"
  on public.conversations for select using (true);
create policy "anon write conversations"
  on public.conversations for insert with check (true);
create policy "anon update conversations"
  on public.conversations for update using (true) with check (true);
create policy "anon delete conversations"
  on public.conversations for delete using (true);

create policy "anon read messages"
  on public.messages for select using (true);
create policy "anon write messages"
  on public.messages for insert with check (true);
