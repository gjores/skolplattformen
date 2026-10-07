---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "37"
status: complete
completed: 2026-10-07
requirements-addressed: [PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
requirements-finally-verified: []
commits: [59ba83c, 020f8e4, 8c41326]
plan_head_before: 019fb58623e2dd52e75e403f6af09829d6a05238
---

# 05-37 — Stängd SQL-läsgrund för planeringsår

**Avgränsat PASS:** tre nya läs-RPC och elva privata hjälpare är tillämpade i isolerad lokal protected-databas. De är fortsatt stängda för PUBLIC/anon/authenticated/service_role/Worker. Befintliga 25 Worker-entrypoints, hela originalrader/tidsstämplar i 15 verksamhetstabeller, gamla funktionsdefinitioner/ACL och full migrationsjournal är bevarade. Nästa plan är **05-38**, skyddad API-läsning och exakt grant. PLANERING-01–05 och hela fas 5 är fortsatt Pending.

## Levererat

- Dagens verkliga session, kund, huvudman, uppdrag och utfärdarkedja avgör skolurvalet för alla planeringsår. Reuse av `phase5_programplan_actor` ger kundlås och återkontroll efter väntan; elevregistermandat används inte. HM/rektor läser sin scope, gymadministratör endast gymnasium/programplan.
- Setup ger serverdatum i Stockholm, aktuellt läsår och 2000–2100 utan att skapa kalender-/elev-/klassposter. Alla tre kommandon kräver atomisk DB-audit och släpper inget svar vid auditfel.
- Lista/överblick delar skol-, års-, skolforms-, sök-, status-, arkiv-, kullrelations- och årskursfilter. Sorteringen görs över hela urvalet med statiska CASE-nycklar och stabila C-sorterade skol-/utbildnings-/versions-/ID-nycklar; klassreferenser har stabil ordning. 50 rader per sida; SHA-256 över urval utan sida/revision plus hela sorterade resultatet. Ändrad urvalsrevision ger 40001 innan svar/audit.
- Programlistan visar verkliga versioner per tillåten skola, eller uttryckligt saknad plan. Timplistan prioriterar alla faktiskt årsbundna versioner/kolumner. Saknas årsbindning visas senaste version för skola/utbildning och eventuellt statusfilter; äldre årsbindning ersätts aldrig med nytt utkast. Obundet historiskt underlag är prognos, övrigt obundet underlag planering; future/finished är separata kullfilter.
- GY använder programversionens verkliga datum respektive exakt fryst `gym_basis.basisReference.startedOn`. Aktuell utbildning eller senare programrevision ersätter inte fryst källa. Hela frysta radinventariet verifieras mot katalogens kanoniska inventarium och termfördelning; identiskt trunkerade skolramar räcker inte. Motsägande gemensamma källrevisioner ger 40001, falskt/överlappande inventarium 22023. Konflikt mellan faktisk `arN`-bindning och känt kohortår ger 40001 med `planning_year_binding_mismatch`. Okänd äldre start ger uttryckligt okända mängder.
- GR bevarar faktisk årsnyckel, `ak8`/`ak9`, gammal version och hela råcellinventariet. Det finns ingen verifierbar fryst originalkolumnkarta i dagens databas: alla GR-kartor är därför `unknown`, med null årsindex/timmar. Dagens grades, samma bredd eller omordnade [7,8,9]→[8,7,9] används aldrig som bevis. Okända rader får `unknown-row`; saknade förväntade rader behålls med null. Detta är en leveransgräns, ingen gissad backfill.
- Klass-ID löses entydigt inom kund/skola/utbildning utifrån befintlig bindningsnyckel; noll/flera träffar behåller årsbindningen med `missing-class`/`ambiguous-class` och ofullständigt klassmått. Namnet skickas inte som integrationsidentitet. Programram, skolans timram och klassantal räknas separat och utan klass-/skolmultiplicering av poäng.
- IM summerar hela kanoniska veckoramen inklusive praktik/mentor, med bevarad noll/null. Ingen årstids- eller personalkonvertering. GR-array över nio kolumner eller nästlad array och IM-array med fel bredd projiceras som okända timmar; originalceller ändras inte. GY kräver faktisk 1D sexcellsmatris och ursprungligt index 1. Källans akademiska år måste rymmas inom modellens 1–9996.
- Gränser: högst 1 000 skolor, 10 000 resultatrader, 50 000 celler/klassreferenser totalt och 2 000 celler/1 000 klassreferenser per rad. Överskridande ger 54000 före resultatutlämning. Dessa gränser är verifierings-/kontraktsgränser, ingen prestandagaranti.

## Faktisk verifiering

| Kontroll | Resultat |
| --- | --- |
| Första scope/setup, före permanent apply | 14 SQL-prov och 8 bevarandekontroller PASS |
| Harnessens argument-/target-/rollback-/applygrindar | 6 Node-prov PASS, inga skips |
| Slutlig rollback av exakt full foundation | 93 pgTAP-prov, 18 faktisk SQL/TypeScript-paritetsfall, 3 observerade låsväntor; 9/9 kontroller PASS |
| Samma matris efter kontrollerad tillämpning | 93 pgTAP-prov, 18 paritetsfall, 3 låsväntor; 9/9 kontroller PASS |
| Riktat omprov av låsobservation | Tre kompletta omgångar, 9/9 verkliga lås/återkallelser PASS |
| Funktionsinventering från tillämpad databas | 14 exakta signaturer/definitionhashar/rå ACL; alla stängda för de fem rollerna |
| Oberoende GSD-verifierare | Read-only kodgranskning PASS; rapporterade luckor rättade och falsifierade i faktisk SQL |

Proven täcker tre gymkullar, januaristart, äldre fryst datum trots ändrad liveprogramrevision, 55 lika sortnamn, ändring mellan sidor, två skolors 10+20 timmar per aktiv kanonisk rad, en gemensam 2 500-poängram, två klasser/samma ram, åk8/9, okända och nästlade gamla GR/IM-celler, saknad plan/rad/fördelning, orätt skola/kund, gymadministratörens GR-/IM-nekande, faktisk utgången session/återkallad utfärdare, DB-auditfel och återkallelse under kundlåsväntan. Alla egna verksamhetsrader är noll efter städning; befintlig säkerhetsaudit och dess ankare bevaras. Lockproven anropar SQL med verklig sessionskontext som databasadministratör eftersom entrypoints är stängda; detta är inget Worker-/HTTP-/MFA-bevis.

## Avvikelser och första fel

16 misslyckade försöksrapporter bevaras i [felhistoriken](../../../work/pilot/results/phase5-37-failure-history.json), inklusive första setupförsöket. Rättningarna omfattar verklig kalenderkolumn, syntetiska katalogdatum/skrivskydd/rektor-/utbildningsrevisioner, beslutets datum/FK, SQL-variabelkonflikter och prov som först saknade explicit SET-behörighet. Inga skip eller gamla resultat har skrivits om.

En låsomgång fick ERR_ASSERTION. [Det riktade första omprovet](../../../work/pilot/results/phase5-37-lock-repeats-first-fail.json) visade att PostgreSQL redan publicerade blockerande PID medan `wait_event_type` ännu var null. Harnessens observation kräver nu samtidigt rätt blockerande PID, `Lock` och `advisory` inom fem sekunder. Åtkomstkravet ändrades inte: 42501, inget data och ingen lyckad audit efter återkallelse. [Nio efterföljande riktade låsprov](../../../work/pilot/results/phase5-37-lock-repeats.json) samt båda slutmatriserna PASS.

Applicering var spärrad tills full rollback/paritet/lås/bevaring PASS. Migrationen är därefter oföränderlig och exakt journalförd; inga grants/reset/backfills gjordes. Tillägget `--stage setup` kan aldrig auktorisera apply. Ingen UI/API, handboksändring, appbyggnad eller serverändring ingår; ordinarie 3012 och tidigare verifieringsbygge består. Båda verksamhets-/mobilgap, yrkesram, äldre omplanering och fas 4-checkpoint kvarstår. Verklig kommunanslutning och mänsklig begriplighet är separata resultat.

Planräkningen är 80 av 98 genomförda planer: 79 exakta PLAN/SUMMARY-par och den genomförda separata paketborttagningsplanen, vars resultat redovisas i 05-23-SUMMARY/E. Våg-/visualiseringssammanfattningar skapar inga nya planer.

## Källbunden evidens

- SQL SHA-256: `e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71`.
- SQL-prov SHA-256: `be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34`.
- [Rollback](../../../work/pilot/results/phase5-37-rollback.json), [tillämpad foundation](../../../work/pilot/results/phase5-37-foundation.json), [exakt funktionsinventering](05-PLANNING-YEAR-FUNCTION-INVENTORY.md) och [verifiering](05-37-VERIFICATION.md).
