-- Quick fix: add notes column only (if you don't want the full migration_features.sql yet)
alter table transactions add column if not exists notes text;
alter table transactions add column if not exists tags text[] default '{}';
