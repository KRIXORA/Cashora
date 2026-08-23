-- ==========================================================================
-- Cashora — Production hardening migration
-- Run once in Supabase SQL Editor (after schema.sql / migration_recurring.sql)
-- ==========================================================================

-- Soft-delete support: rows stay recoverable for 30 days of accidental deletes.
-- App currently still hard-deletes; these columns are ready for a future soft-delete pass
-- and for manual recovery in the Supabase dashboard.

alter table transactions
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table budgets
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table goals
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table recurring_transactions
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Auto-touch updated_at on change
create or replace function cashora_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tx_updated on transactions;
create trigger trg_tx_updated before update on transactions
  for each row execute function cashora_set_updated_at();

drop trigger if exists trg_budget_updated on budgets;
create trigger trg_budget_updated before update on budgets
  for each row execute function cashora_set_updated_at();

drop trigger if exists trg_goal_updated on goals;
create trigger trg_goal_updated before update on goals
  for each row execute function cashora_set_updated_at();

drop trigger if exists trg_recurring_updated on recurring_transactions;
create trigger trg_recurring_updated before update on recurring_transactions
  for each row execute function cashora_set_updated_at();

-- Helpful partial indexes for non-deleted rows
create index if not exists idx_tx_user_active on transactions(user_id) where deleted_at is null;
create index if not exists idx_tx_user_date on transactions(user_id, date desc) where deleted_at is null;

-- Optional: simple audit log for destructive actions (append-only, RLS-protected)
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 100),
  entity text not null check (char_length(entity) between 1 and 50),
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "Users read their own audit log"
  on audit_log for select
  using (auth.uid() = user_id);

create policy "Users insert their own audit log"
  on audit_log for insert
  with check (auth.uid() = user_id);

-- No update/delete policies on purpose — audit rows are immutable from the client.

create index if not exists idx_audit_user on audit_log(user_id, created_at desc);
