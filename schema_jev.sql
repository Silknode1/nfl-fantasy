-- Jev signal layer tables. Run once in the Supabase SQL editor (after schema.sql). Idempotent.
-- Matches the existing security pattern: RLS on, one SELECT policy for the read-only agent role.
-- service_role (used by the nightly pipeline) bypasses RLS; anon/authenticated get no access until you
-- add a policy for the web app (do that deliberately, ideally behind a server route).

create table if not exists news_items (
  news_id          text primary key,            -- 'espn:<article id>'
  source           text not null,               -- 'espn'
  source_type      text not null,               -- ESPN article type: HeadlineNews, Story, ...
  headline         text not null,
  body             text,
  url              text,
  published_at     timestamptz,
  fetched_at       timestamptz not null default now(),
  espn_athlete_ids text[] not null default '{}',  -- tagged athletes; maps to players.espn_id
  team_abbrs       text[] not null default '{}',  -- canonical (schedules-style) team codes
  content_hash     text not null,               -- sha1(headline|body), for dedupe of reposts
  data             jsonb not null default '{}'
);
create index if not exists news_items_published_idx on news_items (published_at desc);
create index if not exists news_items_hash_idx on news_items (content_hash);

create table if not exists jev_judgments (
  news_id       text not null references news_items(news_id) on delete cascade,
  espn_id       text not null,                  -- the tagged athlete this judgment is about
  player_id     text,                           -- players.player_id (gsis), resolved in code
  question_set  text not null,                  -- e.g. 'news_v1'; bump when questions change
  model         text not null,                  -- model the API reported, e.g. 'jev-1.13.0'
  request_id    text,
  input_tokens  integer not null default 0,
  answers       jsonb not null,                 -- raw probabilities: re-threshold later with no API calls
  signal        jsonb not null,                 -- interpreted signal under the thresholds in force at judge time
  alert_tier    text not null check (alert_tier in ('push', 'in_app', 'quiet')),
  judged_at     timestamptz not null default now(),
  primary key (news_id, espn_id, question_set, model)
);
create index if not exists jev_judgments_player_idx on jev_judgments (player_id, judged_at desc);

alter table news_items enable row level security;
alter table jev_judgments enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'agent_ro') then
    grant select on news_items, jev_judgments to agent_ro;
    drop policy if exists agent_ro_read on news_items;
    create policy agent_ro_read on news_items for select to agent_ro using (true);
    drop policy if exists agent_ro_read on jev_judgments;
    create policy agent_ro_read on jev_judgments for select to agent_ro using (true);
  end if;
end $$;
