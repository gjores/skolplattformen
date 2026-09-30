---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "03"
status: complete
requirements: [ADMIN-02, ADMIN-04]
completed: 2026-09-30
source_commit: 8c91a22e97c1fb40f099c730060d434927560d9b
---

# 05-03 — stängd SQL-grund för timplansutkast

Mandatavgränsad läsning för huvudman/rektor och celländring för rektor finns nu som interna SQL-funktioner. Funktionerna är fortsatt stängda för PUBLIC, anon, authenticated och Worker. Ingen skyddad appvy är öppnad.

Planens revisionsnummer är separat från verksamhetsversion. Kundlås och planradlås skyddar jämförelsen med förväntad revision; en äldre ändring nekas även om den gäller en annan cell. Aktuell mandatkedja, medlemskap, personalbindning, kund och faktisk skola kontrolleras före innehåll eller konflikt. Endast utkast/återsänd kan ändras. Vald befintlig rad, kolumnbredd, 0–2000 timmar samt grundskolans NO/SO-/medlemsämnesregler och IM:s fasta rader valideras. Gymnasieskrivning nekas tills programplans-/kataloggrunden är verifierad.

Cell, revision och minimerad security_events-händelse är en transaktion. Audit kommer från faktisk identitet, medlemskap, uppdrag och kund samt obligatorisk korrelation; inga timmar eller fria kommentarer lagras i audit. Intern DB-audit har session_id=NULL. Serverns sessionkoppling, MFA/same-origin, nekande-/konfliktaudit och API-bevis återstår före exakt Worker-grant i 05-04.

## Färska prov

Proven kördes på arbetskopiekoden som därefter committades i `8c91a22` (utgångsrevision `5a8287d`), i assertTarget-skyddat disponibelt lokalt protected-mål. Inga verkliga personuppgifter eller kommunanslutningar.

| Kontroll | Resultat |
| --- | --- |
| phase5_timplan.test.sql | PASS 77/77 |
| verify-timplan-locks.mjs | PASS 4/4, två verkliga anslutningar |
| phase3_mandates.test.sql | PASS 243/243 |
| phase3_audit.test.sql | PASS 19/19 |
| phase4_conflicts.test.sql | PASS 19/19 |
| node --test lib/timplan-model.test.mjs | PASS 14/14 |
| Riktad lint av låsköraren och staged diff-kontroll | PASS |

SQL-proven omfattar annan kund/skola, huvudmansskrivning, admin, förfalskad rollhint, avslutat eget uppdrag/givare, utgången givare, blockerat medlemskap och stängd kund. Felaktig cell/stadium/bredd, NULL/dimension/lower-bound, standardårskurser och lagrad årskursordning prövas. Loggfel och yttre rollback återställer timmar/revision/audit. Äldre fastställt beslut, verksamhetsversion, utbildnings-ID och explicit klasskoppling förblir oförändrade i fixturen. Alla nya funktionsgrants och direkta gamla cellvägar är stängda.

Tvåanslutningsprovet observerar faktisk väntan på kund-/planlås: samma cell, annan cell, återkallad givare och planrad som fått ny revision. Andra skrivningen nekas efter första commit; nekad skrivning ändrar inget. Köraren städar enbart sin nya slumpkund och egna syntetiska objekt före PASS.

De första SQL-körningarna avbröts av tre fixtur-/syntaxfel (spärr utan blocked_at, kompositåtkomst utan parenteser, skola utan municipality_code); de rättades och hela slutliga sviten passerade. Parallella Supabase CLI-prov krockade vid pgTAP-aktivering; mandatprovet kördes därefter separat och passerade. Inget avbrott klassades som PASS.

## Inventering och gränser

Före migration: timplans/cells/events/offerings/school_units ägdes av postgres med RLS; ingen FORCE RLS. Worker hade SELECT på timplans men ingen cellåtkomst eller generell planskrivning; äldre policies bevarades bakom befintlig karantän. Målet innehöll en fastställd timplan. Ny migration 20260930110000 tillämpades transaktionellt utan reset/radering och lade revision DEFAULT 0. Inga äldre migrationer ändrades. Slutkontroll: den befintliga fastställda planen har kvar ID/version/status och revision 0; samtliga fyra nya funktioner saknar Worker-EXECUTE och inga provkunder är kvar. PostgreSQL-konflikt 40001 ska mappas till API:s 409 i nästa plan; detta är ännu inget API-bevis.

Planen avgränsades vid granskning från full matrisvalidering till vald rad/kolumnbredd. Full radmängd, totalram, förslag/beslut, skapande och gymnasiets programplansgrund återstår. Läsresultatet innehåller planmetadata/celler; skolform/kolumnunderlag för kommande UI behöver ett separat serverkontrakt. Ingen falsk auth.users-aktör skrivs i timplan_events. Review-agent fann inga materiella fel i slutlig migration/låskörare och bekräftade städningens exakta avgränsning.

ADMIN-02/04 är fortsatt Pending. Detta är en färdig delplan, inte verifierad fas eller färdig planeringsfunktion. Ingen appkod/UI ändrad; därför inget appbygge, browserprov eller handboksbygge i denna SQL-plan. Fas 4:s partiella användarprov, datumanmärkning och separat fasverifiering kvarstår.
