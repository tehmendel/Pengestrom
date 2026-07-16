-- Pengestrøm — grunnskjema
-- Sikkerhetsprinsipp: RLS er på for alle tabeller. Kryssing av husstandsgrenser
-- (husstand-kobling, invitasjoner, aggregerte kategorisummer) skjer KUN via
-- SECURITY DEFINER-funksjoner som selv validerer medlemskap — aldri via
-- direkte klient-INSERT/SELECT-policyer som stoler på klientoppgitte ID-er.

create extension if not exists pgcrypto;

-- ── Kjernetabeller ──────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  token text not null unique,
  email text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('inntekt', 'utgift')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, name, type)
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  institution text not null,
  account_type text not null check (account_type in ('checking', 'savings', 'loan', 'card', 'investment', 'child')),
  display_name text not null,
  visibility text not null default 'personal' check (visibility in ('shared', 'personal')),
  connection_type text not null default 'manual' check (connection_type in ('manual', 'open_banking')),
  external_account_ref text,
  created_at timestamptz not null default now()
);

create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'enable_banking',
  institution_id text,
  consent_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table bank_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  file_hash text not null unique,
  filename text,
  imported_by uuid not null references auth.users(id),
  transaction_count int not null default 0,
  imported_at timestamptz not null default now()
);

create table categorization_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  match_type text not null default 'contains' check (match_type in ('contains', 'starts_with', 'exact')),
  match_value text not null,
  transaction_type text check (transaction_type in ('inntekt', 'utgift')),
  category_id uuid not null references categories(id) on delete cascade,
  priority int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  normalized_name text not null,
  suggested_category_id uuid references categories(id) on delete set null,
  confidence numeric not null default 0.7,
  transaction_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name)
);

create table categorization_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text,
  suggested_category_id uuid references categories(id) on delete set null,
  actual_category_id uuid references categories(id) on delete set null,
  was_correct boolean not null,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  description text not null,
  notes text,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('inntekt', 'utgift')),
  category_id uuid references categories(id) on delete set null,
  source text not null default 'manual' check (source in ('open_banking', 'csv', 'pdf', 'manual')),
  bank_import_id uuid references bank_imports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on transactions (household_id, date desc);
create index on transactions (account_id);
create index on transactions (owner_id);
create index on accounts (household_id);
create index on categorization_rules (household_id, priority);
create index on vendors (household_id, normalized_name);

-- ── Sikkerhetshjelpefunksjon (bryter RLS-rekursjon på household_members) ──

create or replace function is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = target_household_id and user_id = auth.uid()
  );
$$;

