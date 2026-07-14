-- Historikk for formue (måned/år-delta) og investeringskurser (utvikling over tid).

create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  snapshot_date date not null,
  net_worth numeric not null,
  created_at timestamptz not null default now(),
  unique (household_id, snapshot_date)
);

alter table net_worth_snapshots enable row level security;

create policy "net_worth_snapshots_select" on net_worth_snapshots for select
  using (is_household_member(household_id));

-- Ingen direkte insert/update-policy — kun via record_net_worth_snapshot(), som
-- beregner tallet server-side fra household_net_worth() i stedet for å stole
-- på et klient-oppgitt beløp.
create or replace function record_net_worth_snapshot(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  if not is_household_member(p_household_id) then
    raise exception 'Ikke medlem av husstanden';
  end if;
  select coalesce(sum(total_amount), 0) into total from household_net_worth(p_household_id);
  insert into net_worth_snapshots (household_id, snapshot_date, net_worth)
  values (p_household_id, current_date, total)
  on conflict (household_id, snapshot_date) do update set net_worth = excluded.net_worth;
end;
$$;

revoke all on function record_net_worth_snapshot(uuid) from public;
grant execute on function record_net_worth_snapshot(uuid) to authenticated;

-- Kursutvikling per beholdning, ett punkt per gang brukeren oppdaterer kursen.
create table holding_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references holdings(id) on delete cascade,
  snapshot_date date not null,
  price numeric not null,
  created_at timestamptz not null default now(),
  unique (holding_id, snapshot_date)
);

alter table holding_price_snapshots enable row level security;

create policy "holding_price_snapshots_select" on holding_price_snapshots for select
  using (
    exists (
      select 1 from holdings h
      where h.id = holding_price_snapshots.holding_id
        and (h.owner_id = auth.uid() or exists (
          select 1 from accounts a where a.id = h.account_id and a.visibility = 'shared' and is_household_member(a.household_id)
        ))
    )
  );
create policy "holding_price_snapshots_insert" on holding_price_snapshots for insert
  with check (
    exists (select 1 from holdings h where h.id = holding_price_snapshots.holding_id and h.owner_id = auth.uid())
  );
