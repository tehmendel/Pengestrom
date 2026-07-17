alter table holdings drop constraint holdings_instrument_type_check;
alter table holdings add constraint holdings_instrument_type_check
  check (instrument_type in ('fond', 'aksje', 'etf', 'obligasjon', 'krypto', 'pensjonsfond'));
