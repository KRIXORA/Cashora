-- ==========================================================================
-- Cashora — Feature expansion migration
-- Run once in Supabase SQL Editor after schema.sql
-- ==========================================================================

-- Notes on transactions
alter table transactions add column if not exists notes text;
alter table transactions add column if not exists tags text[] default '{}';

-- Manual accounts for net worth (assets / liabilities)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('asset', 'liability')),
  balance numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;

create policy "Users manage their own accounts"
  on accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_accounts_user on accounts(user_id);

-- Debts for payoff planning
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  balance numeric not null check (balance >= 0),
  interest_rate numeric not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  min_payment numeric not null default 0 check (min_payment >= 0),
  created_at timestamptz not null default now()
);

alter table debts enable row level security;

create policy "Users manage their own debts"
  on debts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_debts_user on debts(user_id);
