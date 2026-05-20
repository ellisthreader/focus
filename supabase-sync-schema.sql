create table if not exists public.focus_user_sync_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.focus_user_sync_documents enable row level security;

drop policy if exists "focus user sync read" on public.focus_user_sync_documents;
drop policy if exists "focus user sync insert" on public.focus_user_sync_documents;
drop policy if exists "focus user sync update" on public.focus_user_sync_documents;

create policy "focus user sync read"
  on public.focus_user_sync_documents
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "focus user sync insert"
  on public.focus_user_sync_documents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "focus user sync update"
  on public.focus_user_sync_documents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
