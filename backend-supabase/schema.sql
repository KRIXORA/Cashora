-- ==========================================================================
-- Cashora — Supabase schema
-- Run this once in Supabase: Project > SQL Editor > New Query > Run
-- ==========================================================================

-- ---------- Transactions ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (char_length(category) between 1 and 100),
  amount numeric not null check (amount > 0 and amount <= 100000000),
  date date not null,
  created_at timestamptz not null default now()
);

-- ---------- Budgets ----------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 100),
  limit_amount numeric not null check (limit_amount > 0 and limit_amount <= 100000000),
  unique (user_id, category)
);

-- ---------- Goals ----------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  target numeric not null check (target > 0 and target <= 100000000),
  saved numeric not null default 0 check (saved >= 0),
  deadline date
);

-- ---------- Recurring transactions ----------
-- A "rule" the app checks on every login: if next_run_date has passed, it inserts
-- a matching transaction and advances next_run_date. There's no server-side cron
-- here (this is a static frontend) — recurring entries are caught up client-side
-- the next time the user opens the app, which is fine for a personal finance tool.
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

-- ---------- Row Level Security ----------
-- This is what makes it safe: every user can ONLY see and modify their own rows.
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table goals enable row level security;
alter table recurring_transactions enable row level security;

create policy "Users manage their own transactions"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own budgets"
  on budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own recurring transactions"
  on recurring_transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Indexes ----------
create index if not exists idx_tx_user on transactions(user_id);
create index if not exists idx_budget_user on budgets(user_id);
create index if not exists idx_goal_user on goals(user_id);
create index if not exists idx_recurring_user on recurring_transactions(user_id);

-- ==========================================================================
-- MIGRATION — run this block ONCE if your tables already existed before
-- these CHECK constraints were added (skip it on a brand-new project; the
-- CREATE TABLE statements above already include them there).
-- ==========================================================================
-- alter table transactions add constraint transactions_title_len check (char_length(title) between 1 and 200);
-- alter table transactions add constraint transactions_category_len check (char_length(category) between 1 and 100);
-- alter table transactions add constraint transactions_amount_max check (amount <= 100000000);
-- alter table budgets add constraint budgets_category_len check (char_length(category) between 1 and 100);
-- alter table budgets add constraint budgets_limit_max check (limit_amount <= 100000000);
-- alter table goals add constraint goals_name_len check (char_length(name) between 1 and 200);
-- alter table goals add constraint goals_target_max check (target <= 100000000);
-- alter table goals add constraint goals_saved_nonnegative check (saved >= 0);
