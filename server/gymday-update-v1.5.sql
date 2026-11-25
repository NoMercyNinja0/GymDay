-- GymDay: update an existing project (v1.4 setup) to v1.5. Safe to run more than once.
-- ===================================================================== added in v1.5
-- profile picture and club logo: a small square JPEG kept as text ("data:image/jpeg;base64,..."); *_at changes when the picture does
alter table public.gd_profiles add column if not exists avatar    text check (avatar is null or char_length(avatar) <= 40000);
alter table public.gd_profiles add column if not exists avatar_at bigint not null default 0;
alter table public.gd_clubs    add column if not exists descr     text check (descr is null or char_length(descr) <= 200);
alter table public.gd_clubs    add column if not exists logo      text check (logo is null or char_length(logo) <= 40000);
alter table public.gd_clubs    add column if not exists logo_at   bigint not null default 0;
-- totals of a shared workout, for the club boards: weight lifted (always in kg) and how many records it set
alter table public.gd_workouts add column if not exists volume    numeric not null default 0 check (volume >= 0);
alter table public.gd_workouts add column if not exists prs       integer not null default 0 check (prs >= 0);
-- which reaction a cheer is (one per person per workout)
alter table public.gd_cheers   add column if not exists kind      text not null default 'clap' check (kind in ('clap', 'fire', 'strong', 'wow', 'heart'));

create table if not exists public.gd_comments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  workout_id text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  foreign key (owner_id, workout_id) references public.gd_workouts(user_id, id) on delete cascade
);
create index if not exists gd_comments_workout on public.gd_comments (owner_id, workout_id, created_at);
create index if not exists gd_comments_user on public.gd_comments (user_id, created_at);

-- a person's best lift per exercise (kg), only kept while they share "everything"
create table if not exists public.gd_bests (
  user_id uuid not null references auth.users(id) on delete cascade,
  ex_id   text not null check (char_length(ex_id) between 1 and 64),
  name    text not null default '' check (char_length(name) <= 60),
  w       numeric not null check (w > 0),
  reps    numeric not null default 0 check (reps >= 0),
  at      timestamptz not null default now(),
  primary key (user_id, ex_id)
);

