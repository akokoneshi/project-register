-- Project Register table. Run in the Materials Supabase project (SQL Editor > New query > paste > Run).
-- Safe to re-run: it only creates/replaces the project_register table, its policy and its helper function.
-- It does not change any Materials tables. It only READS app_users.
--
-- Access: EVERY active login can see and edit ALL projects. "Active" means the person is listed in
-- Users & Permissions (app_users) and not blocked. Blocking someone in the Materials app blocks them here too.
create table if not exists public.project_register (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_register enable row level security;

create or replace function public.can_use_register() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where email = current_email() and not blocked)
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

-- ---------------------------------------------------------------------------------------------
-- Clients: companies in their own right (so a client can exist before it has any project).
-- Contacts imported later can be stored in data->'contacts' (same shape as on a project).
create table if not exists public.register_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists register_clients_name_key on public.register_clients (lower(btrim(name)));

alter table public.register_clients enable row level security;
drop policy if exists "register clients all" on public.register_clients;
create policy "register clients all" on public.register_clients
  for all to authenticated
  using (public.can_use_register())
  with check (public.can_use_register());

do $$ begin
  alter publication supabase_realtime add table public.register_clients;
exception when duplicate_object then null; end $$;

-- One-time starter list of clients. Only runs while the table is empty, so re-running this file never re-adds
-- clients you have since removed.
do $$ begin
  if not exists (select 1 from public.register_clients) then
    insert into public.register_clients (name) values
    ('ABM Air Conditioning & Heating'),
    ('Accurate Mechanical Contractor'),
    ('Airside Sheet metal, Inc.'),
    ('AMX Mechanical'),
    ('Arden Engineering Constructors'),
    ('B-G Mechanical Contractors, Inc'),
    ('Bond Brothers, Inc.'),
    ('Bonland Industries,Inc.'),
    ('C&B Plumbing and Heating, Inc'),
    ('C.B. Strain A Division of DSI'),
    ('Cardoza Corp.'),
    ('Cintas Corporation'),
    ('Clean Air Quality Service'),
    ('DJ Heating & Cooling'),
    ('Dynamic Systems Inc'),
    ('ELQ Industries Inc'),
    ('F+F Mechanical Enterprises Inc'),
    ('Flach Industries, Inc.'),
    ('FPI Mechanical, Inc.'),
    ('Good Samaritan'),
    ('H.T. Lyons'),
    ('Hauser Brothers Inc'),
    ('ICM Mechanical Contractors'),
    ('Joe Lombardo Plumbing & Heating'),
    ('LJ Coppola'),
    ('Mengler Mechanical, Inc.'),
    ('MJ Daly'),
    ('P & D Mechanical Inc'),
    ('Pavarini North East Construct'),
    ('Pittsfield Pipers, Inc.'),
    ('Regeneron Pharmaceuticals Inc.'),
    ('Rotundo Plumbing Corp.'),
    ('S&O Construction Services'),
    ('Southeast Mechanical Corp.'),
    ('Southeast Plumbing Corp.'),
    ('The YMI Group Inc.'),
    ('Thermo Dynamics Corp'),
    ('Tucker Mechanical'),
    ('UCONN'),
    ('Walter Sullivan Company');
  end if;
end $$;
