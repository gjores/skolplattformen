---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "02"
status: completed
completed: 2026-09-29
requirements: [ADMIN-04]
source_commit: 174f6d8
---

# 05-02 — lokal sparordning och databas-ID

Båda ursprungliga lagringsfelen rättade utan försvagade assertions. Anropen köas med kopior av tillstånden per klient. Nya timplaner och läsår får klient-/huvudmannabunden mappning till databas-ID (läsår även skola). Följduppdatering/radering använder detta ID; även radering via omläst server-ID rensar alias. Fel stoppar redan köade beroende skrivningar, och en ny skrivning efter tömd kö/omläsning kan genomföras.

Gamla `save-order.repro.mjs` är kompatibilitetskommando för den ordinarie `planning-save-order.test.mjs`. Fas1-grindens sparordningssteg är nu obligatoriskt PASS/FAIL. Baslinjerapportens äldre röda utfall bevaras som historik med ny uppföljning.

## Genomförda prov

På arbetskopians kod som committades i `174f6d8` (kontrollerna kördes före commit, utgångsrevision `96085d1`):

- Ursprungliga två lagerfall kördes röda före rättning: äldre100 vann över200; snabb följdändring gav FK-fel. Köprov var också röda före implementation (modul saknades).
- Ordinarie modell-/lagersvit `node --test lib/*.test.mjs`: PASS346/346, inga skips.
- Bland dessa: 9 lagerregressioner och 3 köprov. Samma-cell, nytt objekt, flera fält/snapshot, fel→stopp→omläst retry, två raderingsvägar/alias, klientisolering och två läsårsfall. Samtliga gröna; server-ID-alias efter omläst radering hade särskilt rött prov före rättning.
- Kompatibilitetskommando `node --test lib/save-order.repro.mjs`: PASS9/9.
- `npx tsc --noEmit` och `npx oxlint app lib scripts/verify-phase1.mjs`: PASS.
- `npm run build:example`: PASS. Byggmärkningen visar utgångsrevision 96085d1; bygget innehåller arbetskopierättningen som därefter committades 174f6d8. Inget eget ren-HEAD-/fingerprint-bevis påstås.
- `git diff --check`: PASS. `supabase.ts` har fortfarande hasBackend=false; protected-home håller planeringsvyer stängda.

## Krav och begränsningar

ADMIN-04: de två lokala lagringsblockerarna och motsvarande läsårsordning har syntetiskt transportbevis med verkliga äldre lagerfunktioner. Kravet är fortsatt Pending, eftersom beständiga klasskopplingar och den nya skyddade datavägen ännu inte genomförts.

Ingen ny serverroute, databaspolicy, migration, demoidentitet eller UI-öppning. Ingen backend i exempelläget. Fördröjda UI-omläsningssvar, samtidighet mellan användare, servermandat, revisionskonflikter och atomär verksamhet/audit kräver egna kommande genomförandeplaner och verkliga lokala SQL/API/browserprov. En lokal kö ersätter inte databastransaktioner. Den fulla fas1-/fas4-grinden kördes inte om för denna isolerade förberedelse; inget sådant PASS tillskrivs rättningen.

Inget ändrat användarbeteende i appens tillgängliga lägen, därför inga handboksändringar eller nya manuella telefonprov. Fas4:s partiella användarprov, datum-/UI-anmärkning och slutverifiering kvarstår. Bred UI-genomgång och programplan-terminologi följs separat.
