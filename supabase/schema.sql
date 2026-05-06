-- BJJ Atlas schema
-- Run this in the Supabase SQL editor before first use.

create table if not exists nodes (
  id          text primary key,
  name        text not null,
  type        text not null check (type in ('position', 'submission', 'sweep', 'escape')),
  rank        integer not null check (rank between 0 and 3),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists edges (
  id         text primary key,
  source     text not null references nodes(id) on delete cascade,
  target     text not null references nodes(id) on delete cascade,
  label      text not null default '',
  created_at timestamptz not null default now()
);

alter table nodes enable row level security;
alter table edges enable row level security;

-- Public read
create policy "public_read_nodes" on nodes for select using (true);
create policy "public_read_edges" on edges for select using (true);

-- Writes are handled server-side via the service role key, which bypasses RLS.
