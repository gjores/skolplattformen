# 05-07 — programplansgrund, nulägesinventering

Kontrollerad 2026-09-30 mot aktuell kod på 768514e och läsande inventering av assertTarget-skyddat lokalt protected-mål. Uppgifterna är syntetiska. Detta är inte en ny anslutning eller öppnad skrivväg.

## Befintliga samband

Programplanens lokala modell har utkast, fastställd och ersatt. Huvudman och rektor utformar utkast; huvudmannen fastställer direkt. Timplanens rektorsförslag/återsändning får inte överföras som ett nytt programplanskrav. Utbildnings-ID, kurs-/nivåtillägg och äldre beslut ska bevaras.

Databasen innehåller en gymnasieutbildning och en programplansversion. `offerings` har `program_code`, `orientation_code`, `catalog_fetched`, nullable `start_year` och fri kulltext. `point_plans` har verksamhetsversion, status, `specialization text[]`, katalogdatum samt äldre `auth.users`-FK för skapande/beslut; den saknar revisionskolumn, katalogfingeravtryck och explicita nationella versionsreferenser. Kulltext är inte bevis för utbildningsstart. Ingen befintlig rad får automatiskt märkas som verifierad ny grund.

Worker har fortsatt endast tre fas 5-entrypoints: GR/IM-lista, timplansläsning och avgränsad celländring. Gymnasieskrivning och programplansnavigation är stängda. Inventeringen ändrade inga rader, ACL eller migrationer.

## Katalog och belagda luckor

Snapshoten hämtad 2026-09-05 innehåller 907 ämnen, 2192 kurser/nivåer och 29 program. Samtliga programnivåreferenser matchar katalogens ämneskod och poäng; inga dubbla katalogkoder upptäcktes. Kategorierna omfattar högskoleförberedande program, yrkesprogram och riksrekryterande särskilda utbildningar.

Kodgranskning och reproduktion visar att okänd inriktning tyst kan utelämnas i `pointPlanBlocks`; även `pointPlanIssues` kan då ge tom felmängd om ytterligare fördjupningsnivåer fyller den bortfallna ramen. Program-/ämnesuppslag binder inte till efterfrågad version. Nationella block väljer svenska implicit och hoppar över svenska som andraspråk; ämnen utan nivåer får syntetiska ämnesrader. Modellen använder samma 2500-poängsram för samtliga program och gymnasietimplanen samma högskoleförberedande timram. Dessa beteenden är inte tillräckligt underlag för en skyddad generell gymnasieskrivväg.

## Verifierade primärkällor

[Skolverkets Syllabus-dokumentation](https://www.skolverket.se/om-skolverket/oppna-data/api-for-laroplaner-kurs--och-amnesplaner) anger att nya versioner ersätter tidigare från föreskriftens giltighetsdatum. Daterad lokal snapshot och faktisk aktuell källa är olika bevis.

Faktiska offentliga GET-anrop kontrollerade metadata för SA25 v4, EK25 v4 och ES25 v3. Samtliga har startdatum 2026-07-01 och samma programmetadata som snapshoten. Se `work/pilot/results/phase5-07-source-check.json`. Endast dessa tre programs version/startdatum jämfördes; detta bevisar inte att hela snapshoten är dagens fullständiga katalog. Inga katalogfiler ersattes och inga verksamhetsversioner uppgraderades.

## Avgränsad fortsättning

05-07 bygger ett separat strikt versionsbundet katalog-/programplansunderlag med explicit datum, alternativ och blockeringsorsaker. Det ersätter inte befintliga lokala modeller och öppnar inga kommandon, roller eller rättigheter. Framtida SQL måste kontrollera verklig session/skola, revision och samma frysta grund atomärt med obligatorisk audit innan programplansskrivning kan öppnas. Saknad historisk version, okänd inriktning och ej belagd ram får inte falla tillbaka till senaste katalog eller hårdkodad generell ram.
