---
created: 2026-10-14
updated: 2026-10-21
title: Kortare väntetid för programplaner, timplaner och tjänstefördelning
area: planning
status: pending
phase: 05
related_phase: "05.1"
---

# Användarrapporterat problem

Användaren upplever att programplaner och timplaner tar mycket lång tid att läsa in i den lokala appen på port 3012 och bad 2026-10-14 att detta läggs i backloggen. Den bifogade skärmbilden visar utbildningsöversikten med sökfält, filter och beskedet ”Läser planeringsunderlaget...”. Timplanernas väntetid är rapporterad i text. Exakt varaktighet, roll, datamängd och grundorsak är ännu inte uppmätta.

# Uppföljning

- Mät tiden till användbar översikt och öppnad plan separat för programplaner och timplaner, inklusive första besök, återbesök samt byte av skola och planeringsår.
- Följ hela läskedjan från användarens val till visad vy; särskilj databas-, API- och klienttid samt upprepade eller sekventiella anrop.
- Jämför med tidigare avgränsade förbättringar i 05-38-READ-PERFORMANCE och 05-OPERATIONAL-VERIFICATION. Historiska mätningar visar inte att dagens upplevda väntetid är acceptabel eller att orsaken är densamma.
- Åtgärda identifierade flaskhalsar och ge begriplig återkoppling under väntan. Behörighetskontroller, aktuella versioner och skydd mot inaktuella svar ska bevaras.
- Redovisa jämförbara före-/eftermätningar för samma data och roller, inklusive långsamma anrop. Verifiera berörda flöden på dator och telefon och låt användaren bedöma väntetiden igen.

Registrerad som backlogg enligt användarens önskemål. Ingen prestandarättning eller ny verifiering är genomförd med denna notering. Pågående kopie-/klassprov är fortsatt öppet; rapporten utgör inget godkännande av provet.

# Komplettering 2026-10-21 — tjänstefördelningen är långsammast

Användaren rapporterar fortsatt långsam laddning i alla tre vyerna och preciserar att tjänstefördelningen är segare än programplaner och timplaner. Användaren beställer en GSD-todo; implementation påbörjas inte genom denna notering. Prioritera undersökning av tjänstefördelningen inom fas 05.1 och samordna planlistorna med fas 05. Kravkoppling: berörda läsflöden för TJANST-01–04; prestandaverifiering återstår.

## Konkreta kodfynd

- `web/app/tjanst-workspace.tsx`: laddningseffekten beror på `term` och `filterKey`, men läsanropet skickar bara skola, läsår och eventuell version. Termin-/filterbyte hämtar därför hela underlaget igen, trots att `filterGroups` redan filtrerar lokalt.
- `supabase/migrations/20261020120000_tjanst_plan.sql`: `tjanst_needs` går igenom klasser och deras timplansrader. `tjanst_gy_label` läser katalogens JSON och söker ämnes-/nivånamn för varje aktuell gymnasierad. Samma katalog och kurs kan behandlas upprepade gånger för olika klasser.
- `supabase/migrations/20261020130000_tjanst_assignments_feedback.sql`: `tjanst_plan_projection` söker igenom behovens JSON för varje sparad tjänsterad. `tjanst_plan_blockers` i föregående migration gör en liknande kontroll igen för utkast. Detta behöver undersökas vid växande datamängder.
- `supabase/migrations/20261006120000_phase5_planning_year_reads.sql`: `phase5_planning_year_list` bygger och sorterar hela resultatet innan sidans högst 50 rader väljs. Aktuell definition av `phase5_planning_year_rows` i `20261019150000_planning_year_shared_grim_units.sql` beräknar underlag före flera filter; liten svarssida innebär inte lite databasarbete.
- `web/lib/server/db.ts` låser sessionsraden och anropar `phase3_lock_customer`. Kundlåset är exklusivt enligt `20260924130000_phase3_mandate_policy.sql` och kan få samtidiga skyddade anrop att köa bakom en tung läsning. Låsen skyddar mandatändringar; de får inte tas bort utan separat säkerhetsanalys och samtidighetsprov.

Fynden är belagda genom kodläsning. Ingen aktuell HTTP-/SQL-tid, svarsstorlek, radmängd eller låsväntan är uppmätt. Det är inte fastställt vilken del som dominerar användarens väntetid eller att lokal Supabase är orsaken. Kontrollera körande bygge och installerade funktionsdefinitioner före mätning; arbetskopian kan skilja sig från körande app.

## Åtgärds- och verifieringsunderlag

- Mät separat första laddning, återbesök, termin-/filterbyte och omläsning efter sparande. Registrera antal anrop, databas-/låsväntan, svarsstorlek och tid till användbar vy utan personuppgifter eller hemligheter.
- Pröva att ta bort fullständiga omladdningar vid rena visningsfilter och terminbyte. Bevara färskhetskrav, mandatprövning, kontextbyten och skydd mot gamla svar; dokumentera när verklig omläsning ska ske.
- Pröva återanvändning av katalog-/namnuppslag inom samma läsning, bundet till exakt frusen katalogversion, och gemensamt uppslag av behov per stabil källnyckel i stället för upprepade JSON-genomgångar.
- Utred tidigare filtrering/sidindelning i planlistorna med oförändrad global sökning, sortering, antal och urvalsrevision. Bevara befintlig validering och rättighetsavgränsning.
- Jämför före/efter med samma syntetiska data: flera klasser som delar timplan/katalog, ökande antal tjänsterader samt samtidiga läsanrop. Kontrollera oförändrade behov, tider, namn, versionsval, ändrat-underlag-markeringar och publiceringsspärrar. Prova även återkallat mandat och skol-/läsårsbyte under laddning.
- Verifiera berörda flöden på dator och telefon. Dokumentera uppmätta resultat och låt användaren bedöma väntetiden på nytt. Historiska PASS-resultat från 05-38 ersätter inte nya mätningar.

## SS 12000 och avgränsning

Prestandaarbetet ska bevara stabila identifierare, klass-/skol-/personrelationer, giltighetstider samt käll- och skrivansvar. GSD-planen ska ange tillämplig SS 12000-version och berörd objektmappning om datamodell eller utbyteskontrakt påverkas. Ingen sådan ändring eller verifierad standardanslutning ingår i denna todo. Om användarbeteendet ändras ska planen omfatta berörd handbok och dokumentationsbygge.

Status: pending. Kodfynd dokumenterade; mätning, planering, rättning och verifiering återstår.
