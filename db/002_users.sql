-- BOOST user accounts: account managers (several brands) and brand users (one brand).
-- The owner signs in with the ADMIN_PASSWORD environment variable and is not stored here.
-- Applied once on 27 Oct 2026. Safe to re-run.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,              -- stored lower case
  name text not null,
  role text not null check (role in ('manager', 'brand')),
  password_hash text not null,             -- scrypt$salt$hash, never the password
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists app_user_brands (
  user_id uuid not null references app_users(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  primary key (user_id, brand_id)
);

-- The app reads these through its own database connection. Row level security with no policies keeps them out of
-- Supabase's public REST API (anon and authenticated keys), so password hashes are never exposed there.
alter table app_users enable row level security;
alter table app_user_brands enable row level security;
revoke all on app_users, app_user_brands from anon, authenticated;
