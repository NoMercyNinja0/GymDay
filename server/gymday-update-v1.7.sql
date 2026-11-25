-- GymDay: update a server that has the v1.6 setup to v1.7 (training now in clubs; a daily count for reading meal photos).
-- Safe to run more than once.
-- training now (v1.7): while a workout is running the app says so every few minutes; club mates see it for 20 minutes after the last word
alter table public.gd_profiles add column if not exists live_at    timestamptz;
alter table public.gd_profiles add column if not exists live_since timestamptz;
alter table public.gd_profiles add column if not exists live_day   text check (live_day is null or char_length(live_day) <= 60);

create or replace function public.gd_live(p_on boolean, p_day text default '') returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if p_on then
    update gd_profiles
       set live_since = case when live_at is null or live_at < now() - interval '20 minutes' then now() else coalesce(live_since, now()) end,
           live_at = now(), live_day = nullif(left(btrim(coalesce(p_day, '')), 60), '')
     where user_id = v_uid;
  else
    update gd_profiles set live_at = null, live_since = null, live_day = null where user_id = v_uid;
  end if;
  return found;
end $$;

-- everyone training right now in the clubs I am in (people who share nothing with clubs are left out)
create or replace function public.gd_live_all() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('club_id', m.club_id, 'user_id', m.user_id, 'name', coalesce(p.name, 'Someone'),
           'me', m.user_id = gd_uid(), 'day', p.live_day, 'since', p.live_since) order by p.live_since, m.user_id), '[]'::jsonb)
    from gd_club_members mine
    join gd_club_members m on m.club_id = mine.club_id
    join gd_profiles p on p.user_id = m.user_id
   where mine.user_id = gd_uid() and p.live_at > now() - interval '20 minutes' and p.share <> 'none';
$$;

-- reading meal photos (v1.7): the photo-reading function counts each read here, per person and day, and stops at 40 a day
create table if not exists public.gd_ai_use (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  n       integer not null default 0,
  primary key (user_id, day)
);
alter table public.gd_ai_use enable row level security;
revoke all on public.gd_ai_use from anon, authenticated;

create or replace function public.gd_ai_use() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_day date := (now() at time zone 'utc')::date; v_n integer;
begin
  delete from gd_ai_use where user_id = v_uid and day < v_day - 30;
  select n into v_n from gd_ai_use where user_id = v_uid and day = v_day;
  if coalesce(v_n, 0) >= 40 then raise exception 'That is enough photos for today. Type the calories for this one.'; end if;
  insert into gd_ai_use (user_id, day, n) values (v_uid, v_day, 1)
    on conflict (user_id, day) do update set n = gd_ai_use.n + 1 returning n into v_n;
  return v_n;
end $$;

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

select 'GymDay v1.7 update finished' as result;
