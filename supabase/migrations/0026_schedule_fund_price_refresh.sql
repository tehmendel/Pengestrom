-- Nattlig automatisk oppdatering av fondskurser (alle fond/pensjonsfond med
-- registrert ISIN, uavhengig av husstand) via edge-funksjonen refresh-fund-prices.
-- 05:00 UTC (ca. 06-07 norsk tid) - trygt etter at fondenes NAV-kurs for
-- foregående handelsdag er publisert.
--
-- Hemmeligheten hentes fra Vault ved kjøretid (se migrasjon 0025) — aldri en
-- literal verdi her, siden denne filen ligger i et offentlig repo.

create extension if not exists pg_cron;

select
  cron.schedule(
    'refresh-fund-prices-nightly',
    '0 5 * * *',
    $$
    select net.http_post(
      url := 'https://xnleihigxkhjqqbhukus.supabase.co/functions/v1/refresh-fund-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fund_price_cron_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
    $$
  );
