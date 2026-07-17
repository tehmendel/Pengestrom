-- ISIN på beholdninger — brukes av "Hent siste kurs" på Pensjon- og
-- Investeringer-siden til å slå opp riktig fond mot Storebrands åpne
-- fund-data-API. Valgfritt felt, relevant for fond/ETF/obligasjon.
alter table holdings add column isin text;
