-- GymDay: update a server that has the v1.7 setup to v1.8 (report and block, which the app stores ask of an app where people
-- post things: club chat, comments, names, pictures; and reports about an AI answer). Safe to run more than once.

-- What someone reported. Only the person who looks after GymDay (gd_is_admin) can read these, in the app (Settings → Reports).
create table if not exists public.gd_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('message', 'comment', 'user', 'club', 'ai')),
  club_id     uuid references public.gd_clubs(id) on delete set null,
  target_user uuid references auth.users(id) on delete set null,
  item_id     uuid,                                                    -- the message or comment (it may be deleted since)
  body        text check (body is null or char_length(body) <= 600),  -- a copy of what was reported, as it was then
  reason      text not null check (char_length(reason) between 1 and 40),
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users(id) on delete set null,
  outcome     text
);
create index if not exists gd_reports_open on public.gd_reports (created_at desc) where done_at is null;
create index if not exists gd_reports_by on public.gd_reports (reporter, created_at);
alter table public.gd_reports enable row level security;
revoke all on public.gd_reports from anon, authenticated;

-- Who someone blocked: the app hides that person's messages, comments and workouts from them. The other person is not told.
create table if not exists public.gd_blocks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked)
);
alter table public.gd_blocks enable row level security;
revoke all on public.gd_blocks from anon, authenticated;

create or replace function public.gd_report(p_kind text, p_club uuid default null, p_user uuid default null, p_item uuid default null,
                                            p_reason text default null, p_note text default '', p_body text default '') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid(); v_body text := left(btrim(coalesce(p_body, '')), 600); v_club uuid := p_club; v_user uuid := p_user;
        v_b text; v_c uuid; v_u uuid;
begin
  if p_kind not in ('message', 'comment', 'user', 'club', 'ai') then raise exception 'Unknown kind of report'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Choose what is wrong'; end if;
  if (select count(*) from gd_reports where reporter = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of reports for one day. Try again tomorrow.';
  end if;
  -- what was reported is kept as it is now, so a deleted message can still be looked at
  if p_kind = 'message' and p_item is not null then
    select m.body, m.club_id, m.user_id into v_b, v_c, v_u from gd_messages m where m.id = p_item;
    if v_c is not null then
      if not gd_is_member(v_c, v_uid) then raise exception 'You are not in this club'; end if;
      v_body := v_b; v_club := v_c; v_user := v_u;
    end if;
  elsif p_kind = 'comment' and p_item is not null then
    select c.body, c.user_id into v_b, v_u from gd_comments c where c.id = p_item;
    if v_u is not null then v_body := v_b; v_user := v_u; end if;
  elsif p_kind = 'club' and p_club is not null then
    if not gd_is_member(p_club, v_uid) then raise exception 'You are not in this club'; end if;
    select left(c.name || coalesce(' · ' || nullif(c.descr, ''), ''), 600) into v_body from gd_clubs c where c.id = p_club;
  end if;
  insert into gd_reports (reporter, kind, club_id, target_user, item_id, body, reason, note)
  values (v_uid, p_kind, v_club, v_user, p_item, nullif(left(coalesce(v_body, p_body, ''), 600), ''), left(btrim(p_reason), 40),
          nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gd_blocks() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', b.blocked, 'name', coalesce(p.name, 'Someone')) order by b.created_at), '[]'::jsonb)
    from gd_blocks b left join gd_profiles p on p.user_id = b.blocked
   where b.user_id = gd_uid()
$$;

create or replace function public.gd_block(p_user uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := gd_uid();
begin
  if p_user is null or p_user = v_uid then raise exception 'You can''t block yourself'; end if;
  if p_on then
    if (select count(*) from gd_blocks where user_id = v_uid) >= 500 then raise exception 'That is a lot of people blocked already'; end if;
    insert into gd_blocks (user_id, blocked) values (v_uid, p_user) on conflict do nothing;
  else
    delete from gd_blocks where user_id = v_uid and blocked = p_user;
  end if;
  return gd_blocks();
end $$;

-- For the person who looks after GymDay: the reports still open, newest first, with who and where.
create or replace function public.gd_reports_open() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not gd_is_admin() then raise exception 'Only the person who looks after GymDay can see reports'; end if;
  return coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
    select r.created_at, jsonb_build_object('id', r.id, 'kind', r.kind, 'reason', r.reason, 'note', r.note, 'body', r.body, 'at', r.created_at,
             'club_id', r.club_id, 'club', c.name, 'item_id', r.item_id,
             'user_id', r.target_user, 'user', coalesce(pu.name, case when r.target_user is null then null else 'Someone' end),
             'by', coalesce(pr.name, 'Someone'),
             'gone', case when r.kind = 'message' then not exists (select 1 from gd_messages m where m.id = r.item_id)
                          when r.kind = 'comment' then not exists (select 1 from gd_comments m where m.id = r.item_id) else false end) as j
      from gd_reports r left join gd_clubs c on c.id = r.club_id left join gd_profiles pu on pu.user_id = r.target_user
           left join gd_profiles pr on pr.user_id = r.reporter
     where r.done_at is null
     order by r.created_at desc limit 100) x), '[]'::jsonb);
end $$;

-- Deal with a report: 'none' (nothing wrong), 'delete' (take the message or comment down), 'remove' (take the person out of that
-- club), or 'both'. Every report is closed with what was done.
create or replace function public.gd_report_done(p_id uuid, p_action text default 'none') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r gd_reports%rowtype; v_out text := 'nothing';
begin
  if not gd_is_admin() then raise exception 'Only the person who looks after GymDay can deal with reports'; end if;
  select * into r from gd_reports where id = p_id;
  if r.id is null then raise exception 'That report is gone'; end if;
  if p_action not in ('none', 'delete', 'remove', 'both') then raise exception 'Unknown action'; end if;
  if p_action in ('delete', 'both') and r.item_id is not null then
    if r.kind = 'message' then delete from gd_messages where id = r.item_id; end if;
    if r.kind = 'comment' then delete from gd_comments where id = r.item_id; end if;
    v_out := 'deleted';
  end if;
  if p_action in ('remove', 'both') and r.club_id is not null and r.target_user is not null then
    if exists (select 1 from gd_clubs where id = r.club_id and owner = r.target_user) then
      v_out := v_out || ', runs the club so not removed';
    else
      delete from gd_club_members where club_id = r.club_id and user_id = r.target_user;
      perform gdx_out_of_club(r.club_id, r.target_user);
      v_out := case when v_out = 'nothing' then 'removed' else v_out || ', removed' end;
    end if;
  end if;
  update gd_reports set done_at = now(), done_by = gd_uid(), outcome = v_out where id = p_id;
  return gd_reports_open();
end $$;

-- who may call what (as in the setup): the new gd_ functions to anyone signed in
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('gd_report', 'gd_blocks', 'gd_block', 'gd_reports_open', 'gd_report_done')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

select 'GymDay v1.8 update finished' as result;
