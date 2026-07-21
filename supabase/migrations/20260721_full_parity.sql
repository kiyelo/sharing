-- Kkiu v18.4.8 full-parity persistence migration
create extension if not exists pgcrypto;

alter table public.circles add column if not exists invite_code text;
update public.circles set invite_code = 'KKIU-' || upper(substr(replace(id::text,'-',''),1,8)) where invite_code is null;
alter table public.circles alter column invite_code set not null;
create unique index if not exists circles_invite_code_key on public.circles(upper(invite_code));

alter table public.circle_members add column if not exists position bigint not null default 0;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

create table if not exists public.task_read_receipts (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key(task_id,user_id)
);
create table if not exists public.completion_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  title text not null,
  lead_ms bigint not null default 0,
  completed_at timestamptz not null default now()
);

create or replace function public.join_circle_by_code(join_code text, member_name text default '나', member_emoji text default '🙂')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
  select id into target from public.circles where upper(invite_code)=upper(trim(join_code));
  if target is null then raise exception 'INVALID_INVITE_CODE'; end if;
  insert into public.circle_members(circle_id,user_id,role,nickname,emoji,position)
  values(target,auth.uid(),'member',left(coalesce(nullif(trim(member_name),''),'나'),40),left(coalesce(nullif(member_emoji,''),'🙂'),16),
    coalesce((select max(position)+1 from public.circle_members where circle_id=target),0))
  on conflict(circle_id,user_id) do update set nickname=excluded.nickname,emoji=excluded.emoji;
  return target;
end $$;
revoke all on function public.join_circle_by_code(text,text,text) from public;
grant execute on function public.join_circle_by_code(text,text,text) to authenticated;

alter table public.task_read_receipts enable row level security;
alter table public.completion_events enable row level security;
drop policy if exists "read_receipts_self" on public.task_read_receipts;
create policy "read_receipts_self" on public.task_read_receipts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists "completion_events_visible" on public.completion_events;
create policy "completion_events_visible" on public.completion_events for select to authenticated using(user_id=(select auth.uid()) or (circle_id is not null and private.is_circle_member(circle_id)));
drop policy if exists "completion_events_insert_self" on public.completion_events;
create policy "completion_events_insert_self" on public.completion_events for insert to authenticated with check(user_id=(select auth.uid()));

-- Preserve the task's active rank while completed and invalidate stale reads.
alter table public.tasks add column if not exists completed_position bigint;
create or replace function public.clear_task_read_receipts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.title is distinct from new.title or old.assignee_id is distinct from new.assignee_id or old.completed_at is distinct from new.completed_at then
    delete from public.task_read_receipts where task_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists tasks_clear_read_receipts on public.tasks;
create trigger tasks_clear_read_receipts after update on public.tasks for each row execute function public.clear_task_read_receipts();
revoke all on function public.clear_task_read_receipts() from public;
