-- Pensjonskontoer (f.eks. Storebrand "Egen pensjonskonto") med avtaledetaljer,
-- pluss fondsbeholdning og verdihistorikk. Gjenbruker holdings/holding_price_snapshots
-- (samme mønster som investeringskontoer) fremfor egne parallelle tabeller.

create table pension_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'Storebrand',
  display_name text not null,
  agreement_number text,
  employer text,
  employment_date date,
  annual_salary numeric,
  position_percentage numeric,
  savings_percentage numeric,
  additional_savings_percentage numeric,
  payout_start_date date,
  payout_end_date date,
  policyholder text,
  insured text,
  admin_fee_note text,
  accrued_current_employer numeric,
  accrued_former_employer numeric,
  management_fee_note text,
  visibility text not null default 'personal' check (visibility in ('shared', 'personal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pension_accounts enable row level security;

create policy "pension_accounts_select" on pension_accounts for select
  using (owner_id = auth.uid() or (visibility = 'shared' and is_household_member(household_id)));
create policy "pension_accounts_insert" on pension_accounts for insert
  with check (owner_id = auth.uid() and is_household_member(household_id));
create policy "pension_accounts_update" on pension_accounts for update using (owner_id = auth.uid());
create policy "pension_accounts_delete" on pension_accounts for delete using (owner_id = auth.uid());

-- ── holdings kan nå høre til enten en investeringskonto ELLER en pensjonskonto ──

alter table holdings add column pension_account_id uuid references pension_accounts(id) on delete cascade;
alter table holdings alter column account_id drop not null;
alter table holdings add constraint holdings_parent_check check (
  (account_id is not null and pension_account_id is null) or
  (account_id is null and pension_account_id is not null)
);

drop policy "holdings_select" on holdings;
create policy "holdings_select" on holdings for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from accounts a where a.id = holdings.account_id and a.visibility = 'shared' and is_household_member(a.household_id))
    or exists (select 1 from pension_accounts pa where pa.id = holdings.pension_account_id and pa.visibility = 'shared' and is_household_member(pa.household_id))
  );

-- ── Verdihistorikk for pensjonskonto (beholdning over tid, ett punkt per oppdatering) ──

create table pension_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  pension_account_id uuid not null references pension_accounts(id) on delete cascade,
  snapshot_date date not null,
  value numeric not null,
  created_at timestamptz not null default now(),
  unique (pension_account_id, snapshot_date)
);

alter table pension_value_snapshots enable row level security;

create policy "pension_value_snapshots_select" on pension_value_snapshots for select
  using (exists (
    select 1 from pension_accounts pa where pa.id = pension_value_snapshots.pension_account_id
      and (pa.owner_id = auth.uid() or (pa.visibility = 'shared' and is_household_member(pa.household_id)))
  ));
create policy "pension_value_snapshots_insert" on pension_value_snapshots for insert
  with check (exists (select 1 from pension_accounts pa where pa.id = pension_value_snapshots.pension_account_id and pa.owner_id = auth.uid()));
create policy "pension_value_snapshots_update" on pension_value_snapshots for update
  using (exists (select 1 from pension_accounts pa where pa.id = pension_value_snapshots.pension_account_id and pa.owner_id = auth.uid()))
  with check (exists (select 1 from pension_accounts pa where pa.id = pension_value_snapshots.pension_account_id and pa.owner_id = auth.uid()));

-- ── household_net_worth(): legg til 'pension'-kategori sourced fra holdings via pensjonskonto ──
-- (assets.category = 'pension' fantes allerede for manuelt registrert pensjon — samme
-- kategorinøkkel brukes bevisst her, så de to summeres sammen i Formue-oversikten.)
-- MERK: denne 'pension'-kategorien ble fjernet igjen i migrasjon 0022.

create or replace function household_net_worth(p_household_id uuid)
returns table (category text, total_amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select 'bank'::text, coalesce(sum(balance), 0)
    from accounts
    where household_id = p_household_id and account_type in ('checking', 'savings', 'child')
      and is_household_member(p_household_id)
  union all
  select 'loan'::text, coalesce(sum(balance), 0)
    from accounts
    where household_id = p_household_id and account_type in ('loan', 'card')
      and is_household_member(p_household_id)
  union all
  select 'investment'::text, coalesce(sum(h.quantity * h.current_price), 0)
    from holdings h
    join accounts a on a.id = h.account_id
    where a.household_id = p_household_id and is_household_member(p_household_id)
  union all
  select 'pension'::text, coalesce(sum(h.quantity * h.current_price), 0)
    from holdings h
    join pension_accounts pa on pa.id = h.pension_account_id
    where pa.household_id = p_household_id and is_household_member(p_household_id)
  union all
  select category, coalesce(sum(case when is_liability then -value else value end), 0)
    from assets
    where household_id = p_household_id and is_household_member(p_household_id)
    group by category;
$$;

revoke all on function household_net_worth(uuid) from public;
grant execute on function household_net_worth(uuid) to authenticated;

-- ── Admin skrivebeskyttet lesetilgang (samme mønster som migrasjon 0016) ──

create policy "admin_read_pension_accounts" on pension_accounts for select using (is_platform_admin());
create policy "admin_read_pension_value_snapshots" on pension_value_snapshots for select using (is_platform_admin());
