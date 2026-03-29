-- Kurse-Tabelle
create table if not exists courses (
  course_id serial primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Verknüpfung: User → Kurs (Junction-Tabelle)
create table if not exists user_course_id (
  user_course_id uuid primary key default gen_random_uuid(),
  profiles_id uuid not null references profiles(id) on delete cascade,
  course_id integer not null references courses(course_id) on delete cascade,
  unique (profiles_id)
);

-- RLS
alter table courses enable row level security;
alter table user_course_id enable row level security;

create policy "Authenticated users can read courses"
  on courses for select
  to authenticated
  using (true);

create policy "Users can read own course assignment"
  on user_course_id for select
  to authenticated
  using (profiles_id = auth.uid());
