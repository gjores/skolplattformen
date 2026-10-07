---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "37"
status: passed
verified: 2026-10-07
scope: closed SQL foundation; local synthetic only
requirements-finally-verified: []
---

# Oberoende GSD-verifiering — 05-37

**Avgränsat PASS.** Oberoende agent `verify_planning_year` granskade plan, tidigare modell-/kontraktsresultat, faktisk SQL, harness och prov read-only. Den körde ingen DB-harness och ändrade inga filer. Utföraren körde de verkliga SQL-/lås-/paritets-/bevarandematriserna seriellt; verifieraren bedömer kod/evidens, inte en separat dubbelkörning.

| Planens sanning | Kontrollerat resultat |
| --- | --- |
| Bara dagens mandat tillåter skolor och underlag | Befintlig session→kundlås→levande utfärdarkedja används före scope/filter/count. HM/rektor, admin-GY, främmande skola/kund, utgången session och återkallad utfärdare provade. Tre RPC:er väntar faktiskt på blockerande kundlås och nekar efter commit av återkallelse utan data/ok-audit. |
| Hela urvalet har stabil sök/sort/sidindelning | 55 lika namn ger 50+5 utan dubletter; ändrat resultat ger 40001. Statiska sortnycklar, C-ordning och stabil klassordning. Unicode-trim, år/filtergränser och rad-/globala mängdgränser kontrollerade. |
| Bindning och fryst version styr rätt år; luckor är synliga | GY:s datum/revision kvarstår trots liveändring, känt arN-konflikt nekas. GR åk8/9 behåller gammal version och belagd bindning medan originalkarta/timmar är okända. Saknade/ambigua klasser, okända rader, ofördelade poäng och legacydimensioner ger konservativa resultat. IM är veckoram. |

Verifierarens fynd var saknad `unknown-row`, per-radgränser, GY-bindningskonflikt, stabil klassordning, JS-kompatibel Unicode-trim, GR/IM-legacybredd/nästlade arrayer och modellens extrema akademiska årsgräns. Samtliga rättades före apply och har riktade faktiska negativa/paritetsfall. Inget scope-/mandat- eller summeringsbypass hittades. GY:s hela frysta inventarium verifieras mot katalog; båda skolor kan inte legitimera samma trunkerade inventarium. En gammal källrevision jämförs inte felaktigt med dagens liveprogramrevision.

Slutliga källor: SQL `e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71`, prov `be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34`. Rollback och applied är båda PASS med **93 SQL-prov, 18 faktisk kontraktsparitet och 3 låsprov per omgång**, 15 hela originaltabeller samt originalets säkerhetsaudit/funktionsdefinitioner/rå ACL/journal bevarade. Node 6/6, riktade lås 9/9 och tillämpad inventering 14 stängda funktioner PASS. Första FAIL och låsobservationsfelet består i SUMMARY:s evidenslänkar.

**Kvarstående gräns:** samtliga GR-originalkartor är okända; ingen version kan riktas till gissad årscell. API/Workergrants kommer i 05-38; UI/handbok/mänskligt prov i senare planer. PLANERING-01–05, ADMIN-02/03/04, hela fas 5 och verklig pilot/kommunanslutning är fortsatt Pending. Ordinarie appserver har inte bytts.
