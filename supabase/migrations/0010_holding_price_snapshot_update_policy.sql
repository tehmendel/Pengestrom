-- Investments.jsx upserter dagens kurs-snapshot (samme dag kan lagres flere
-- ganger), som krever en update-policy i tillegg til insert ved konflikt.
create policy "holding_price_snapshots_update" on holding_price_snapshots for update
  using (exists (select 1 from holdings h where h.id = holding_price_snapshots.holding_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from holdings h where h.id = holding_price_snapshots.holding_id and h.owner_id = auth.uid()));