-- a day (list of exercises) someone put up for their club mates to copy
create table if not exists public.gd_shared_days (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.gd_clubs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  items      jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists gd_shared_days_club on public.gd_shared_days (club_id, created_at desc);

-- "I'm going to the gym at ..." posts, and who said they are coming too
create table if not exists public.gd_plans (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.gd_clubs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  at         timestamptz not null,
  note       text not null default '' check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists gd_plans_club on public.gd_plans (club_id, at);
create table if not exists public.gd_plan_joins (
  plan_id   uuid not null references public.gd_plans(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

-- telling the app that a newer version exists (one row), and who may announce one
create table if not exists public.gd_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.gd_app (
  id         integer primary key default 1 check (id = 1),
  code       integer not null check (code > 0),
  name       text not null check (char_length(name) between 1 and 20),
  url        text not null check (char_length(url) between 9 and 500),
  notes      text not null default '' check (char_length(notes) <= 400),
  updated_at timestamptz not null default now()
);
alter table public.gd_admins      enable row level security;
alter table public.gd_app         enable row level security;
revoke all on public.gd_admins, public.gd_app from anon, authenticated;

alter table public.gd_comments    enable row level security;
alter table public.gd_bests       enable row level security;
alter table public.gd_shared_days enable row level security;
alter table public.gd_plans       enable row level security;
alter table public.gd_plan_joins  enable row level security;
revoke all on public.gd_comments, public.gd_bests, public.gd_shared_days, public.gd_plans, public.gd_plan_joins from anon, authenticated;


create or replace function public.gdx_now_ms() returns bigint
language sql volatile set search_path = public, pg_temp as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.gdx_streak(p_user uuid, p_week timestamptz) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  with wk as (
    select distinct (- floor(extract(epoch from (started_at - p_week)) / 604800))::integer as i
      from gd_workouts
     where user_id = p_user and started_at < p_week + interval '7 days' and started_at >= p_week - interval '104 weeks'),
  o as (select i, (row_number() over (order by i))::integer - 1 as rn from wk)
  select count(*)::integer from o where (select min(i) from wk) <= 1 and i - rn = (select min(i) from wk)
$$;

create or replace function public.gdx_reactions(p_owner uuid, p_workout text, p_me uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'reactions', coalesce((select jsonb_object_agg(x.kind, x.n) from (select kind, count(*) as n from gd_cheers where owner_id = p_owner and workout_id = p_workout group by kind) x), '{}'::jsonb),
    'mine', (select kind from gd_cheers where owner_id = p_owner and workout_id = p_workout and user_id = p_me),
    'cheers', (select count(*) from gd_cheers where owner_id = p_owner and workout_id = p_workout),
    'cheered', exists (select 1 from gd_cheers where owner_id = p_owner and workout_id = p_workout and user_id = p_me))
$$;

create or replace function public.gdx_out_of_club(p_club uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from gd_shared_days where club_id = p_club and user_id = p_user;
  delete from gd_plan_joins j using gd_plans pl where j.plan_id = pl.id and pl.club_id = p_club and j.user_id = p_user;
  delete from gd_plans where club_id = p_club and user_id = p_user;
end $$;

create or replace function public.gd_is_admin() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select auth.uid() is not null and (
           exists (select 1 from public.gd_admins where user_id = auth.uid())
           or (not exists (select 1 from public.gd_admins) and auth.uid() = (select id from auth.users order by created_at, id limit 1)))
$$;

create or replace function public.gd_profile() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v jsonb;
begin
  select jsonb_build_object('name', name, 'share', share, 'avatar_at', case when avatar is null then 0 else avatar_at end, 'admin', gd_is_admin())
    into v from gd_profiles where user_id = v_uid;
  return v;   -- null when the person has not chosen a name yet
end $$;

create or replace function public.gd_set_profile(p_name text default null, p_share text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_name is not null and char_length(v_name) > 40 then raise exception 'That name is too long (40 characters at most)'; end if;
  if p_share is not null and p_share not in ('summary', 'all', 'none') then raise exception 'Unknown sharing choice'; end if;
  if exists (select 1 from gd_profiles where user_id = v_uid) then
    update gd_profiles set name = coalesce(v_name, name), share = coalesce(p_share, share) where user_id = v_uid;
  else
    if v_name is null then raise exception 'Choose a name first'; end if;
    insert into gd_profiles (user_id, name, share) values (v_uid, v_name, coalesce(p_share, 'summary'));
  end if;
  if p_share = 'none' then delete from gd_workouts where user_id = v_uid; end if;
  if p_share = 'summary' then update gd_workouts set detail = null where user_id = v_uid and detail is not null; end if;
  if p_share in ('none', 'summary') then delete from gd_bests where user_id = v_uid; end if;
  return gd_profile();
end $$;

create or replace function public.gd_set_avatar(p_avatar text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if p_avatar is not null and (char_length(p_avatar) > 40000 or p_avatar not like 'data:image/%') then raise exception 'That picture is too big'; end if;
  update gd_profiles set avatar = p_avatar, avatar_at = case when p_avatar is null then 0 else gdx_now_ms() end where user_id = v_uid;
  if not found then raise exception 'Choose a name first'; end if;
  return gd_profile();
end $$;

create or replace function public.gd_pics(p_users uuid[] default null, p_clubs uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if coalesce(array_length(p_users, 1), 0) > 80 or coalesce(array_length(p_clubs, 1), 0) > 80 then raise exception 'Too many at once'; end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_object_agg(p.user_id, p.avatar) from gd_profiles p
                        where p.user_id = any (coalesce(p_users, '{}')) and p.avatar is not null and gd_shares_club(v_uid, p.user_id)), '{}'::jsonb),
    'clubs', coalesce((select jsonb_object_agg(c.id, c.logo) from gd_clubs c
                        where c.id = any (coalesce(p_clubs, '{}')) and c.logo is not null and gd_is_member(c.id, v_uid)), '{}'::jsonb));
end $$;

create or replace function public.gd_share_workouts(p_items jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_share text; v_n integer := 0; it jsonb;
begin
  select share into v_share from gd_profiles where user_id = v_uid;
  if v_share is null or v_share = 'none' then return 0; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Bad list'; end if;
  if jsonb_array_length(p_items) > 300 then raise exception 'Too many workouts at once'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into gd_workouts (user_id, id, started_at, gym_ms, day_name, ex_count, set_count, detail, volume, prs)
    values (v_uid, left(it->>'id', 64), (it->>'started_at')::timestamptz,
            greatest(0, coalesce((it->>'gym_ms')::bigint, 0)), left(coalesce(it->>'day_name', ''), 60),
            greatest(0, coalesce((it->>'ex_count')::integer, 0)), greatest(0, coalesce((it->>'set_count')::integer, 0)),
            case when v_share = 'all' and pg_column_size(it->'detail') < 30000 then nullif(it->'detail', 'null'::jsonb) else null end,
            least(greatest(0, coalesce((it->>'volume')::numeric, 0)), 100000000), least(greatest(0, coalesce((it->>'prs')::integer, 0)), 1000))
    on conflict (user_id, id) do update set started_at = excluded.started_at, gym_ms = excluded.gym_ms,
      day_name = excluded.day_name, ex_count = excluded.ex_count, set_count = excluded.set_count, detail = excluded.detail,
      volume = excluded.volume, prs = excluded.prs;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.gd_share_bests(p_items jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_share text; it jsonb; v_ids text[] := '{}'; v_id text;
begin
  select share into v_share from gd_profiles where user_id = v_uid;
  if v_share is distinct from 'all' then delete from gd_bests where user_id = v_uid; return 0; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Bad list'; end if;
  if jsonb_array_length(p_items) > 400 then raise exception 'Too many exercises at once'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := left(coalesce(it->>'ex', ''), 64);
    continue when v_id = '' or coalesce((it->>'w')::numeric, 0) <= 0;
    insert into gd_bests (user_id, ex_id, name, w, reps, at)
    values (v_uid, v_id, left(coalesce(it->>'name', ''), 60), least((it->>'w')::numeric, 100000),
            greatest(0, coalesce((it->>'reps')::numeric, 0)), coalesce((it->>'at')::timestamptz, now()))
    on conflict (user_id, ex_id) do update set name = excluded.name, w = excluded.w, reps = excluded.reps, at = excluded.at;
    v_ids := v_ids || v_id;
  end loop;
  delete from gd_bests where user_id = v_uid and not (ex_id = any (v_ids));
  return coalesce(array_length(v_ids, 1), 0);
end $$;

create or replace function public.gd_react(p_owner uuid, p_workout text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if not gd_shares_club(v_uid, p_owner) then raise exception 'You are not in a club with this person'; end if;
  if not exists (select 1 from gd_workouts where user_id = p_owner and id = p_workout) then raise exception 'That workout is no longer shared'; end if;
  if coalesce(p_kind, '') = '' then
    delete from gd_cheers where owner_id = p_owner and workout_id = p_workout and user_id = v_uid;
  else
    if p_kind not in ('clap', 'fire', 'strong', 'wow', 'heart') then raise exception 'Unknown reaction'; end if;
    insert into gd_cheers (owner_id, workout_id, user_id, kind) values (p_owner, p_workout, v_uid, p_kind)
    on conflict (owner_id, workout_id, user_id) do update set kind = excluded.kind;
  end if;
  return gdx_reactions(p_owner, p_workout, v_uid);
end $$;

create or replace function public.gd_comments(p_owner uuid, p_workout text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if not gd_shares_club(v_uid, p_owner) then raise exception 'You are not in a club with this person'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.user_id, 'name', coalesce(p.name, 'Someone'),
             'avatar_at', case when p.avatar is null then 0 else p.avatar_at end, 'me', c.user_id = v_uid,
             'body', c.body, 'at', c.created_at, 'can_delete', c.user_id = v_uid or p_owner = v_uid) order by c.created_at)
      from gd_comments c left join gd_profiles p on p.user_id = c.user_id
     where c.owner_id = p_owner and c.workout_id = p_workout
       and (c.user_id = v_uid or p_owner = v_uid or gd_shares_club(v_uid, c.user_id))), '[]'::jsonb);
end $$;

create or replace function public.gd_comment(p_owner uuid, p_workout text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_body text := btrim(coalesce(p_body, ''));
begin
  if not gd_shares_club(v_uid, p_owner) then raise exception 'You are not in a club with this person'; end if;
  if not exists (select 1 from gd_workouts where user_id = p_owner and id = p_workout) then raise exception 'That workout is no longer shared'; end if;
  if char_length(v_body) < 1 then raise exception 'Write something first'; end if;
  if char_length(v_body) > 300 then raise exception 'That comment is too long (300 characters at most)'; end if;
  if (select count(*) from gd_comments where user_id = v_uid and created_at > now() - interval '1 hour') >= 60 then raise exception 'That is a lot of comments. Try again in a while.'; end if;
  if (select count(*) from gd_comments where owner_id = p_owner and workout_id = p_workout) >= 200 then raise exception 'This workout has all the comments it can hold'; end if;
  insert into gd_comments (owner_id, workout_id, user_id, body) values (p_owner, p_workout, v_uid, v_body);
  return gd_comments(p_owner, p_workout);
end $$;

create or replace function public.gd_delete_comment(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_owner uuid; v_workout text;
begin
  delete from gd_comments where id = p_id and (user_id = v_uid or owner_id = v_uid) returning owner_id, workout_id into v_owner, v_workout;
  if v_owner is null then raise exception 'That comment is not yours to delete'; end if;
  return gd_comments(v_owner, v_workout);
end $$;

create or replace function public.gd_leave_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_owner uuid; v_next uuid;
begin
  select owner into v_owner from gd_clubs where id = p_club for update;
  if not found or not gd_is_member(p_club, v_uid) then return false; end if;
  delete from gd_club_members where club_id = p_club and user_id = v_uid;
  perform gdx_out_of_club(p_club, v_uid);
  if v_owner = v_uid then
    select user_id into v_next from gd_club_members where club_id = p_club order by joined_at, user_id limit 1;
    if v_next is null then delete from gd_clubs where id = p_club;
    else update gd_clubs set owner = v_next where id = p_club; end if;
  end if;
  return true;
end $$;

create or replace function public.gd_remove_member(p_club uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if not exists (select 1 from gd_clubs where id = p_club and owner = v_uid) then raise exception 'Only the person who runs the club can remove someone'; end if;
  if p_user = v_uid then raise exception 'Use Leave club for yourself'; end if;
  delete from gd_club_members where club_id = p_club and user_id = p_user;
  if not found then return false; end if;
  perform gdx_out_of_club(p_club, p_user);
  return true;
end $$;

create or replace function public.gd_my_clubs() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'is_owner', c.owner = v_uid,
             'members', (select count(*) from gd_club_members x where x.club_id = c.id),
             'challenge', c.ch_title, 'descr', c.descr, 'logo_at', case when c.logo is null then 0 else c.logo_at end) order by m.joined_at)
    from gd_club_members m join gd_clubs c on c.id = m.club_id where m.user_id = v_uid), '[]'::jsonb);
end $$;

create or replace function public.gd_set_club_info(p_club uuid, p_descr text, p_logo text default null, p_set_logo boolean default false) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_descr text := nullif(btrim(coalesce(p_descr, '')), '');
begin
  if v_descr is not null and char_length(v_descr) > 200 then raise exception 'That description is too long (200 characters at most)'; end if;
  if p_set_logo and p_logo is not null and (char_length(p_logo) > 40000 or p_logo not like 'data:image/%') then raise exception 'That picture is too big'; end if;
  update gd_clubs set descr = v_descr,
         logo = case when p_set_logo then p_logo else logo end,
         logo_at = case when not p_set_logo then logo_at when p_logo is null then 0 else gdx_now_ms() end
   where id = p_club and owner = v_uid;
  if not found then raise exception 'Only the person who runs the club can change this'; end if;
  return true;
end $$;

create or replace function public.gd_share_day(p_club uuid, p_name text, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'A day name needs 1 to 40 characters'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'That day has no exercises'; end if;
  if jsonb_array_length(p_items) > 40 or pg_column_size(p_items) > 20000 then raise exception 'That day is too long to share'; end if;
  if (select count(*) from gd_shared_days where club_id = p_club and user_id = v_uid) >= 20 then raise exception 'You have shared 20 days here already. Take one down first.'; end if;
  delete from gd_shared_days where club_id = p_club and user_id = v_uid and name = v_name;      -- sharing the same day again replaces it
  insert into gd_shared_days (club_id, user_id, name, items) values (p_club, v_uid, v_name, p_items) returning id into v_id;
  return v_id;
end $$;

create or replace function public.gd_unshare_day(p_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  delete from gd_shared_days d where d.id = p_id
     and (d.user_id = v_uid or exists (select 1 from gd_clubs c where c.id = d.club_id and c.owner = v_uid));
  if not found then raise exception 'That is not yours to take down'; end if;
  return true;
end $$;

create or replace function public.gd_post_plan(p_club uuid, p_at timestamptz, p_note text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_id uuid; v_note text := left(btrim(coalesce(p_note, '')), 120);
begin
  if not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;
  if p_at is null or p_at < now() - interval '1 hour' or p_at > now() + interval '14 days' then raise exception 'Pick a time in the next two weeks'; end if;
  if (select count(*) from gd_plans where club_id = p_club and user_id = v_uid and at > now() - interval '3 hours') >= 10 then raise exception 'You have 10 posts up already'; end if;
  insert into gd_plans (club_id, user_id, at, note) values (p_club, v_uid, p_at, v_note) returning id into v_id;
  insert into gd_plan_joins (plan_id, user_id) values (v_id, v_uid);
  return v_id;
end $$;

create or replace function public.gd_join_plan(p_plan uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_club uuid;
begin
  select club_id into v_club from gd_plans where id = p_plan;
  if v_club is null or not gd_is_member(v_club, v_uid) then raise exception 'That post is gone'; end if;
  if p_on then insert into gd_plan_joins (plan_id, user_id) values (p_plan, v_uid) on conflict do nothing;
  else delete from gd_plan_joins where plan_id = p_plan and user_id = v_uid; end if;
  return true;
end $$;

create or replace function public.gd_delete_plan(p_plan uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  delete from gd_plans pl where pl.id = p_plan
     and (pl.user_id = v_uid or exists (select 1 from gd_clubs c where c.id = pl.club_id and c.owner = v_uid));
  if not found then raise exception 'That is not yours to take down'; end if;
  return true;
end $$;

drop function if exists public.gd_club(uuid, timestamptz);

create or replace function public.gd_club(p_club uuid, p_week timestamptz, p_now timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); c gd_clubs%rowtype; v_now timestamptz := coalesce(p_now, p_week);
        v_members jsonb; v_board jsonb; v_feed jsonb; v_ch jsonb; v_winners jsonb; v_days jsonb; v_plans jsonb; v_records jsonb;
begin
  select * into c from gd_clubs where id = p_club;
  if not found or not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;

  -- who won each of the last 12 finished weeks: most workouts, then most gym time
  select coalesce(jsonb_agg(jsonb_build_object('week', v_now - (t.k * interval '7 days'), 'user_id', t.user_id, 'name', t.name,
           'me', t.user_id = v_uid, 'workouts', t.n, 'ms', t.ms) order by t.k), '[]'::jsonb)
    into v_winners
    from (select g.k, m.user_id, coalesce(p.name, 'Someone') as name, count(w.id) as n, coalesce(sum(w.gym_ms), 0)::bigint as ms,
                 row_number() over (partition by g.k order by count(w.id) desc, coalesce(sum(w.gym_ms), 0) desc, m.joined_at, m.user_id) as rk
            from generate_series(1, 12) as g(k)
            cross join gd_club_members m
            left join gd_profiles p on p.user_id = m.user_id
            left join gd_workouts w on w.user_id = m.user_id
                 and w.started_at >= v_now - (g.k * interval '7 days') and w.started_at < v_now - ((g.k - 1) * interval '7 days')
           where m.club_id = p_club and v_now - ((g.k - 1) * interval '7 days') > c.created_at
           group by g.k, m.user_id, p.name, m.joined_at) t
   where t.rk = 1 and t.n > 0;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', coalesce(p.name, 'Someone'),
           'avatar_at', case when p.avatar is null then 0 else p.avatar_at end,
           'is_owner', m.user_id = c.owner, 'me', m.user_id = v_uid, 'joined_at', m.joined_at,
           'total', t.n, 'volume_all', t.vol, 'prs_all', t.prs, 'streak', gdx_streak(m.user_id, v_now),
           'wins', (select count(*) from jsonb_array_elements(v_winners) e where e->>'user_id' = m.user_id::text)) order by m.joined_at), '[]'::jsonb)
    into v_members
    from gd_club_members m
    left join gd_profiles p on p.user_id = m.user_id
    left join lateral (select count(*) as n, coalesce(sum(w.volume), 0) as vol, coalesce(sum(w.prs), 0)::bigint as prs
                         from gd_workouts w where w.user_id = m.user_id) t on true
   where m.club_id = p_club;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', t.name, 'avatar_at', t.av, 'me', t.user_id = v_uid,
           'workouts', t.n, 'ms', t.ms, 'volume', t.vol, 'prs', t.prs, 'streak', gdx_streak(t.user_id, v_now)) order by t.n desc, t.ms desc, t.name), '[]'::jsonb)
    into v_board
    from (select m.user_id, coalesce(p.name, 'Someone') as name, max(case when p.avatar is null then 0 else p.avatar_at end) as av,
                 count(w.id) as n, coalesce(sum(w.gym_ms), 0)::bigint as ms, coalesce(sum(w.volume), 0) as vol, coalesce(sum(w.prs), 0)::bigint as prs
            from gd_club_members m
            left join gd_profiles p on p.user_id = m.user_id
            left join gd_workouts w on w.user_id = m.user_id and w.started_at >= p_week and w.started_at < p_week + interval '7 days'
           where m.club_id = p_club group by m.user_id, p.name) t;

  select coalesce(jsonb_agg(f.j order by f.started_at desc), '[]'::jsonb) into v_feed
    from (select w.started_at, jsonb_build_object('owner_id', w.user_id, 'id', w.id, 'name', coalesce(p.name, 'Someone'),
                   'avatar_at', case when p.avatar is null then 0 else p.avatar_at end,
                   'me', w.user_id = v_uid, 'started_at', w.started_at, 'gym_ms', w.gym_ms, 'day_name', w.day_name,
                   'ex_count', w.ex_count, 'set_count', w.set_count, 'detail', w.detail, 'volume', w.volume, 'prs', w.prs,
                   'comments', (select count(*) from gd_comments cm where cm.owner_id = w.user_id and cm.workout_id = w.id
                                   and (cm.user_id = v_uid or w.user_id = v_uid or gd_shares_club(v_uid, cm.user_id))))
                 || gdx_reactions(w.user_id, w.id, v_uid) as j
            from gd_workouts w
            join gd_club_members m on m.user_id = w.user_id and m.club_id = p_club
            left join gd_profiles p on p.user_id = w.user_id
           order by w.started_at desc limit 40) f;

  if c.ch_title is not null then
    select jsonb_build_object('title', c.ch_title, 'metric', c.ch_metric, 'target', c.ch_target, 'start', c.ch_start, 'end', c.ch_end,
             'total', coalesce(sum(t.v), 0),
             'by', coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', t.name, 'me', t.user_id = v_uid, 'value', t.v)
                                      order by t.v desc, t.name), '[]'::jsonb))
      into v_ch
      from (select m.user_id, coalesce(p.name, 'Someone') as name,
                   case when c.ch_metric = 'minutes' then floor(coalesce(sum(w.gym_ms), 0) / 60000)::bigint else count(w.id) end as v
              from gd_club_members m
              left join gd_profiles p on p.user_id = m.user_id
              left join gd_workouts w on w.user_id = m.user_id and w.started_at >= c.ch_start and w.started_at < c.ch_end
             where m.club_id = p_club group by m.user_id, p.name) t;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'items', d.items, 'user_id', d.user_id,
           'by', coalesce(p.name, 'Someone'), 'me', d.user_id = v_uid, 'at', d.created_at) order by d.created_at desc), '[]'::jsonb)
    into v_days
    from gd_shared_days d left join gd_profiles p on p.user_id = d.user_id where d.club_id = p_club;

  select coalesce(jsonb_agg(jsonb_build_object('id', pl.id, 'at', pl.at, 'note', pl.note, 'user_id', pl.user_id,
           'name', coalesce(p.name, 'Someone'), 'avatar_at', case when p.avatar is null then 0 else p.avatar_at end, 'me', pl.user_id = v_uid,
           'going', (select coalesce(jsonb_agg(jsonb_build_object('user_id', j.user_id, 'name', coalesce(pj.name, 'Someone'), 'me', j.user_id = v_uid) order by j.joined_at), '[]'::jsonb)
                       from gd_plan_joins j left join gd_profiles pj on pj.user_id = j.user_id where j.plan_id = pl.id),
           'in', exists (select 1 from gd_plan_joins j where j.plan_id = pl.id and j.user_id = v_uid)) order by pl.at), '[]'::jsonb)
    into v_plans
    from gd_plans pl left join gd_profiles p on p.user_id = pl.user_id
   where pl.club_id = p_club and pl.at > now() - interval '3 hours';

  -- club records: per exercise, members' best lifts (only people who share "everything" have any)
  select coalesce(jsonb_agg(r.j order by r.cnt desc, r.name), '[]'::jsonb) into v_records
    from (select count(*) as cnt, min(x.name) as name,
                 jsonb_build_object('ex', x.ex_id, 'name', min(x.name),
                   'top', jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.pname, 'me', x.user_id = v_uid,
                                                       'w', x.w, 'reps', x.reps, 'at', x.at) order by x.w desc, x.reps desc, x.at)) as j
            from (select b.user_id, b.ex_id, b.name, b.w, b.reps, b.at, coalesce(p.name, 'Someone') as pname
                    from gd_bests b
                    join gd_club_members m on m.user_id = b.user_id and m.club_id = p_club
                    left join gd_profiles p on p.user_id = b.user_id) x
           group by x.ex_id order by count(*) desc, min(x.name) limit 80) r;

  return jsonb_build_object(
    'club', jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'is_owner', c.owner = v_uid,
                               'descr', c.descr, 'logo_at', case when c.logo is null then 0 else c.logo_at end, 'created_at', c.created_at),
    'members', v_members, 'board', v_board, 'feed', v_feed, 'challenge', v_ch,
    'winners', v_winners, 'days', v_days, 'plans', v_plans, 'records', v_records);
