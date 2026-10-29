-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.
-- 기존 style_presets 데이터는 유지하고 커뮤니티 항목만 추가합니다.

alter table public.style_presets
  add column if not exists description text not null default '',
  add column if not exists is_public boolean not null default false,
  add column if not exists author_name text not null default '익명 사용자';

grant select on table public.style_presets to anon;

drop policy if exists "Public presets are readable" on public.style_presets;
create policy "Public presets are readable"
on public.style_presets
for select
to anon, authenticated
using (is_public = true);

create table if not exists public.saved_equations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  script text not null check (char_length(script) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists saved_equations_user_id_idx on public.saved_equations(user_id);
alter table public.saved_equations enable row level security;

revoke all on table public.saved_equations from anon, authenticated;
grant select, insert, update, delete on table public.saved_equations to authenticated;

drop policy if exists "Users can view own equations" on public.saved_equations;
create policy "Users can view own equations" on public.saved_equations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own equations" on public.saved_equations;
create policy "Users can insert own equations" on public.saved_equations for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own equations" on public.saved_equations;
create policy "Users can update own equations" on public.saved_equations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own equations" on public.saved_equations;
create policy "Users can delete own equations" on public.saved_equations for delete to authenticated using ((select auth.uid()) = user_id);

