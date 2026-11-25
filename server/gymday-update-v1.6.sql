-- GymDay: update a server that has the v1.5 setup to v1.6 (club chat). Safe to run more than once.
-- club chat (v1.6): a simple message board in each club
create table if not exists public.gd_messages (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.gd_clubs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists gd_messages_club on public.gd_messages (club_id, created_at desc);
create index if not exists gd_messages_user on public.gd_messages (user_id, created_at);
alter table public.gd_messages    enable row level security;
revoke all on public.gd_messages from anon, authenticated;


create or replace function public.gd_chat(p_club uuid, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_owner uuid;
begin
  select owner into v_owner from gd_clubs where id = p_club;
  if v_owner is null or not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;
  return jsonb_build_object(
    'messages', coalesce((select jsonb_agg(x.j order by x.created_at, x.id) from (
        select m.created_at, m.id, jsonb_build_object('id', m.id, 'user_id', m.user_id, 'name', coalesce(p.name, 'Someone'),
                 'avatar_at', case when p.avatar is null then 0 else p.avatar_at end, 'me', m.user_id = v_uid,
                 'body', m.body, 'at', m.created_at, 'can_delete', m.user_id = v_uid or v_owner = v_uid) as j
          from gd_messages m left join gd_profiles p on p.user_id = m.user_id
         where m.club_id = p_club and (p_before is null or m.created_at < p_before)
         order by m.created_at desc, m.id desc limit 50) x), '[]'::jsonb),
    'more', (select count(*) > 50 from gd_messages m where m.club_id = p_club and (p_before is null or m.created_at < p_before)));
end $$;

create or replace function public.gd_chat_send(p_club uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_body text := btrim(coalesce(p_body, ''));
begin
  if not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;
  if char_length(v_body) < 1 then raise exception 'Write something first'; end if;
  if char_length(v_body) > 500 then raise exception 'That message is too long (500 characters at most)'; end if;
  if (select count(*) from gd_messages where user_id = v_uid and created_at > now() - interval '1 hour') >= 120 then raise exception 'That is a lot of messages. Try again in a while.'; end if;
  insert into gd_messages (club_id, user_id, body) values (p_club, v_uid, v_body);
  return gd_chat(p_club);
end $$;

create or replace function public.gd_chat_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_club uuid;
begin
  delete from gd_messages m where m.id = p_id
     and (m.user_id = v_uid or exists (select 1 from gd_clubs c where c.id = m.club_id and c.owner = v_uid))
  returning m.club_id into v_club;
  if v_club is null then raise exception 'That message is not yours to delete'; end if;
  return gd_chat(v_club);
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
      select cm.created_at, jsonb_build_object('type', 'chat', 'name', coalesce(p.name, 'Someone'), 'user_id', cm.user_id, 'body', left(cm.body, 120),
               'club', c.name, 'club_id', c.id, 'at', cm.created_at)
        from gd_messages cm join gd_clubs c on c.id = cm.club_id left join gd_profiles p on p.user_id = cm.user_id
       where cm.user_id <> v_uid and cm.created_at > v_from and gd_is_member(cm.club_id, v_uid)
      union all
      select m.joined_at, jsonb_build_object('type', 'member', 'name', coalesce(p.name, 'Someone'), 'user_id', m.user_id,
               'club', c.name, 'club_id', c.id, 'at', m.joined_at)
        from gd_club_members m join gd_clubs c on c.id = m.club_id left join gd_profiles p on p.user_id = m.user_id
       where m.user_id <> v_uid and m.joined_at > v_from and gd_is_member(m.club_id, v_uid)
    ) u order by u.ts desc limit 60) e), '[]'::jsonb);
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

select 'GymDay v1.6 update finished' as result;
