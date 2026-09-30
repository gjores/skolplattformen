---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "05"
status: complete
requirements: [ADMIN-02, ADMIN-04]
completed: 2026-09-30
source_commit: 93ceb4e36928881097f83a8dfa29b60ed7efec17
proof_commit: 612523c
---

# 05-05 — auditerad timplanslista och kolumnunderlag

Befintliga grundskole-/IM-timplaner kan nu listas inom huvudmannens eller rektorns aktuella kund-, huvudmanna- och skolmandat. Listan ger skola, utbildning, kull, version och status med exakt count, stabil ordning och 50 per sida. Gymnasieplaner listas inte. Tomt urval och tom sida är skilda och loggas båda obligatoriskt.

Läsningen ger dessutom schoolName och education med namn/kull/skolform/årskurser. Grundskolans sparade unika årskursordning bevaras; saknat/empty underlag ger standard 1–9. IM och gymnasium har inga påhittade årskurskolumner. Grundskole-/IM-celler som faktiskt finns måste ha rätt bredd och giltiga timmar; saknade rader skapas inte. Gymnasiets befintliga API-läsning bevaras, skrivning fortsatt stängd.

POST /api/timplaner/lista har exakt {page} och slutet svar. SQL, metadata, ID:n, namn, antal, sidlängd och dubbletter valideras innan svar. Båda källornas minimerade säkerhetshändelser har verklig session, identitet, medlemskap, mandat, kund och korrelation. Lista har objectType=timplan_collection utan objekt-ID eller planinnehåll. Loggfel stoppar utlämning och återställer båda framgångshändelserna.

## Färska bevis

Server, 140000 och skyddat API-bygge är 93ceb4e. Slutlig prov-/grantkod är 612523c; samma filinnehåll provades före commit. API-sessioner mintades lokalt med testrealmens bevisprofil; verklig byggd Worker och PostgreSQL, ingen interaktiv IdP eller kommunanslutning. Egna syntetiska kunder och objekt i assertTarget-skyddat disponibelt protected-mål.

| Kontroll | Resultat |
| --- | --- |
| Preflight --selection | PASS 39/39, 135 kontroller, exakt proacl återställd |
| Final --selection utan tillfälliga grants | PASS 39/39, 135 kontroller, cleanup PASS |
| List-/metadata-SQL | PASS 59/59 före och efter grant |
| Befintlig timplans-SQL | PASS 77/77 |
| Sessions-/Worker-SQL | PASS 27/27 före grant och med slutlig exakt 3 entrypoints |
| Verkliga samtidighetslås | PASS 4/4 på 07914ff; observerad väntan och oförändrade nekade celler |
| Serverkontrakt | PASS 14/14 |
| API-körargrind | PASS 3/3 |
| Mandat och säkerhetsaudit | PASS 243/243 och 19/19 |
| Appmodell/server inklusive kommande UI-hjälpare | PASS 430/430 på 9f60075; inga skip |
| Typ/lint och skyddat bygge | PASS; API-bygge 93ceb4e, senare UI-bygge 9f60075 |

De tidigare 29 API-fallen bevarades och 10 obligatoriska list-/metadatafall lades till. Listans session-/spärr-/kund-/epokprov ingår även i de befintliga negativa fallen. HM ser endast mandatets skolor; rektor ser bara egen skola. Främmande kund och gymnasieplaner lämnas inte ut. Pagination omfattar fler än 50 versioner utan dold trunkering/dubbletter; långt efter sista sidan visas tom sida med rätt count. Tom skolmängd och läsning utan MFA har dubbel beständig audit. Osorterade årskurser och IM:s veckotimmar matchar faktiskt lagrade objekt. DB-/Worker-auditfel på lista prövas separat. Varje nekande har exakt kod/korrelationssvar, cacheförbud och minimerad beständig Worker-händelse.

## Migration och slutlig ACL

140000 lade stängd listfunktion och metadata i framåtmigration. Befintlig read/change-grant bevarades; audit-hjälparens slutna operationer utökades enbart för collection-läsning. 150000 tillämpades först efter full preflight och exakt textjämförd ACL-återställning för alla phase5-funktioner. Endast den nya listfunktionen fick Worker-EXECUTE. Slutlig mängd är exakt phase5_list_timplans(integer), phase5_read_timplan(uuid) och phase5_change_timplan_cell(uuid,integer,text,integer,integer). Helpers, PUBLIC/anon/authenticated förblir stängda. Inga tabell-/RLS-grants ändrades.

Provfixturens första SQL-körningar rättades till schemats faktiska timgräns och högst ett öppet utkast per utbildning: paginationsversioner är ersatta med beslutsdatum. Ingen tillämpad migration ändrades. Tillfällig listgrant kompenserades exakt och inga triggers kvarstår. Egna syntetiska fixturer, sessionsrader och legacybindningar städades; append-only säkerhetsloggar bevarades. Oberoende agentgranskning bekräftade evidensen och hittade klient-/browserkontraktsglapp som rättas i 05-06, inga server-/SQL-säkerhetsfel.

## Fortsättning och gräns

05-06 bygger och provar den synliga list→read→cell-vyn, osparat skydd, sparstatus, explicit konfliktsomförsök, rensning och handbok. Skapande, fullmatris-/totalramvalidering, förslag/beslut, gymnasiets programplansgrund, klasskoppling och kullkopiering återstår. ADMIN-02/04 fortsatt Pending; fas 5 och fas 4:s mänskliga checkpoint/slutverifiering är öppna. Denna serverdel godkänner inte verklig pilotdrift.