end $$;

create or replace function public.gd_member(p_user uuid, p_week timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); p gd_profiles%rowtype;
begin
  if not gd_shares_club(v_uid, p_user) then raise exception 'You are not in a club with this person'; end if;
  select * into p from gd_profiles where user_id = p_user;
  if not found then raise exception 'That person is no longer here'; end if;
  return jsonb_build_object('user_id', p_user, 'name', p.name, 'me', p_user = v_uid, 'share', p.share, 'since', p.created_at,
    'avatar_at', case when p.avatar is null then 0 else p.avatar_at end,
    'streak', gdx_streak(p_user, p_week),
    'all', (select jsonb_build_object('workouts', count(*), 'ms', coalesce(sum(gym_ms), 0)::bigint, 'volume', coalesce(sum(volume), 0), 'prs', coalesce(sum(prs), 0)::bigint)
              from gd_workouts where user_id = p_user),
    'week', (select jsonb_build_object('workouts', count(*), 'ms', coalesce(sum(gym_ms), 0)::bigint, 'volume', coalesce(sum(volume), 0), 'prs', coalesce(sum(prs), 0)::bigint)
               from gd_workouts where user_id = p_user and started_at >= p_week and started_at < p_week + interval '7 days'),
    'four', (select jsonb_build_object('workouts', count(*), 'ms', coalesce(sum(gym_ms), 0)::bigint, 'volume', coalesce(sum(volume), 0), 'prs', coalesce(sum(prs), 0)::bigint)
               from gd_workouts where user_id = p_user and started_at >= p_week - interval '21 days' and started_at < p_week + interval '7 days'),
    'recent', coalesce((select jsonb_agg(r.j order by r.started_at desc)
                          from (select w.started_at, jsonb_build_object('id', w.id, 'started_at', w.started_at, 'gym_ms', w.gym_ms, 'day_name', w.day_name,
                                         'ex_count', w.ex_count, 'set_count', w.set_count, 'volume', w.volume, 'prs', w.prs, 'detail', w.detail) as j
                                  from gd_workouts w where w.user_id = p_user order by w.started_at desc limit 10) r), '[]'::jsonb),
    'bests', coalesce((select jsonb_agg(jsonb_build_object('ex', b.ex_id, 'name', b.name, 'w', b.w, 'reps', b.reps, 'at', b.at) order by b.w desc, b.name)
                         from gd_bests b where b.user_id = p_user), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(c.name order by c.name) from gd_clubs c
                        where gd_is_member(c.id, v_uid) and gd_is_member(c.id, p_user)), '[]'::jsonb));
