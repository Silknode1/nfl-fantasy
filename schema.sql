-- NFL / fantasy schema. Apply once to a fresh Supabase project.
-- Key columns are typed; everything else lands in `data` (jsonb) so nflverse
-- column changes never break ingest.

create table if not exists players (
  player_id text primary key,          -- nflverse gsis_id
  full_name text,
  position text,
  team text,
  sleeper_id text,
  espn_id text,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists weekly_stats (
  season int not null,
  week int not null,
  player_id text not null,
  data jsonb not null,
  primary key (season, week, player_id)
);

create table if not exists injuries (
  season int not null,
  week int not null,
  player_id text not null,
  data jsonb not null,
  primary key (season, week, player_id)
);

create table if not exists snap_counts (
  season int not null,
  week int not null,
  player_id text not null,
  data jsonb not null,
  primary key (season, week, player_id)
);

create table if not exists schedules (
  game_id text primary key,
  season int,
  week int,
  data jsonb not null
);

create table if not exists sleeper_trending (
  pulled_at timestamptz not null default now(),
  kind text not null,                  -- 'add' or 'drop'
  sleeper_id text not null,
  count int,
  primary key (pulled_at, kind, sleeper_id)
);

create table if not exists espn_scoreboard (
  event_id text primary key,
  season int,
  week int,
  data jsonb not null,
  pulled_at timestamptz default now()
);

create table if not exists espn_league_rosters (
  season int not null,
  team_id int not null,
  team_name text,
  data jsonb not null,
  pulled_at timestamptz default now(),
  primary key (season, team_id)
);

create table if not exists odds (
  event_id text not null,
  market text not null,
  pulled_at timestamptz not null default now(),
  data jsonb not null,
  primary key (event_id, market, pulled_at)
);

-- Half-PPR is derived: PPR minus half a point per reception.
create or replace view v_weekly_half_ppr as
select
  s.season,
  s.week,
  s.player_id,
  s.data->>'player_display_name' as player_name,
  s.data->>'position' as position,
  coalesce(s.data->>'team', s.data->>'recent_team') as team,
  (s.data->>'fantasy_points_ppr')::numeric as ppr_points,
  (s.data->>'receptions')::numeric as receptions,
  (s.data->>'fantasy_points_ppr')::numeric
    - 0.5 * coalesce((s.data->>'receptions')::numeric, 0) as half_ppr_points
from weekly_stats s;

-- Read-only role for the LLM agent's SQL tool. Set a real password, then use
-- this role's connection string in tools.py instead of the service key.
-- create role agent_ro login password 'CHANGE_ME';
-- grant usage on schema public to agent_ro;
-- grant select on all tables in schema public to agent_ro;
-- alter default privileges in schema public grant select on tables to agent_ro;
