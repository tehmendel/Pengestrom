-- Samme feil som ble fikset i 0009_harden_snapshot_grants.sql: Supabase gir
-- anon-rollen EXECUTE direkte (uavhengig av PUBLIC) på nye funksjoner, så
-- "revoke ... from public" alene fjerner den ikke.
revoke execute on function record_loan_balance_snapshot(uuid) from anon;
