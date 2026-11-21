-- Notificaciones push: suscripciones de dispositivos y registro de envíos.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  loan_id uuid not null,
  installment_number integer not null,
  kind text not null check (kind in ('due_today', 'overdue')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now(),
  unique (business_id, user_id, loan_id, installment_number, kind)
);
alter table public.push_deliveries enable row level security;
