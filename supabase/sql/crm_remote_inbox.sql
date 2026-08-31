create table if not exists public.crm_remote_inbox (
  id uuid primary key default gen_random_uuid(),
  client_crm_id integer,
  project_crm_id integer,
  client_name text not null,
  project_name text,
  item_type text not null check (item_type in ('task','ticket')),
  title text not null,
  due_date date,
  priority text not null default 'Medium',
  notes text,
  status text not null default 'pending',
  source text not null default 'reimage_admin_portal',
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

alter table public.crm_remote_inbox add column if not exists client_crm_id integer;
alter table public.crm_remote_inbox add column if not exists project_crm_id integer;
alter table public.crm_remote_inbox enable row level security;

drop policy if exists "Authenticated admins can send CRM work" on public.crm_remote_inbox;
create policy "Authenticated admins can send CRM work"
  on public.crm_remote_inbox
  for insert
  to authenticated
  with check (true);

create index if not exists crm_remote_inbox_status_created_idx
  on public.crm_remote_inbox(status, created_at);

create table if not exists public.crm_clients (
  crm_id integer primary key,
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  status text,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_projects (
  crm_id integer primary key,
  client_crm_id integer not null,
  client_name text,
  title text not null,
  type text,
  status text,
  due_date date,
  progress integer default 0,
  updated_at timestamptz not null default now()
);

alter table public.crm_clients enable row level security;
alter table public.crm_projects enable row level security;

drop policy if exists "Authenticated admins can read CRM clients" on public.crm_clients;
create policy "Authenticated admins can read CRM clients"
  on public.crm_clients
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated admins can read CRM projects" on public.crm_projects;
create policy "Authenticated admins can read CRM projects"
  on public.crm_projects
  for select
  to authenticated
  using (true);

create index if not exists crm_clients_business_name_idx
  on public.crm_clients(business_name);

create index if not exists crm_projects_client_title_idx
  on public.crm_projects(client_crm_id, title);

create table if not exists public.crm_potential_leads (
  id uuid primary key default gen_random_uuid(),
  lead_name text not null,
  company text,
  phone text,
  email text,
  potential_project text not null,
  notes text,
  status text not null default 'pending',
  source text not null default 'reimage_admin_portal',
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

alter table public.crm_potential_leads add column if not exists company text;
alter table public.crm_potential_leads add column if not exists phone text;
alter table public.crm_potential_leads add column if not exists email text;
alter table public.crm_potential_leads add column if not exists notes text;
alter table public.crm_potential_leads add column if not exists imported_at timestamptz;
alter table public.crm_potential_leads enable row level security;

drop policy if exists "Authenticated admins can send potential leads" on public.crm_potential_leads;
create policy "Authenticated admins can send potential leads"
  on public.crm_potential_leads
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated admins can read potential leads" on public.crm_potential_leads;
create policy "Authenticated admins can read potential leads"
  on public.crm_potential_leads
  for select
  to authenticated
  using (true);

create index if not exists crm_potential_leads_status_created_idx
  on public.crm_potential_leads(status, created_at);

create table if not exists public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  client_crm_id integer,
  client_name text not null,
  title text not null default 'Appointment',
  appointment_date date not null,
  appointment_time time not null,
  notes text,
  status text not null default 'pending',
  source text not null default 'reimage_admin_portal',
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

alter table public.crm_appointments add column if not exists client_crm_id integer;
alter table public.crm_appointments add column if not exists client_name text;
alter table public.crm_appointments add column if not exists title text default 'Appointment';
alter table public.crm_appointments add column if not exists appointment_date date;
alter table public.crm_appointments add column if not exists appointment_time time;
alter table public.crm_appointments add column if not exists notes text;
alter table public.crm_appointments add column if not exists imported_at timestamptz;
alter table public.crm_appointments enable row level security;

drop policy if exists "Authenticated admins can send appointments" on public.crm_appointments;
create policy "Authenticated admins can send appointments"
  on public.crm_appointments
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated admins can read appointments" on public.crm_appointments;
create policy "Authenticated admins can read appointments"
  on public.crm_appointments
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated admins can update appointments" on public.crm_appointments;
create policy "Authenticated admins can update appointments"
  on public.crm_appointments
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated admins can delete appointments" on public.crm_appointments;
create policy "Authenticated admins can delete appointments"
  on public.crm_appointments
  for delete
  to authenticated
  using (true);

create index if not exists crm_appointments_status_date_idx
  on public.crm_appointments(status, appointment_date, appointment_time);

create index if not exists crm_appointments_client_date_idx
  on public.crm_appointments(client_crm_id, appointment_date);

create table if not exists public.video_submissions (
  id uuid primary key default gen_random_uuid(),
  client_crm_id integer not null,
  client_name text not null,
  notes text,
  due_date date,
  status text not null default 'new',
  files jsonb not null default '[]'::jsonb,
  submitted_by uuid,
  submitted_by_email text,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

alter table public.video_submissions add column if not exists client_crm_id integer;
alter table public.video_submissions add column if not exists client_name text;
alter table public.video_submissions add column if not exists notes text;
alter table public.video_submissions add column if not exists due_date date;
alter table public.video_submissions add column if not exists status text default 'new';
alter table public.video_submissions add column if not exists files jsonb default '[]'::jsonb;
alter table public.video_submissions add column if not exists submitted_by uuid;
alter table public.video_submissions add column if not exists submitted_by_email text;
alter table public.video_submissions add column if not exists imported_at timestamptz;
alter table public.video_submissions enable row level security;

drop policy if exists "Authenticated admins can send videos" on public.video_submissions;
create policy "Authenticated admins can send videos"
  on public.video_submissions
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated admins can read videos" on public.video_submissions;
create policy "Authenticated admins can read videos"
  on public.video_submissions
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated admins can update videos" on public.video_submissions;
create policy "Authenticated admins can update videos"
  on public.video_submissions
  for update
  to authenticated
  using (true)
  with check (true);

create index if not exists video_submissions_status_created_idx
  on public.video_submissions(status, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-submissions', 'video-submissions', false, 5368709120, null)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set file_size_limit = 5368709120,
    allowed_mime_types = null
where id = 'video-submissions';

drop policy if exists "Authenticated admins can upload video files" on storage.objects;
create policy "Authenticated admins can upload video files"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'video-submissions');

drop policy if exists "Authenticated admins can read video files" on storage.objects;
create policy "Authenticated admins can read video files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'video-submissions');

drop policy if exists "Authenticated admins can update video files" on storage.objects;
create policy "Authenticated admins can update video files"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'video-submissions')
  with check (bucket_id = 'video-submissions');

drop policy if exists "Authenticated admins can delete video files" on storage.objects;
create policy "Authenticated admins can delete video files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'video-submissions');
