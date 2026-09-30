---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "04"
status: complete
requirements: [ADMIN-02, ADMIN-04]
completed: 2026-09-30
source_commit: c216c7b0812c9b5881b501ecca9f8f5fe2d2eea9
proof_commit: 000ec09d57c7a8e7026a8c7eba0b60b1db10b225
---

# 05-04 — sessionskopplad timplansläsning och celländring

De två skyddade serverrutterna är implementerade och prövade mot byggd Worker och verklig lokal PostgreSQL. Huvudman och rektor kan läsa en befintlig timplan inom aktuellt skolmandat; rektor med MFA kan ändra en befintlig grundskole-/IM-utkastcell. Den skyddade planeringsvyn är fortfarande stängd. Gymnasieskrivning inväntar verifierad programplansgrund.

Servern omläser och låser sessionen och sätter app.session_id från faktisk sessionsrad. Databasens audit kontrollerar att session, identitet, medlemskap och uppdrag hör ihop och fortfarande gäller. Worker-anrop utan denna koppling stoppas. Postgresägda SQL-fixturer utan session är uttryckligen intern SQL-verifiering, inte den skyddade API-vägen.

POST /api/timplaner/lasa och /api/timplaner/cell har slutna in- och svarskontrakt. Okända fält och felaktiga värden avvisas; svar måste matcha begärd plan och revision. Behörighet, MFA, same-origin och context-epoch prövas med befintlig protectedRoute. Konflikt ger minimerad 409 och beständig nekandelogg. Framgång kräver både DB- och Worker-event med samma korrelation och verklig session/aktör/mandat i samma transaktion. Loggfel återställer cell, revision och framgångsloggar; nekandeloggfel stoppar svaret. Audit innehåller inga timmar, planinnehåll eller fria payloadfält.

## Färska prov

Server och skyddat bygge: `c216c7b0812c9b5881b501ecca9f8f5fe2d2eea9`. Provkörare, SQL-prov och smal grant: `000ec09d57c7a8e7026a8c7eba0b60b1db10b225`; samma filinnehåll prövades före commit. Samtliga prov riktades via assertTarget till disponibelt lokalt protected-mål med syntetiska uppgifter. API-sessionerna mintades lokalt med testrealmens bevisprofil; detta är inte interaktiv IdP-inloggning eller verklig kommunanslutning.

| Kontroll | Resultat |
| --- | --- |
| API preflight | PASS 29/29 fall, 93 kontroller; exakt ACL återställd |
| API final utan temporära grants | PASS 29/29 fall, 93 kontroller |
| Sessions-/Worker-SQL | PASS 27/27 |
| Befintlig timplans-SQL med slutlig ACL | PASS 77/77 |
| Verkliga tvåanslutnings-/låsprov | PASS 4/4 på sessionsmigrationerna |
| Mandat / säkerhetsaudit / registerkonflikt | PASS 243/243, 19/19, 19/19 |
| Modell- och serverkontrakt | PASS 416/416, inga skip; varav 9 riktade timplanskontrakt |
| API-körarens kravgrind | PASS 2/2 |
| Typkontroll, app-/körarlint, skyddat bygge | PASS |

API-provet omfattar annan roll, kund och skola, saknat objekt, återkallad/utgången session, återkallad givare, spärrat medlemskap/stängd kund, utebliven MFA, cross-origin och gammal kontext. Två rektorssessioner med samma revision ger exakt en vinnare och en auditerad konflikt; omläsning och färskt omförsök fungerar. Felpayload, fastställd plan och gymnasieskrivning ändrar inget. DB- och Worker-auditfel injiceras separat. Varje nekande har exakt kod/korrelationssvar, cacheförbud och avstämd Worker-händelse; tidiga fel utan kontext har uttryckligen null-attribution. Samtliga tillåtna anrop har två sessionskopplade, minimerade händelser.

## Migrationer och slutlig behörighet

120000 kopplar audit till session. Granskningen upptäckte att godtyckligt INSERT-fel kunde få fel API-klassning; separat framåtmigration 121000 normaliserar endast audit-INSERT till 55000. Redan tillämpad migration ändrades inte. Injektion med P0001 bevisar rätt felklassning och rollback.

130000 tillämpades först efter full preflight och verifierad återställning av exakt proacl för båda entrypoints och båda helpers. Temporära grants behövde vara synliga för Workerns separata anslutningar och återställdes därför med explicit kompensation. Slutlig Worker-EXECUTE är exakt:

- public.phase5_read_timplan(uuid)
- public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)

scope/audit-hjälparna och PUBLIC/anon/authenticated förblir stängda. Inga tabell-/RLS-grants öppnades. Provfixtur, sessionsrader, legacybindningar och temporära triggers städades med egna exakta ID:n/markör; append-only säkerhetsloggar bevarades. Både preflight och final rapporterar cleanup PASS.

Verifieringsgranskningen skärpte först nekandesvar, nekandets exakta aktörskoppling och ACL-återställning; den slutliga fulla preflighten kördes därefter om före grant. Ett äldre preview höll byggkatalogen upptagen; det stängdes och skyddat bygge kördes om med PASS. Inget misslyckat delprov räknades som slutligt bevis.

## Kvarstående arbete

Nästa avgränsade plan behöver skolforms-/kolumnunderlag och skyddad timplansvy med omläsning, sparstatus och revisionskonflikt samt dator-/telefonprov och handbok. Skapande, full matris/totalram, förslag/beslut, utbildningsflöden, programplansgrund, kullkopiering och klasskopplingskommandon återstår. Denna serverplan ändrar inga synliga användarflöden och kräver därför inget nytt browser-/handboksbygge.

ADMIN-02/04 är fortsatt Pending; fas 5 är inte slutverifierad. Fas 4:s partiella användarprov, datumanmärkning och separata fasverifiering kvarstår. Terminologin programplan och den samlade UI-genomgången finns fortsatt i todo.
