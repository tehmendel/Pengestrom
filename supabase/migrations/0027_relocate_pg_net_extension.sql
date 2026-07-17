-- pg_net sin egen ekstensjon-registrering lå i public (advisor-varsel
-- "Extension in Public"); funksjonene selv (net.http_post) lever uansett i sitt
-- eget net-skjema og påvirkes ikke av dette. Fjerner og oppretter på nytt med
-- extensions som eier-skjema for å rydde opp registreringen.

create extension if not exists pg_net;
create schema if not exists extensions;
drop extension pg_net;
create extension pg_net with schema extensions;
