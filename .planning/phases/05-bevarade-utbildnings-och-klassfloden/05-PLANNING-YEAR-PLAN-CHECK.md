---
phase: 05-bevarade-utbildnings-och-klassfloden
topic: planning-year
checked: 2026-10-06
status: plan_check_complete
verdict: executable_plan_package
plans: ["05-36", "05-37", "05-38", "05-39", "05-40", "05-41", "05-42", "05-43"]
implementation_status: not_started
behavior_verification: not_run
remaining_blockers: 0
remaining_major_issues: 0
---

# Plangranskning: läsårsstyrd planering

De åtta reviderade planerna är genomförbara i paketets angivna ordning. Granskningen gäller planernas kvalitet och kodförutsättningar, **inte verifierat användarbeteende eller ett beslut att starta implementationen**. Användaren har beställt planering; inga nya produktfiler, migrationer, databasprov, browserprov eller byggen har genomförts av denna granskning.

Granskningen följer `gsd-plan-checker` och omfattar [besluten](05-PLANNING-YEAR-CONTEXT.md), [kodinventeringen](05-PLANNING-YEAR-DISCOVERY.md), [paketindexet](05-PLANNING-YEAR-IMPLEMENTATION.md), samtliga 05-36–43 och berörd aktuell kod. Den äldre kodkartan har inte använts som bevis för dagens skyddade flöden.

## Struktur, beroenden och omfattning

| Plan | Wave | Uppgifter | Implementationsfiler totalt | Flest filer i en uppgift |
| --- | --- | --- | --- | --- |
| [05-36](05-36-PLAN.md) | 1 | 2 | 4 | 2 |
| [05-37](05-37-PLAN.md) | 2 | 3 | 5 | 5 |
| [05-38](05-38-PLAN.md) | 3 | 3 | 9 | 5 |
| [05-39](05-39-PLAN.md) | 4 | 2 | 7 | 5 |
| [05-40](05-40-PLAN.md) | 5 | 3 | 7 | 4 |
| [05-41](05-41-PLAN.md) | 6 | 3 | 8 | 5 |
| [05-42](05-42-PLAN.md) | 7 | 2 | 5 | 3 |
| [05-43](05-43-PLAN.md) | 8 | 3 | 6 | 4 |

- Alla 21 uppgifter har konkreta `name`, `files`, `action`, `verify` och `done`. Varje plan har 2–3 uppgifter och varje implementationsuppgift högst fem filer. Uppgiftens filer finns i planens `files_modified`; bevisdokument är uttryckliga output.
- Samtliga planer har frontmatter med krav, `truths`, `artifacts` och `key_links`. Must-haves uttrycker användar-/dataresultat och deras källkopplingar, inte bara arbetsmoment.
- Beroendena bildar den giltiga kedjan `05-36 → 05-37 → 05-38 → 05-39 → 05-40 → 05-41 → 05-42 → 05-43`, med en plan per wave. Inga cykler, okända plan-ID:n eller samtidiga filkonflikter finns inom paketet. Delade shell-, matris- och fixturfiler ändras i efterföljande waves.
- Fem planer har fler än fem filer totalt. Deras explicita omfattningsnoter motiverar sammanhållna vertikala steg med tunna routes, befintliga UI-kopplingar och egna prov. Detta är en dokumenterad omfattningsavvägning; ny global sparmotor, nytt skrivkontrakt eller större datamodell får inte döljas i prov-/grantuppgifterna utan kräver omdelning före utförande.
- Källreferenser är befintliga filer eller namngivna framtida artefakter från föregångare. Exempelvis kontraktet produceras av 05-36, funktionsinventeringen av 05-37, tabellkomponenten av 05-40 och varje efterfrågad SUMMARY efter respektive faktiskt genomförd plan. De saknas avsiktligt före implementation och är inte redan uppfyllda förutsättningar.
- Paketets wave-nummer får inte användas för att starta hela fas 5. Indexet anger selektiv körning av dessa åtta ID:n; äldre `replan_required`-planer och full 05-23/E blir inte nya beroenden eller parallella uppdrag.

Den statiska fält-/uppgifts-/fil-/wavekontrollen kördes efter planförfattarens slutrevision och gav inga strukturfynd. Den körningen är ingen app- eller verksamhetsverifiering.

## Sakfrågor kontrollerade mot dagens kod

