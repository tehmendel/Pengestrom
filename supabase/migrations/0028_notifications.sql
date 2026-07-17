-- Varsler for feilede bakgrunnsoperasjoner (kursoppdatering m.m.) — vises via
-- bjelle-ikonet i sidemenyen. 'detail' holder strukturert info (f.eks. liste
-- over hvilke fond som feilet og hvorfor) til "Detaljer"-visningen i UI.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  source text not null check (source in ('cron', 'manual')),
  title text not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notifications enable row level security;

create policy "notifications_select" on notifications for select
  using (is_household_member(household_id));
create policy "notifications_insert" on notifications for insert
  with check (is_household_member(household_id));
create policy "notifications_update" on notifications for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "admin_read_notifications" on notifications for select using (is_platform_admin());