end $$;

create or replace function public.gd_news(p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_from timestamptz := greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '14 days');
begin
  return coalesce((select jsonb_agg(e.j order by e.ts desc) from (
    select u.ts, u.j from (
      select ch.created_at as ts, jsonb_build_object('type', 'react', 'kind', ch.kind, 'name', coalesce(p.name, 'Someone'), 'user_id', ch.user_id,
               'day_name', w.day_name, 'owner_id', ch.owner_id, 'workout_id', ch.workout_id, 'at', ch.created_at) as j
        from gd_cheers ch
        join gd_workouts w on w.user_id = ch.owner_id and w.id = ch.workout_id
        left join gd_profiles p on p.user_id = ch.user_id
       where ch.owner_id = v_uid and ch.user_id <> v_uid and ch.created_at > v_from
      union all
      select cm.created_at, jsonb_build_object('type', 'comment', 'name', coalesce(p.name, 'Someone'), 'user_id', cm.user_id, 'body', left(cm.body, 120),
               'day_name', w.day_name, 'owner_id', cm.owner_id, 'workout_id', cm.workout_id, 'at', cm.created_at)
        from gd_comments cm
        join gd_workouts w on w.user_id = cm.owner_id and w.id = cm.workout_id
        left join gd_profiles p on p.user_id = cm.user_id
       where cm.owner_id = v_uid and cm.user_id <> v_uid and cm.created_at > v_from
      union all
      select w.created_at, jsonb_build_object('type', 'workout', 'name', coalesce(p.name, 'Someone'), 'user_id', w.user_id,
               'day_name', w.day_name, 'gym_ms', w.gym_ms, 'prs', w.prs, 'at', w.created_at)
        from gd_workouts w left join gd_profiles p on p.user_id = w.user_id
       where w.user_id <> v_uid and w.created_at > v_from and w.started_at > v_from - interval '1 day' and gd_shares_club(v_uid, w.user_id)
      union all
      select pl.created_at, jsonb_build_object('type', 'plan', 'name', coalesce(p.name, 'Someone'), 'user_id', pl.user_id,
               'club', c.name, 'club_id', c.id, 'when', pl.at, 'note', pl.note, 'at', pl.created_at)
        from gd_plans pl join gd_clubs c on c.id = pl.club_id left join gd_profiles p on p.user_id = pl.user_id
       where pl.user_id <> v_uid and pl.created_at > v_from and gd_is_member(pl.club_id, v_uid)
      union all
      select j.joined_at, jsonb_build_object('type', 'join', 'name', coalesce(p.name, 'Someone'), 'user_id', j.user_id,
               'club', c.name, 'club_id', c.id, 'when', pl.at, 'at', j.joined_at)
        from gd_plan_joins j join gd_plans pl on pl.id = j.plan_id join gd_clubs c on c.id = pl.club_id left join gd_profiles p on p.user_id = j.user_id
       where pl.user_id = v_uid and j.user_id <> v_uid and j.joined_at > v_from
      union all
      select m.joined_at, jsonb_build_object('type', 'member', 'name', coalesce(p.name, 'Someone'), 'user_id', m.user_id,
               'club', c.name, 'club_id', c.id, 'at', m.joined_at)
        from gd_club_members m join gd_clubs c on c.id = m.club_id left join gd_profiles p on p.user_id = m.user_id
       where m.user_id <> v_uid and m.joined_at > v_from and gd_is_member(m.club_id, v_uid)
    ) u order by u.ts desc limit 60) e), '[]'::jsonb);
