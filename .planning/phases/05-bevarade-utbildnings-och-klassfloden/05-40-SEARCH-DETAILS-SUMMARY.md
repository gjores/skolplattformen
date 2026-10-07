---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "40-SEARCH-DETAILS"
status: complete
completed: 2026-10-07
requirements-addressed: [PLANERING-02, PLANERING-03, PLANERING-04]
requirements-finally-verified: []
source_commit: 43ab14cb88b277ce23516eee9b5345d3e8037db0
worker_build_revision: 0913d5a0527e2975ce3059b8672b2c139bf07997
---

# 05-40 — Verkliga utbildningsdetaljer och servermatchning

**Avgränsat PASS:** lokal kod, faktisk program-/inriktningskod och verifierade katalogbenämningar är sökbara i hela det behöriga års-/skolurvalet före sortering och sidindelning. Det nya parserbygget fungerar både mot exakt äldre19-fältsrad och utökad20-fältsrad. UI-tabeller, mobilårsknappar och användarprov följer i39–43; ordinarie3012 är kvar på5dd7baf.

Varje utökad rad har exakt fem nullable searchDetails-fält. Benämningar kommer från underlagets exakta katalog/programversion/inriktning, med maskning när utbildningens egna koder avviker. Saknad källa/plan/kod ger saknad benämning, ingen latest-fallback. Lokal kod med procent, understreck och apostrof matchas som vanlig text. Metadata ingår i urvalsrevisionen; gamla sidor får409 efter verklig ändring. Samma avgränsning, plan-/källidentitet, celler och beräkningar består.

## Faktiska resultat

| Kontroll | Resultat |
| --- | --- |
| Fullrollback och full applied | Vardera271/271 SQL-prov,38 exakta kärnjämförelser och23 deklarerade sök-/revisionsfall PASS |
| Oförändrade originalprov | Vardera93 SQL/18 SQL–TypeScript-kontrakt mot original och kandidat inom båda rollbackkörningarna, utan skips |
| Ny parser mot äldre DB-form | Faktiska HM/rektor/admin setup/lista/översikt samt oförändrad API15/247 PASS |
| Exakt tillämpning06123000 | Endast privat rows(jsonb)-definition och en exakt journalpost; inga nya grants/tabeller/skrivvägar |
| Faktisk tillämpad sökning | 19/19 fall och204/204 kontroller: senare sida, literaltext, koder/namn, null/saknad källa, scope/filter, fryst källa,409,nekanden,auditfel |
| Oförändrad fullAPI efter apply | 15/15 fall och247/247 kontroller PASS |
| Svarstid | 12 verkliga fulla HTTP200-svar med native30s-gräns, auditpar/no-store/stabil revision; medianer nedan |
| Bevarande/cleanup | Samma28 entrypoints och råACL,197 övriga public-definitioner (198 totalt), full15 originalhelrader/tidsstämplar, audit-/identitetsankare och ägd cleanup PASS; ingen deferred/unknown |
| Källkontroller | 71 rena kontrakts/server/grindprov, full typkontroll utan incremental och app/lib-lint PASS; SQL-fixturrättningens20 rena grindprov och oberoende källreview PASS |

| Tre mätningar per fall | Median | Högsta |
| --- | --- | --- |
| Lista52/50 | 3,576s | 4,883s |
| Kodträff efter sida1 | 2,820s | 3,063s |
| Sida2 med samma revision | 3,429s | 4,115s |
| Översikt52/52 | 2,752s | 2,796s |

Alla12 svar under4,884s; samtliga medianer under5s. Prestandakorrektivets historiska mätningar används som referens med annan egen fixtur, inte som kausalt mått på benämningsuppslagets kostnad. Detta är lokal syntetisk verifiering, ingen verklig kommunanslutning eller pilotdrift.

## Källor, isolering och felhistorik

[Rollback](../../../work/pilot/results/phase5-40-search-details-rollback.json), [parser/API](../../../work/pilot/results/phase5-40-search-details-parser-api.json), [apply](../../../work/pilot/results/phase5-40-search-details-apply.json), [slutprov](../../../work/pilot/results/phase5-40-search-details-final.json), [API-slutprov](../../../work/pilot/results/phase5-40-search-details-api-final.json), [oberoende verifiering](05-40-SEARCH-DETAILS-VERIFICATION.md).

Actualsource43ab14c och separat protected-bygge0913 är bundna till samma oförändrade produktbytes. Katalog-/definitionshash `9261d40f074c75bdbe5cd0119204ddfb13d4a3741d3cdf96b07f92200b9ebf21` ersätter performancehash78eb6d6f; migrationsfilens SHA256 `b566b7abcce22784b9fe5dc6e4fba691afb4b008b5251b570acc19fef6b3685c`, slutliga SQL-provet `e43ea34c40eba19fd700430ce93e638f5fbf1103284c6983cb95e8d9a507229f`. Alla44 aktuella källor samt historiska dependencyrapporter kontrolleras mot sina egna Gitrevisioner. Rapporter är exakt kopierade från separat managed runtimearbetskopia; vanlig3012:s byggfiler har inte byggts om.

Första [preflightREFUSED](../../../work/pilot/results/phase5-40-search-details-preflight-refused-20261007.json) gällde targetworkdir. Egen ignorerad målkatalog med exakt config/anslutningar och endast ändrad workdir löste avgränsningen. Första [SQLFAIL](../../../work/pilot/results/phase5-40-search-details-first-sql-fail-20261007.json) gällde saknad explicit skolkoppling för en egen replica-insertad legacyutbildning; endast provfixturen rättades. Förväntade antal, produkten och acceptansgrinden ändrades inte.

Första [apply-artifactfel](../../../work/pilot/results/phase5-40-search-details-first-apply-artifact-fail-20261007.json) uppstod efter DBcommit när egen migrationskatalog saknades. Ett för tidigt [appliedförsök](../../../work/pilot/results/phase5-40-search-details-apply-artifact-first-final-fail-20261007.json) stoppade före SQL/fixture. Exakt källgranskad [återhämtning](../../../work/pilot/results/phase5-40-search-details-apply-artifact-recovery-20261007.json) d8a1d2d återställde enbart den egna helpern/journalen med full katalog/15/råACL/full-audit-/identitetsbevarande före/efter/postcommit. Därefter skapades den ignorerade katalogen och samma applicerare gav färsk faktisk rapportPASS. Inget applyPASS rekonstruerades och inga första fel skrevs över.

Fulla PLANERING-/ADMIN-krav och fas5 är Pending. Färdigmarkering/godkännande samt UI-/mobilgapet återstår i respektive senare steg.83/100 planer genomförda,3/8 verifierade faser; nästa05-39.
