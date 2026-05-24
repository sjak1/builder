-- Projects: a user's saved builder sessions.
-- One row per project. Files/messages/checkpoints are stored as JSONB blobs
-- (simple, atomic, and matches the Zustand store shape in src/lib/store.ts).

create extension if not exists "pgcrypto";

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Untitled project',
  template_id   text,
  files         jsonb not null default '{}'::jsonb,
  messages      jsonb not null default '[]'::jsonb,
  checkpoints   jsonb not null default '[]'::jsonb,
  share_slug    text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

-- Keep updated_at fresh on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

-- Row-level security
alter table public.projects enable row level security;

-- Owner can do anything with their own projects.
create policy "owner full access"
  on public.projects
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anyone (including anon) can SELECT a project that has a share_slug.
create policy "public read of shared projects"
  on public.projects
  for select
  using (share_slug is not null);
