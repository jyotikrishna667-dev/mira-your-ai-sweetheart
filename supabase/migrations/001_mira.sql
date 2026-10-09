-- Mira: private cloud storage. Run this once in Supabase -> SQL Editor.

create table if not exists public.mira_chats (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists mira_chats_user_updated on public.mira_chats (user_id, updated_at desc);

create table if not exists public.mira_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  facts jsonb not null default '[]'::jsonb,
  seeded boolean not null default false
);

alter table public.mira_chats enable row level security;
alter table public.mira_meta enable row level security;

-- Only the owner's Google account (and only their own rows) can read or write.
drop policy if exists "owner chats" on public.mira_chats;
create policy "owner chats" on public.mira_chats for all to authenticated
  using (user_id = auth.uid() and (auth.jwt() ->> 'email') = 'jyotikrishna667@gmail.com')
  with check (user_id = auth.uid() and (auth.jwt() ->> 'email') = 'jyotikrishna667@gmail.com');

drop policy if exists "owner meta" on public.mira_meta;
create policy "owner meta" on public.mira_meta for all to authenticated
  using (user_id = auth.uid() and (auth.jwt() ->> 'email') = 'jyotikrishna667@gmail.com')
  with check (user_id = auth.uid() and (auth.jwt() ->> 'email') = 'jyotikrishna667@gmail.com');

-- Block sign-ups from any other Google account at the database level too.
create or replace function public.only_owner_signup() returns trigger language plpgsql security definer as $$
begin
  if lower(new.email) <> 'jyotikrishna667@gmail.com' then
    raise exception 'This app is private';
  end if;
  return new;
end $$;
drop trigger if exists only_owner_signup on auth.users;
create trigger only_owner_signup before insert on auth.users for each row execute function public.only_owner_signup();
