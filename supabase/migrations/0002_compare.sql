-- Compare mode: a conversation can run against multiple models in parallel.
-- Each assistant message records which model produced it so the UI can split
-- the transcript into per-model columns.

alter table public.conversations
  add column if not exists mode   text not null default 'single'
    check (mode in ('single', 'compare')),
  add column if not exists models text[];

alter table public.messages
  add column if not exists model text;

create index if not exists messages_conversation_model_idx
  on public.messages (conversation_id, model, created_at);
