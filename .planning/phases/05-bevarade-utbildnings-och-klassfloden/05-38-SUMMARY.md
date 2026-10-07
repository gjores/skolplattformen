---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "38"
status: complete
completed: 2026-10-07
requirements-addressed: [PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
requirements-finally-verified: []
commits: [d59ec10, 6adee63, 709c4fd, be83c62, f0b14fb]
worker_build_revision: d59ec10f5b4469ce4e14e1e12a591aca2363a30b
---

# 05-38 — Skyddad läsning för planeringsår

**Avgränsat PASS:** dagens huvudman/rektor och gymnasiets befintliga planadministratör kan läsa verkligt skol-/årsunderlag genom tre skyddade Worker-routes. Preflight och permanent slutprov: **15/15 fall, 247/247 kontroller vardera**, komplett cleanup och bevarade originaldata. Exakt tre läsgrants tillkom, totalt 28 Worker-entrypoints; elva privata hjälpare förblir stängda. Nästa steg är [den avgränsade prestandarättningen](05-38-READ-PERFORMANCE-PLAN.md), därefter UI 05-39–43. Fulla PLANERING-/ADMIN-krav och hela fas 5 är fortsatt Pending.

GET `/api/planering/urval` och POST `/api/planering/lista`/`oversikt` använder riktig session/epok, aktuellt mandat, kundlås, obligatorisk DB-/Worker-audit och strikta läskontrakt. Årsval ändrar inte mandatdatum. Lista/översikt läser verkligt setup inom samma transaktion innan strikt scope- och källprojektion; varje lyckad POST verifierar fyra audithändelser, GET två. Same-origin/JSON och no-store består. Auditfel ger 503 utan data eller lyckad audit; ändrad urvalsrevision ger 409 med `reloadSelection`, ogiltigt kontrakt 400 och otillåtet scope 403. Ingen elev-/skriv-/beslutsrätt tillkommer.

Matrisen omfattar alla 52 programramar (50+2), sökning på sista posten, hela urvalets sortering/filter, tre kullår, fryst GY-källa och två skolors egna timmar, deduplicerad gemensam poängram, GR:s gamla års-/klass-/versionskopplingar med okänd originalkarta, IM:s noll/null och äldre ofullständiga data. Komplett IM läses även av gamla API:t med 200; ofullständig äldre IM nekas där med 400 och visas som ofullständig i nya årsöversikten. Framtidsläsning skriver inga verksamhetsrader. Verkliga 401/403/400/409, främmande kund, gymadmin GR, falsk epok, utgången session, faktisk återkallad utfärdare och båda auditfellagren är provade.

## Verifiering och tillämpning

| Kontroll | Resultat |
| --- | --- |
| Adapter + strikt kontrakt | 40 Node-prov PASS |
| Harness/grantgrindar | 11 Node-prov PASS, inga skips |
| Typ/lint/skyddat bygge | PASS, actual Worker på ägd 3060 |
| Temporär preflight | 15 fall / 247 kontroller PASS; rå ACL 25→28→25 exakt återställd |
| Permanent grant | Endast de tre exakta läsentrypoints; 14 definitioner/oförändrade tabell-ACL/RLS/helrader, exakt journal |
| Samma permanenta API-matris | 15 fall / 247 kontroller PASS; samma källhashar och bygge |
| Bevarande efter städning | 15 fullständiga originaltabeller/tidsstämplar hashidentiska; all gammal/ny säkerhetsaudit och identitetsankare bevarade |
| Oberoende GSD-verifierare | 3/3 must-haves passed; inga blockerande fynd inom planen |

[Preflight](../../../work/pilot/results/phase5-38-api-preflight.json), [grant](../../../work/pilot/results/phase5-38-grants.json), [slutprov](../../../work/pilot/results/phase5-38-api-final.json), [verifiering](05-38-VERIFICATION.md) och [aktuella signaturer](05-PLANNING-YEAR-FUNCTION-INVENTORY.md). Alla prov är lokala med syntetiska uppgifter, inget bevis för verklig kommunanslutning eller pilotdrift. Ordinarie 3012 är inte bytt.

## Första fel och avgränsad följdrättning

Första försöket sammanföll med dokumenterad macOS-vila, requesttimeouts och utgångna syntetiska sessioner. Dess cleanup-flagga upptäckte dessutom ett okvoterat SQL-alias; faktisk helrads-/audit-/ACL-bevaring bestod. GR-provet rättades till att kräva bevarade råa timmar samtidigt som årstimmar är okända. Andra försöket passerade 14/15 fall men hade felaktigt använt ofullständig IM för gamla API:ts positiva regression. En separat komplett IM-fixtur och uttrycklig negativ legacykontroll rättade provet. Båda första rapporterna och [felhistoriken](../../../work/pilot/results/phase5-38-failure-history.json) bevaras; inga kriterier lättades. Därefter fulla preflight/slutprov PASS.

Vaken faktisk listläsning av 52 programramar tar cirka 15–20 sekunder; detta är ett uppmätt användbarhetsgap. [05-38-READ-PERFORMANCE](05-38-READ-PERFORMANCE-PLAN.md) ersätter endast en privat hjälpares definition med exakt validerat återbruk inom ett anrop, med gamla/nya resultat och faktiska tider före UI. Originalfoundation och de 93 SQL-proven är oföränderliga. GSD-inventeringen är nu 81 av 99 genomförda planer (en ny avgränsad rättningsplan).
