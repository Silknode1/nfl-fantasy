-- Fantasy engine output (fantasy/build.py). Applied to the nfl-fantasy project on 2026-10-11.
create table if not exists public.fantasy_snapshots (
  generated_at timestamptz primary key,
  season int not null,
  week int not null,
  data jsonb not null
);
alter table public.fantasy_snapshots enable row level security;
