-- Pensjon skal ikke telle med i formueberegningen (Formue-siden/Netto formue) —
-- den har sin egen dedikerte Pensjon-side for sporing. Fjerner pensjon fra
-- household_net_worth() sin output helt: både grenen som summerte
-- fondsbeholdning via pensjonskontoer, og 'pension'-kategorien fra assets.

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
  select category, coalesce(sum(case when is_liability then -value else value end), 0)
    from assets
    where household_id = p_household_id and is_household_member(p_household_id)
      and category <> 'pension'
    group by category;
$$;

revoke all on function household_net_worth(uuid) from public;
grant execute on function household_net_worth(uuid) to authenticated;
