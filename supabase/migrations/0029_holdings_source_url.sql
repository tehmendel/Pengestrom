-- Fallback-kilde for kurshenting når ISIN-oppslag mot Storebrand ikke finner
-- fondet (f.eks. Nordnets egne fond, som ikke distribueres via Storebrand).
-- Peker til fondets offentlige side, f.eks. hos Nordnet, som skrapes for pris.
alter table holdings add column source_url text;
