-- Bevarer den faktisk parsede kilderaden (CSV-linje eller AI-uttrekk fra PDF)
-- per transaksjon, slik at man kan verifisere hva importen faktisk leste.
alter table transactions add column raw_source text;
