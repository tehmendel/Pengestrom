-- Lån-modul: detaljer (rente, betalingsplan, kontonr for automatisk
-- gjenkjenning av betalinger) knyttet 1:1 til en eksisterende konto av type
-- 'loan'. Saldo/gjeld leses fortsatt fra accounts.balance (samme tall som
-- allerede telles i household_net_worth()) — dupliseres bevisst IKKE her,
-- for å unngå samme drift-problem som ble fikset for pensjon tidligere.

create table loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  lender text,
  original_principal numeric,
  interest_rate numeric,
  monthly_payment numeric,
  start_date date,
  payment_account_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id)
);

alter table loans enable row level security;

create policy "loans_select" on loans for select
  using (exists (
    select 1 from accounts a where a.id = loans.account_id
      and (a.owner_id = auth.uid() or (a.visibility = 'shared' and is_household_member(a.household_id)))
  ));
create policy "loans_insert" on loans for insert
  with check (owner_id = auth.uid() and exists (select 1 from accounts a where a.id = loans.account_id and a.owner_id = auth.uid()));
create policy "loans_update" on loans for update using (owner_id = auth.uid());
create policy "loans_delete" on loans for delete using (owner_id = auth.uid());

-- ── Saldohistorikk (ett punkt hver gang saldoen oppdateres/siden besøkes) ──

create table loan_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  snapshot_date date not null,
  balance numeric not null,
  created_at timestamptz not null default now(),
  unique (loan_id, snapshot_date)
);

alter table loan_balance_snapshots enable row level security;

create policy "loan_balance_snapshots_select" on loan_balance_snapshots for select
  using (exists (
    select 1 from loans l join accounts a on a.id = l.account_id
    where l.id = loan_balance_snapshots.loan_id
      and (a.owner_id = auth.uid() or (a.visibility = 'shared' and is_household_member(a.household_id)))
  ));
create policy "loan_balance_snapshots_insert" on loan_balance_snapshots for insert
  with check (exists (select 1 from loans l where l.id = loan_balance_snapshots.loan_id and l.owner_id = auth.uid()));
create policy "loan_balance_snapshots_update" on loan_balance_snapshots for update
  using (exists (select 1 from loans l where l.id = loan_balance_snapshots.loan_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from loans l where l.id = loan_balance_snapshots.loan_id and l.owner_id = auth.uid()));

-- Snapshotter dagens saldo (fra accounts.balance, ikke klientoppgitt) for et
-- lån — kalles ved hvert besøk på Lån-siden, samme mønster som
-- record_net_worth_snapshot().
create or replace function record_loan_balance_snapshot(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_owner uuid;
begin
  select a.balance, l.owner_id into v_balance, v_owner
    from loans l join accounts a on a.id = l.account_id
    where l.id = p_loan_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Ikke eier av dette lånet';
  end if;

  if v_balance is null then
    return;
  end if;

  insert into loan_balance_snapshots (loan_id, snapshot_date, balance)
  values (p_loan_id, current_date, v_balance)
  on conflict (loan_id, snapshot_date) do update set balance = excluded.balance;
end;
$$;

revoke all on function record_loan_balance_snapshot(uuid) from public;
grant execute on function record_loan_balance_snapshot(uuid) to authenticated;

-- ── Admin skrivebeskyttet lesetilgang (samme mønster som tidligere migrasjoner) ──

create policy "admin_read_loans" on loans for select using (is_platform_admin());
create policy "admin_read_loan_balance_snapshots" on loan_balance_snapshots for select using (is_platform_admin());