revoke all on function is_household_member(uuid) from public;
grant execute on function is_household_member(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table categories enable row level security;
alter table accounts enable row level security;
alter table bank_connections enable row level security;
alter table bank_imports enable row level security;
alter table categorization_rules enable row level security;
alter table vendors enable row level security;
alter table categorization_log enable row level security;
alter table transactions enable row level security;

-- profiles: egen rad, eller husstandsmedlemmer sin rad
create policy "profiles_select" on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from household_members me
      join household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy "profiles_upsert" on profiles for insert with check (id = auth.uid());
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- households: kun medlemmer. Opprettelse skjer kun via create_household().
create policy "households_select" on households for select using (is_household_member(id));
create policy "households_update" on households for update using (is_household_member(id));

-- household_members: kun medlemmer kan lese. Innmelding skjer kun via RPC (ingen insert-policy).
create policy "household_members_select" on household_members for select using (is_household_member(household_id));

-- household_invites: kun oppretter/husstandsmedlemmer kan se. Aksept skjer kun via RPC (ingen select/insert-policy for andre).
create policy "household_invites_select" on household_invites for select
  using (created_by = auth.uid() or is_household_member(household_id));

-- categories / regler / leverandører / logg: delt husstands-taksonomi
create policy "categories_all" on categories for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "rules_all" on categorization_rules for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "vendors_all" on vendors for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "categorization_log_all" on categorization_log for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- accounts: eier ser/redigerer alt. Husstand ser kun "felles"-merkede kontoer.
create policy "accounts_select" on accounts for select
  using (owner_id = auth.uid() or (visibility = 'shared' and is_household_member(household_id)));
create policy "accounts_insert" on accounts for insert
  with check (owner_id = auth.uid() and is_household_member(household_id));
create policy "accounts_update" on accounts for update using (owner_id = auth.uid());
create policy "accounts_delete" on accounts for delete using (owner_id = auth.uid());

-- bank_connections: strengt privat — selv husstandsmedlemmer ser ikke andres samtykke-/tilkoblingsdetaljer.
create policy "bank_connections_all" on bank_connections for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- bank_imports: egne importer, eller importer knyttet til felles-kontoer i husstanden.
create policy "bank_imports_select" on bank_imports for select
  using (
    imported_by = auth.uid()
    or exists (select 1 from accounts a where a.id = bank_imports.account_id and a.visibility = 'shared' and is_household_member(a.household_id))
  );
create policy "bank_imports_insert" on bank_imports for insert with check (imported_by = auth.uid());

-- transactions: eier ser/redigerer alt. Husstand ser full detalj kun for "felles"-kontoer.
-- Personlige kontoers transaksjoner er IKKE synlige rad-for-rad for andre — kun via
-- household_category_totals()-funksjonen, som kun returnerer summer, aldri enkeltrader.
create policy "transactions_select" on transactions for select
  using (
    owner_id = auth.uid()
    or (is_household_member(household_id) and exists (
      select 1 from accounts a where a.id = transactions.account_id and a.visibility = 'shared'
    ))
  );
create policy "transactions_insert" on transactions for insert
  with check (owner_id = auth.uid() and is_household_member(household_id));
create policy "transactions_update" on transactions for update
  using (
    owner_id = auth.uid()
    or (is_household_member(household_id) and exists (
      select 1 from accounts a where a.id = transactions.account_id and a.visibility = 'shared'
    ))
  );
create policy "transactions_delete" on transactions for delete using (owner_id = auth.uid());

-- ── RPC-funksjoner (eneste vei inn/ut av husstandsgrensen) ────────────────

create or replace function create_household(household_name text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Du er allerede medlem av en husstand';
  end if;

  insert into profiles (id, full_name) values (auth.uid(), p_full_name)
    on conflict (id) do update set full_name = excluded.full_name;

  insert into households (name) values (household_name) returning id into new_household_id;
  insert into household_members (household_id, user_id, role) values (new_household_id, auth.uid(), 'owner');

  insert into categories (household_id, name, type) values
    (new_household_id, 'Huslån/renter', 'utgift'),
    (new_household_id, 'Forsikring', 'utgift'),
    (new_household_id, 'Strøm/energi', 'utgift'),
    (new_household_id, 'Kommunale avgifter', 'utgift'),
    (new_household_id, 'Matvarer', 'utgift'),
    (new_household_id, 'Transport/drivstoff', 'utgift'),
    (new_household_id, 'Fornøyelser', 'utgift'),
    (new_household_id, 'Medlemskap/abonnement', 'utgift'),
    (new_household_id, 'Barn', 'utgift'),
    (new_household_id, 'Sparing/investering', 'utgift'),
    (new_household_id, 'Annet', 'utgift'),
    (new_household_id, 'Lønn', 'inntekt'),
    (new_household_id, 'Annet', 'inntekt');

  return new_household_id;
end;
$$;

revoke all on function create_household(text, text) from public;
grant execute on function create_household(text, text) to authenticated;

create or replace function create_household_invite(p_household_id uuid, p_email text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not is_household_member(p_household_id) then
    raise exception 'Du er ikke medlem av denne husstanden';
  end if;

  new_token := encode(gen_random_bytes(18), 'hex');
  insert into household_invites (household_id, token, email, created_by)
    values (p_household_id, new_token, nullif(trim(p_email), ''), auth.uid());

  return new_token;
end;
$$;

revoke all on function create_household_invite(uuid, text) from public;
grant execute on function create_household_invite(uuid, text) to authenticated;

create or replace function accept_household_invite(p_token text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite household_invites%rowtype;
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Du er allerede medlem av en husstand';
  end if;

  select * into invite from household_invites
    where token = p_token and used_at is null and expires_at > now();

  if not found then
    raise exception 'Ugyldig eller utløpt invitasjon';
  end if;

  caller_email := auth.jwt() ->> 'email';
  if invite.email is not null and lower(invite.email) <> lower(coalesce(caller_email, '')) then
    raise exception 'Denne invitasjonen er låst til en annen e-postadresse';
  end if;

  insert into profiles (id, full_name) values (auth.uid(), p_full_name)
    on conflict (id) do update set full_name = excluded.full_name;

  insert into household_members (household_id, user_id, role) values (invite.household_id, auth.uid(), 'member');

  update household_invites set used_at = now(), used_by = auth.uid() where id = invite.id;

  return invite.household_id;
end;
$$;

revoke all on function accept_household_invite(text, text) from public;
grant execute on function accept_household_invite(text, text) to authenticated;

-- Aggregerte kategorisummer for hele husstanden — eneste innsyn andre medlemmer
-- får i "personlige" kontoers transaksjoner. Aldri enkeltrader, kun summer.
create or replace function household_category_totals(p_household_id uuid)
returns table (
  category_id uuid,
  category_name text,
  type text,
  year int,
  month int,
  total_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.category_id,
    c.name as category_name,
    t.type,
    extract(year from t.date)::int as year,
    extract(month from t.date)::int as month,
    sum(t.amount) as total_amount
  from transactions t
  left join categories c on c.id = t.category_id
  where t.household_id = p_household_id
    and is_household_member(p_household_id)
  group by t.category_id, c.name, t.type, extract(year from t.date), extract(month from t.date);
$$;

revoke all on function household_category_totals(uuid) from public;
grant execute on function household_category_totals(uuid) to authenticated;
