# Økonomiportalen

Privatøkonomi-portal for husstanden. React + Vite på frontend, Supabase (Postgres + Auth + Edge Functions) på backend. Hver person har egne kontoer og transaksjoner; kontoer kan merkes «felles» (full detalj synlig for husstanden) eller «personlig» (kun kategorisummer synlig for andre).

## Oppsett

1. **Supabase-prosjekt**
   - Opprett et prosjekt på [supabase.com](https://supabase.com).
   - Kjør migrasjonen i `supabase/migrations/0001_init.sql` (SQL Editor, eller `supabase db push`).
   - Deploy edge functions: `supabase functions deploy categorize-transactions` og `supabase functions deploy parse-bank-statement`.
   - Sett secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (kreves for AI-kategorisering og PDF-tolkning).
   - I Supabase Auth-innstillinger: aktiver e-post/magic link, sett riktig **Site URL** og **Redirect URL** til GitHub Pages-adressen (se under).

2. **Lokal utvikling**
   - Kopiér `.env.example` til `.env` og fyll inn `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` (Settings → API i Supabase — bruk **kun** den offentlige anon/publishable-nøkkelen, aldri service-role-nøkkelen).
   - `npm install && npm run dev`

3. **GitHub Pages-deploy**
   - Legg `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` som repo-secrets (Settings → Secrets and variables → Actions).
   - Sett Pages-kilde til «GitHub Actions» (Settings → Pages).
   - Push til `main` — `.github/workflows/deploy.yml` bygger og publiserer automatisk.

## Status

Manuell CSV-/PDF-import fungerer. Automatisk bankkobling via BankID (åpen bank-API) er ikke koblet inn ennå — dekning for de aktuelle bankene må først bekreftes.
