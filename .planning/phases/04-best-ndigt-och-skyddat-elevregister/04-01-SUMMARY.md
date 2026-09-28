---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "01"
subsystem: pupil-register-model
tags: [typescript, dates, contracts, tdd, data-minimization]
requires: [03-mandat-och-skyddade-datavagar]
provides: [stängda registertyper, rena datumregler, URL-urval, syntetisk identitetsvalidering, konflikttyper]
affects: [04-02, 04-04, 04-05, 04-09, 04-10, 04-12, 04-13]
tech-stack:
  added: []
  patterns: [rena modeller, stängda DTO-kontrakt, serverprövad projektion]
key-files:
  created: [web/lib/pupil-register-model.ts, web/lib/pupil-register-model.test.mjs, docs/pilot/phase4-register.md]
  modified: []
completed: 2026-09-28
requirements-completed: []
---

# Fas 4 plan 01: Registerkontrakt och rena datumregler

Gemensamma registertyper och rena regler för juli-läsår, inkluderande periodslut, URL-urval utan söktext, syntetiska TEST-identiteter samt minimerade konflikt- och exportformat.

## Genomförande

- 04-01-01: kontrakt dokumenterat i `docs/pilot/phase4-register.md`; 14 beteendeprov verifierades RED genom saknade modellfunktioner, inte syntax- eller importmiljöfel. Commit `494116a`.
- 04-01-02: modellen implementerad; 17 beteendeprov GREEN. Implementation och verifierat kodunderlag: commit `a8cae38`. Stängda typer för Selection, PupilList, PupilCard, FieldOrigin, ChangeRequest, ConflictDetails och ExportSelection samt tillhörande läs-/historikformat.
- Datumregler: 1 juli–30 juni, status enligt D-18, slutdag inkluderad, giltiga kalenderdatum med skottår, null startår ger null årskurs.
- URL-urval tillåter bara kända parametrar och UUID, rensade filter återkommer inte från äldre urval. Söktext ingår aldrig i serialiseringen och kontraktet förbjuder webbläsarlagring.
- Personnummer kräver exakt TEST-YYYYMMDD-NNNK, kalenderdatum, Luhn över YYMMDDNNNK samt explicit allowlist. Vanliga personnummer avvisas. 04-02 levererar den gemensamma allowlistan och SQL-kontrollen.
- Konflikter har stängd runtime-parser, fältvalidering och inga gamla personnummer. Identitetskonflikt har bara ändrat-markör. CSV återanvänder befintliga `csvRow`/formelskydd.

## Verifiering och kravspårning

Node 25.9.0 användes via `/opt/homebrew/opt/node@25/bin`.

| Kontroll | Faktiskt resultat | Krav som får delbevis |
|---|---|---|
| `node --test lib/pupil-register-model.test.mjs` RED | 14/14 avsiktligt röda före implementation | TDD-underlag |
| Samma modellprov GREEN | 17/17 godkända | STU-01 (identitetsformat), STU-02–03 (perioder), STU-05 (läsår/urval), STU-06 (konfliktformat) |
| `npx tsc --noEmit` | Godkänd | Typkontrakt mot befintlig app |
| `npx oxlint app lib` | Godkänd efter rättad ASCII-strängiteration | Statisk kontroll |
| `git diff --check` på planens filer | Godkänd | Ändringshygien |

Databas, API, UI, varaktig lagring och riktiga samtidighetskonflikter har **inte** verifierats i denna plan. Dessa modellprov slutverifierar inte något krav. Fasgrinden och användarproven i senare planer kvarstår.

## Beslut och preciseringar

- Ingen publik `projection=anonymous`-markör i svar; struktur och tillåtna fält varierar utan metadata som anger skyddad elev. `canReadProtected` är generell mandatcapability på listan, inte en flagga på elevraden. Detta rättades efter orkestratorns säkerhetsgranskning innan GREEN-commit (DATA-01/D-19).
- `CreatePupilRequest` är en förberedd typ; ingen extra skapavy eller API-väg infördes.
- Okända rättigheter ger inget. Capabilities är UI-besked och ersätter aldrig SQL-mandatkontroll.
- Periodkonflikter innehåller endast typ och avgränsad orsak med aktör/tid/version. Personnummervärden är uteslutna från allmän konflikt och historik.

## Avvikelser

Ingen omfattningsändring. Ett URL-återställningsfall kompletterades: borttagna filter får inte återinföras från föregående urval. Typ/lint krävde ASCII-sifferiteration med `split` i stället för spread. Inga nya beroenden eller backendkopplingar till exempelläget.

## Fortsättning

04-02 behöver matcha TEST-format och Luhn-regel samt leverera allowlistan. Serverplanerna måste implementera stängda requestparsers, SQL-prövad projektion och konflikter enligt kontraktet; dessa är inte auktoriserade av modellens typer. Orkestratorn uppdaterar STATE/ROADMAP separat för att undvika samtidig skrivning. Verklig drift och kommunanslutning är fortsatt öppna externa beroenden.
