-- AI Tutor MVP - Initial Schema
-- Creates all 6 core tables per TDG Section 8

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- Table: problems
-- ============================================
create table problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_image_url text not null,
  ocr_text text not null,
  normalized_text text not null,
  problem_type text,
  knowledge_points text[] default '{}',
  difficulty smallint,
  confidence numeric(4,3),
  source text not null default 'upload',
  created_at timestamptz not null default now()
);

-- Index for GIN on knowledge_points
create index problems_knowledge_points_gin_idx on problems using gin(knowledge_points);

-- Index for user lookups
create index problems_user_id_idx on problems(user_id);

-- ============================================
-- Table: sessions
-- ============================================
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_tutor_state text not null default 'observe',
  hint_level smallint not null default 1,
  consecutive_failures smallint not null default 0,
  consecutive_successes smallint not null default 0,
  solution_revealed boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Index for user + status queries
create index sessions_user_status_idx on sessions(user_id, status);

-- Index for problem lookups
create index sessions_problem_id_idx on sessions(problem_id);

-- ============================================
-- Table: messages
-- ============================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('student', 'assistant', 'system')),
  content text not null,
  tutor_state text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Index for session message queries
create index messages_session_created_idx on messages(session_id, created_at);

-- ============================================
-- Table: step_evaluations
-- ============================================
create table step_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  student_input text not null,
  correctness text not null check (correctness in ('correct', 'partial', 'incorrect')),
  understanding_level text not null check (understanding_level in ('unknown', 'confused', 'partial_understanding', 'mostly_understood', 'mastered')),
  primary_error_type text,
  secondary_error_types text[] default '{}',
  feedback text not null,
  next_action text not null check (next_action in ('continue', 'hint', 'simplify', 'explain')),
  created_at timestamptz not null default now()
);

-- Index for session evaluation queries
create index step_evaluations_session_created_idx on step_evaluations(session_id, created_at);

-- ============================================
-- Table: review_tasks
-- ============================================
create table review_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  problem_id uuid references problems(id) on delete set null,
  knowledge_point text not null,
  error_type text,
  scheduled_for date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index for dedupe key uniqueness
create unique index review_tasks_dedupe_key_idx on review_tasks(dedupe_key);

-- Index for user scheduled review queries
create index review_tasks_user_date_idx on review_tasks(user_id, scheduled_for, status);

-- ============================================
-- Table: learner_profiles
-- ============================================
create table learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weak_knowledge_points jsonb not null default '[]',
  frequent_error_types jsonb not null default '[]',
  hint_dependency_score numeric(4,3) not null default 0.000,
  recent_accuracy numeric(4,3),
  profile_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ============================================
-- Row Level Security (RLS) Policies
-- Per TDG Section 16.2
-- ============================================

-- Enable RLS on all tables
alter table problems enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table step_evaluations enable row level security;
alter table review_tasks enable row level security;
alter table learner_profiles enable row level security;

-- ---- Problems Policies ----
-- Students can only view their own problems
create policy "Students can view own problems"
  on problems for select
  using (auth.uid() = user_id);

-- Students can only insert their own problems
create policy "Students can insert own problems"
  on problems for insert
  with check (auth.uid() = user_id);

-- Students can only update their own problems
create policy "Students can update own problems"
  on problems for update
  using (auth.uid() = user_id);

-- Students can only delete their own problems
create policy "Students can delete own problems"
  on problems for delete
  using (auth.uid() = user_id);

-- ---- Sessions Policies ----
-- Students can only view their own sessions
create policy "Students can view own sessions"
  on sessions for select
  using (auth.uid() = user_id);

-- Students can only insert sessions for their own problems
create policy "Students can insert own sessions"
  on sessions for insert
  with check (auth.uid() = user_id);

-- Students can only update their own sessions
create policy "Students can update own sessions"
  on sessions for update
  using (auth.uid() = user_id);

-- Students can only delete their own sessions
create policy "Students can delete own sessions"
  on sessions for delete
  using (auth.uid() = user_id);

-- ---- Messages Policies ----
-- Students can only view messages in their own sessions
create policy "Students can view own session messages"
  on messages for select
  using (exists (
    select 1 from sessions
    where sessions.id = messages.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only insert messages in their own sessions
create policy "Students can insert own session messages"
  on messages for insert
  with check (exists (
    select 1 from sessions
    where sessions.id = messages.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only update messages in their own sessions
create policy "Students can update own session messages"
  on messages for update
  using (exists (
    select 1 from sessions
    where sessions.id = messages.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only delete messages in their own sessions
create policy "Students can delete own session messages"
  on messages for delete
  using (exists (
    select 1 from sessions
    where sessions.id = messages.session_id
    and sessions.user_id = auth.uid()
  ));

-- ---- Step Evaluations Policies ----
-- Students can only view evaluations for their own sessions
create policy "Students can view own session evaluations"
  on step_evaluations for select
  using (exists (
    select 1 from sessions
    where sessions.id = step_evaluations.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only insert evaluations for their own sessions
create policy "Students can insert own session evaluations"
  on step_evaluations for insert
  with check (exists (
    select 1 from sessions
    where sessions.id = step_evaluations.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only update evaluations for their own sessions
create policy "Students can update own session evaluations"
  on step_evaluations for update
  using (exists (
    select 1 from sessions
    where sessions.id = step_evaluations.session_id
    and sessions.user_id = auth.uid()
  ));

-- Students can only delete evaluations for their own sessions
create policy "Students can delete own session evaluations"
  on step_evaluations for delete
  using (exists (
    select 1 from sessions
    where sessions.id = step_evaluations.session_id
    and sessions.user_id = auth.uid()
  ));

-- ---- Review Tasks Policies ----
-- Students can only view their own review tasks
create policy "Students can view own review tasks"
  on review_tasks for select
  using (auth.uid() = user_id);

-- Students can only insert their own review tasks
create policy "Students can insert own review tasks"
  on review_tasks for insert
  with check (auth.uid() = user_id);

-- Students can only update their own review tasks
create policy "Students can update own review tasks"
  on review_tasks for update
  using (auth.uid() = user_id);

-- Students can only delete their own review tasks
create policy "Students can delete own review tasks"
  on review_tasks for delete
  using (auth.uid() = user_id);

-- ---- Learner Profiles Policies ----
-- Students can only view their own learner profile
create policy "Students can view own learner profile"
  on learner_profiles for select
  using (auth.uid() = user_id);

-- Students can only insert their own learner profile
create policy "Students can insert own learner profile"
  on learner_profiles for insert
  with check (auth.uid() = user_id);

-- Students can only update their own learner profile
create policy "Students can update own learner profile"
  on learner_profiles for update
  using (auth.uid() = user_id);

-- Students can only delete their own learner profile
create policy "Students can delete own learner profile"
  on learner_profiles for delete
  using (auth.uid() = user_id);

-- ============================================
-- Comments for documentation
-- ============================================
comment on table problems is 'Stores math problem metadata, OCR results, and knowledge point tagging';
comment on table sessions is 'Tracks individual tutoring session state and progress';
comment on table messages is 'Stores all messages exchanged during a tutoring session';
comment on table step_evaluations is 'Records AI tutor evaluation of each student step';
comment on table review_tasks is 'Scheduled spaced repetition review tasks for learner weaknesses';
comment on table learner_profiles is 'Aggregated learner statistics and weakness profiles';