-- Eksplisitt fjerning av anon-tilgang til husstands-RPC-funksjonene.
-- Funksjonelt allerede trygt (alle validerer auth.uid()/medlemskap internt),
-- men fjerner tvetydigheten rundt PostgREST sin default eksponering for anon.

revoke execute on function is_household_member(uuid) from anon;
revoke execute on function create_household(text, text) from anon;
revoke execute on function create_household_invite(uuid, text) from anon;
revoke execute on function accept_household_invite(text, text) from anon;
revoke execute on function household_category_totals(uuid) from anon;