| Krav eller risk | Planerad täckning och källgräns |
| --- | --- |
| Separata årsurval | 05-39 separerar planeringsstate och `planeringslasar`/`planeringsskola` från registrets `schoolYear` och `lasar`/`skola`. Första registeröppning använder aktuellt registerår, eget uttryckligt registerval bevaras. Planeringssetup kräver inte elevregistermandat. |
| Dagens mandat | 05-37/38 begränsar skola och data före filtrering/beräkning. Historiskt år flyttar inte serverdatum, återupplivar uppdrag eller ger nya roller. Required-audit och exakt tre-signaturgrant har verkliga framtida prov, med återställd preflight före permanent grant. |
| Nya och fortsättande gymkullar | 05-36/37/40 härleder normal åk 1–3 från verifierat startläsår. Januari–juni använder föregående akademiska startår; fritextkull och kalenderåret i äldre `start_year` är inte ett säkert årsbevis. Null, motsägelser och år utanför normal progression visas. |
| Historiskt underlag | 05-37/40/41 skiljer faktisk årsbindning från ett valt planeringsutkast. Timplanens frysta `source.startedOn`/programkälla och exakt öppnad version används; senaste utkast får inte ersätta en äldre tillämpad version. |
| Grundskolans klassår och kolumn | `class_timplans.start_year` är tillämpningsläsår och `column_id` årskurs. Klassens registrerade startår och namn används inte som åk 1. 05-36/37/42 kräver även originalkartan för positionella timmar; osäker karta ger okända årsindex/timmar och spärrad riktad årscellsparning. |
| IM, saknad kalender och mått | IM behåller veckotid och får ingen treårsmodell eller obestyrkt årsomräkning. Alla tillåtna planeringsår kan väljas utan kalenderpost. Saknad kalender/start/plan/tid förblir synlig och null skiljs från sparat nollvärde. |
| Tabeller över hela urvalet | 05-36–40/42 planerar serveravgränsad sökning, kombinerade filter, whitelist-sort, stabil 50-radspagination och resultat-/urvalsrevision. 409 och fördröjda svar ska hanteras; klienten får inte hämta alla sidor eller bara sortera den synliga sidan. |
| Summering | Programpoäng dedupliceras efter programplan-ID/version, årsindex och kanonisk rad. Skoltimmar har separat timplan-/skol-/årskolumn-/radnyckel; klassantal är eget mått. Delad programram och två skolors olika timmar samt flera klasser/samma kolumn har namngivna prov. Kulltimmar blir inte personaltimmar. |
| Sparning och navigation | 05-39/41/42 bevarar URL, retur/Back/reload, session/epoch/generation, lokalt osparat och dolda originalindex. Pågående eller okänt skrivutfall ska lösas innan års-/skolbyte; fetch-abort får inte påstå att DB-skrivningen avbrutits. Helmatris, fulla sexvärdeskommandon och dagens CAS/återläsning återanvänds. |
| Framtida moduler | 05-43 dokumenterar ägar-, käll-, period-, enhets- och versionskontrakt till S1/S3. Inga nya schema-, tjänste-, studieplans- eller gruppfunktioner, skenflikar, grants eller automatiska verksamhetsrelationer ingår. |

Lästa aktuella huvudkällor omfattar `protected-home.tsx`, `protected-plan-location.ts`, `cohort-model.ts`, `gym-timplan.ts`, serverns gym-/GR-timplansprojektioner, `protected-timplan.ts`, GR-arbetsytan och relevanta klass-/skol-/gymövergångsmigrationer. Befintlig terminsinmatning ska återanvändas och paket-/blockhantering återinförs inte i programplanen.

## Fynd som rättades under granskningen

| Allvar | Ursprungligt fynd | Faktisk planrättning |
| --- | --- | --- |
| Major | 05-37 uppgift 1 verifierade en ny provfil som först producerades i uppgift 3; SQL-harnessens provfil saknades också i första uppgiftens ägarskap. | Båda grundprovfilerna produceras nu i uppgift 1 och utökas i uppgift 2/3. Uppgift 1 håller sig till fem filer. |
| Major | 05-37 uppgift 1 ville tillämpa foundation innan uppgift 2 färdigställde samma migrationsfil. | Uppgift 1 är nu endast inventering/enhet/rollback. Full rollback och permanent tillämpning sker först i uppgift 3 med färdig fil; redan tillämpat innehåll får inte redigeras. |
| Major | Äldre GR-timversion har ingen fryst grade-map: befintlig `phase5_read_timplan` projicerar positionella celler mot dagens `offerings.grades`. Plan-ID/version och lika bredd bevisade därför inte historiskt originalindex. | Bindande proveniensgrind tillagd i 05-36/37/42 och inventering/beslut. Samma-breddsbytet `[7,8,9] → [8,7,9]` är explicit negativt SQL-/kontrakts-/browserfall. Osäkerhet visas utan gissad backfill. |
| Minor | Generell ”relevant nyckel” lämnade poängsummering över flera skolrader tvetydig. | Olika exakta dedupnycklar för programramens poäng, skolans timmar och klassantal anges i 05-36/37/40. |
| Minor | Indexet hänvisade till specifika scope-noter som ännu saknades, och 05-43:s filfält blandade implementationsfil med resultattext. | Scope-noter finns nu i 05-38/39/40/41/43. Uppgift 43.3 äger releaseharness; verifierings-/prov-/resultatdokument är uttryckliga output. GR-uppgiftens Node-kommando har också preciserats. |

Inga kvarstående blocker, major- eller minorfynd kräver planrevision innan 05-36. GR:s tillgång till verklig kolumnproveniens är fortfarande en **implementerings-/datalucka att redovisa**, inte ett redan verifierat faktum: en synlig bindning kan ha okända årstimmar tills sådan källa finns.

## Status som förblir öppen

PLANERING-01–05 är fortfarande Pending. Åtta nya PLAN-filer ger 98 skrivna planer, inte fler genomförda än tidigare 77. Ingen ny SUMMARY eller användarbeteende-PASS följer av plangranskningen. De samordnade läsårs-/tabelltodos är pending med planerad leverans.

Full 05-23/E, yrkesram 05-17, formella beslut/garantikontroll, ADMIN-02/03/04 och full fas 5 förblir öppna. Mänsklig begriplighetsbedömning sker efter konkret leverans och redovisas separat som verkligt svar eller `awaiting_user`. Den nuvarande prövade appservern har inte bytts av planeringen.
