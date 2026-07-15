-- Lar hver bruker flagge én av sine egne kontoer som standard, forhåndsvalgt ved import.
alter table accounts add column is_default boolean not null default false;

-- Maks én standardkonto per eier — klienten nullstiller forrige standard før
-- den setter en ny, så denne fanger kun opp reelle samtidighetskonflikter.
create unique index accounts_one_default_per_owner on accounts (owner_id) where is_default;
