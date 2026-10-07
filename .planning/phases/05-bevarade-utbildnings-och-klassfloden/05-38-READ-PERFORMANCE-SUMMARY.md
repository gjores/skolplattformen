---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "38-READ-PERFORMANCE"
status: complete
completed: 2026-10-07
requirements-addressed: [PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
requirements-finally-verified: []
worker_build_revision: d59ec10f5b4469ce4e14e1e12a591aca2363a30b
rollback_source_commit: 3d1ac4a263178719ce11719326a8707f96349ca1
applied_source_commit: 86b13d683f6db37a522d770962c959a58c94f3ef
api_source_commit: adf9b7e48fc4704f1a0aad14744a9190d3288937
---

# 05-38 — Programlistans svarstid

**Avgränsat PASS:** samma skyddade års-/skolunderlag läses snabbare i den isolerade lokala miljön. Fullrollback, exakt tillämpning och fullständigt applied-slutprov är godkända. Den oförändrade Worker-artefakten används; ingen användarvy eller ordinarie3012-server byts här. Nästa steg är [kod-/benämningssökningen](05-40-SEARCH-DETAILS-PLAN.md), därefter UI05-39–43 och konkret användarprov.

Migration06122000 ersätter endast den privata `public.phase5_planning_year_rows(jsonb)`. Exakt lika JSONB-underlag får återanvända redan fullständigt validerad käll-/cellprojektion inom ett anrop. Planens identitet, revision, status, skola och källreferenser projiceras fortfarande för varje rad. Nyckeln omfattar hela det relevanta katalog-/underlags-/fördelningsinnehållet, inklusive arrayordning. Gränser128 poster/50000 celler ger återgång till ordinarie validering. Inga nya RPC, tabeller, grants eller skrivvägar tillkommer.

## Verifierade resultat

| Kontroll | Resultat |
| --- | --- |
| Färsk fullrollback | SQL143/143, 46 exakt gamla/nya data- eller SQLSTATE-fall; original93/93 och18 faktisk SQL/TS-paritet PASS |
| Exakt apply | En privat definitionsdiff och en journalpost; alla övriga definitioner/rättigheter bevarade |
| Färskt fullständigt applied-prov | Samma SQL143/46 och oförändrad93/18 PASS, utan återbruk av äldre delbevis |
| Verkliga HTTP-mätningar | 9 före och12 efter; HTTP200, strikt svar, no-store, stabil urvalsrevision, exakt DB-/Worker-audit och ägd sessionsbarriär |
| Oförändrad API-matris efter apply | 15/15 fall och247/247 kontroller PASS, samma Worker-bygge |
| Bevarande/städning | Alla15 hela originaltabeller inklusive tidsstämplar, rå ACL28, katalog/journal och audit-/identitetsankare PASS; ingen deferred completion |
| Slutliga verktygskällor | 33 rena grindprov och oberoende källreview PASS; strikt ägd lokal Connection:close-testtransport med ordinarie setup15s/planning30s |
| Oberoende GSD-verifierare | 3/3 mål passed, 35/35 historiska upstreamkällor hashidentiska och första FAIL bevarade |

| Tre verkliga prover per fall | Median före | Median efter | Förbättring |
| --- | --- | --- | --- |
| Lista52/50 | 16,274s | 2,120s | 7,68× |
| Sökning efter första sidan | 20,658s | 1,358s | 15,21× |
| Sida2 med samma revision | 16,907s | 1,416s | 11,94× |
| Full överblick | Ej uppmätt före | 1,560s | Endast absolut tidsmål |

Alla tolv kandidatprov ligger under2,154s och passerar planens oförändrade krav: minst3× snabbare median för lista/sök/sida, median högst5s och varje prov under10s. Detta gäller de faktiskt prövade52 syntetiska ramarna; ingen verklig kommunanslutning eller pilotdrift är verifierad.

## Bevis och tidigare fel

[Fullrollback](../../../work/pilot/results/phase5-38-read-performance-rollback.json), [tillämpning](../../../work/pilot/results/phase5-38-read-performance-apply.json), [slutprov](../../../work/pilot/results/phase5-38-read-performance-final.json), [API-slutprov](../../../work/pilot/results/phase5-38-read-performance-api-final.json) och [oberoende verifiering](05-38-READ-PERFORMANCE-VERIFICATION.md).

[Felhistoriken](../../../work/pilot/results/phase5-38-read-performance-failure-history.json) bevarar första SQL-assemblerings-/fixturfel, syntetisk sessionsutgång och HTTP-timeout/okänt avslut som FAIL. Separata ägda återhämtningar bevarade originalrader/audit; diagnoser gav inget fullplansbevis. Endast provfixturens fyra SQL-sessioner fick3h giltighet och separat120min processgräns. Native HTTP15s/30s, produktens sessionsregler och acceptansgrindar består. Slutlig ägd testtransport stänger anslutningen efter svar och återställs före cleanup. Ingen underliggande transportorsak är belagd. Ingen censurerad reserv eller gammalt SQL-delbevis användes i de godkända fullkörningarna.

Fulla PLANERING-/ADMIN-krav, fas5, rektorns färdigmarkering/huvudmannens godkännande och mobilens gränssnittsgap förblir öppna. Backendens förbättring är en teknisk förutsättning; mänsklig begriplighet prövas efter UI-leveransen. Planinventeringen är82/100, verifierade faser fortsatt3/8.
