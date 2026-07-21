-- Kkiu initial Supabase schema.
-- Run this only in a new project after reviewing it in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '나' check (char_length(display_name) between 1 and 40),
  emoji text not null default '🙂' check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  emoji text not null default '🍀' check (char_length(emoji) between 1 and 16),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) between 1 and 16),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  assignee_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 500),
  position bigint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (circle_id is not null or assignee_id is null)
);

create index if not exists tasks_owner_position_idx on public.tasks(owner_id, position) where circle_id is null;
create index if not exists tasks_circle_position_idx on public.tasks(circle_id, position) where circle_id is not null;
create index if not exists tasks_assignee_idx on public.tasks(assignee_id) where assignee_id is not null;
create index if not exists circle_members_user_idx on public.circle_members(user_id, circle_id);

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_circle_member(target_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.circle_members
    where circle_id = target_circle_id and user_id = auth.uid()
  );
$$;

create or replace function private.is_circle_owner(target_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.circle_members
    where circle_id = target_circle_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function private.shares_circle(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;

revoke all on function private.is_circle_member(uuid) from public;
revoke all on function private.is_circle_owner(uuid) from public;
revoke all on function private.shares_circle(uuid) from public;
grant execute on function private.is_circle_member(uuid) to authenticated;
grant execute on function private.is_circle_owner(uuid) to authenticated;
grant execute on function private.shares_circle(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_task_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (old.owner_id is distinct from new.owner_id or old.circle_id is distinct from new.circle_id) then
    raise exception 'Task ownership and scope cannot be changed';
  end if;
  if new.circle_id is not null and new.assignee_id is not null and not exists (
    select 1 from public.circle_members
    where circle_id = new.circle_id and user_id = new.assignee_id
  ) then
    raise exception 'Assignee must be a Circle member';
  end if;
  return new;
end;
$$;

create or replace function public.protect_last_circle_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') and not exists (
    select 1 from public.circle_members
    where circle_id = old.circle_id and user_id <> old.user_id and role = 'owner'
  ) then
    raise exception 'A Circle must keep at least one owner';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists circles_set_updated_at on public.circles;
create trigger circles_set_updated_at before update on public.circles for each row execute function public.set_updated_at();
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
drop trigger if exists tasks_protect_identity on public.tasks;
create trigger tasks_protect_identity before insert or update on public.tasks for each row execute function public.protect_task_identity();
drop trigger if exists circle_members_protect_owner on public.circle_members;
create trigger circle_members_protect_owner before update or delete on public.circle_members for each row execute function public.protect_last_circle_owner();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), '나'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke all on function public.set_updated_at() from public;
revoke all on function public.protect_task_identity() from public;
revoke all on function public.protect_last_circle_owner() from public;
revoke all on function public.handle_new_user() from public;

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.tasks enable row level security;

create policy "profiles_select_shared" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id or private.shares_circle(user_id));
create policy "profiles_insert_self" on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "profiles_update_self" on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "circles_select_member" on public.circles for select to authenticated
using (created_by = (select auth.uid()) or private.is_circle_member(id));
create policy "circles_insert_self" on public.circles for insert to authenticated
with check ((select auth.uid()) is not null and created_by = (select auth.uid()));
create policy "circles_update_owner" on public.circles for update to authenticated
using (private.is_circle_owner(id)) with check (private.is_circle_owner(id));
create policy "circles_delete_owner" on public.circles for delete to authenticated
using (private.is_circle_owner(id));

create policy "circle_members_select_member" on public.circle_members for select to authenticated
using (private.is_circle_member(circle_id));
create policy "circle_members_insert_owner" on public.circle_members for insert to authenticated
with check (
  private.is_circle_owner(circle_id)
  or (user_id = (select auth.uid()) and role = 'owner' and exists (
    select 1 from public.circles where id = circle_id and created_by = (select auth.uid())
  ))
);
create policy "circle_members_update_owner" on public.circle_members for update to authenticated
using (private.is_circle_owner(circle_id)) with check (private.is_circle_owner(circle_id));
create policy "circle_members_delete_owner_or_self" on public.circle_members for delete to authenticated
using (private.is_circle_owner(circle_id) or user_id = (select auth.uid()));

create policy "tasks_select_scope" on public.tasks for select to authenticated
using (
  ((select auth.uid()) is not null and circle_id is null and owner_id = (select auth.uid()))
  or (circle_id is not null and private.is_circle_member(circle_id))
);
create policy "tasks_insert_scope" on public.tasks for insert to authenticated
with check (
  (select auth.uid()) is not null and owner_id = (select auth.uid()) and (
    circle_id is null or private.is_circle_member(circle_id)
  )
);
create policy "tasks_update_scope" on public.tasks for update to authenticated
using (
  (circle_id is null and owner_id = (select auth.uid()))
  or (circle_id is not null and private.is_circle_member(circle_id))
)
with check (
  (circle_id is null and owner_id = (select auth.uid()))
  or (circle_id is not null and private.is_circle_member(circle_id))
);
create policy "tasks_delete_scope" on public.tasks for delete to authenticated
using (
  (circle_id is null and owner_id = (select auth.uid()))
  or (circle_id is not null and private.is_circle_member(circle_id))
);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, update, delete on public.circle_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

