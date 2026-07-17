-- Vault sitt 'vault'-skjema er ikke eksponert via PostgREST, så supabase-js kan
-- ikke spørre det direkte selv med service-rollen. Denne wrapper-funksjonen
-- eksponeres i public-skjemaet i stedet, men er strengt låst til service_role —
-- verken anon eller authenticated kan noensinne kalle den. Brukt av edge-
-- funksjonen refresh-fund-prices til å hente den delte hemmeligheten den
-- validerer nattlige cron-kall mot (se migrasjon 0026).

create or replace function get_fund_price_cron_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'fund_price_cron_secret';
$$;

revoke all on function get_fund_price_cron_secret() from public, anon, authenticated;
grant execute on function get_fund_price_cron_secret() to service_role;
