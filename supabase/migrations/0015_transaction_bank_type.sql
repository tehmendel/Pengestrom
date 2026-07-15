-- Bankens egen Type/Undertype-klassifisering (f.eks. "Varekjøp" / "Varekjøp
-- debetkort"), bevart fra CSV-importen for visning og fremtidig regelbruk.
alter table transactions add column bank_type text;
alter table transactions add column bank_subtype text;
