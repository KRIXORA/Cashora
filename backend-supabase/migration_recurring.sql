-- ==========================================================================
-- Cashora — Migration: add recurring transactions
-- Your project already has transactions/budgets/goals from before, so just
-- run THIS file (not the full schema.sql) in Supabase: SQL Editor > New Query > Run
-- ==========================================================================

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (char_length(category) between 1 and 100),
  amount numeric not null check (amount > 0 and amount <= 100000000),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_run_date date not null,
  created_at timestamptz not null default now()
);

alter table recurring_transactions enable row level security;

create policy "Users manage their own recurring transactions"
  on recurring_transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_recurring_user on recurring_transactions(user_id);