end $$;

create or replace function public.gd_go(c text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text := left(upper(regexp_replace(coalesce(c, ''), '[^A-Za-z0-9]', '', 'g')), 12);
begin
  perform set_config('response.status', '302', true);
  perform set_config('response.headers', json_build_array(json_build_object('Location', 'gymday://join/' || v))::text, true);
  return 'Opening GymDay. If nothing happens: open GymDay, tap Clubs, then Join with a code, and type ' || v;
end $$;

create or replace function public.gd_latest() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('code', code, 'name', name, 'url', url, 'notes', notes, 'at', updated_at) from gd_app where id = 1
$$;

create or replace function public.gd_set_latest(p_code integer, p_name text, p_url text, p_notes text default '') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text := btrim(coalesce(p_url, ''));
begin
  if not gd_is_admin() then raise exception 'Only the person who looks after GymDay can do this'; end if;
  if p_code is null or p_code < 1 then raise exception 'Bad version number'; end if;
  if v_url !~* '^https://[^[:space:]]+$' or char_length(v_url) > 500 then raise exception 'The download link has to start with https://'; end if;
  insert into gd_app (id, code, name, url, notes) values (1, p_code, left(btrim(coalesce(p_name, '')), 20), v_url, left(btrim(coalesce(p_notes, '')), 400))
  on conflict (id) do update set code = excluded.code, name = excluded.name, url = excluded.url, notes = excluded.notes, updated_at = now();
  return gd_latest();
end $$;

-- ===================================================================== who may call what
grant usage on schema public to authenticated;
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and left(p.proname, 3) = 'gd_'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- inner helpers: nobody calls these from outside
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and left(p.proname, 4) = 'gdx_'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- the invite link is opened in a browser by someone who is not signed in; the app asks about new versions before sign-in too
grant execute on function public.gd_go(text) to anon;
grant execute on function public.gd_latest() to anon;


select 'GymDay v1.5 update finished' as result;
