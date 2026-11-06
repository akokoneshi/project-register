-- Project Register table. Run once in the Materials Supabase project (SQL Editor > New query > paste > Run). Safe to re-run.
-- Uses the existing app_users list: only active people with role admin / div_admin / user can read or edit.
-- (Field users are excluded because the register holds customer contact emails.)
create table if not exists public.project_register (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_register enable row level security;

create or replace function public.can_use_register() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users
    where email = current_email() and not blocked and role in ('admin', 'div_admin', 'user')
  )
$$;

drop policy if exists "register all" on public.project_register;
create policy "register all" on public.project_register
  for all to authenticated
  using (public.can_use_register())
  with check (public.can_use_register());

-- live updates between people
do $$ begin
  alter publication supabase_realtime add table public.project_register;
exception when duplicate_object then null; end $$;
