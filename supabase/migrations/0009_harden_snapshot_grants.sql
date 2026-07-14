-- record_net_worth_snapshot ble ved en feil eksponert for anon-rollen (default PUBLIC-grant).
revoke execute on function record_net_worth_snapshot(uuid) from anon;
