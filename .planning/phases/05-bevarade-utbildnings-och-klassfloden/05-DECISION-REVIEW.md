# Källgranskning av beslutskedjan

Datum: 2026-10-12. Status: **källgranskat, faktisk verifiering pågår**. Detta är ingen beteende-PASS eller fasacceptans. SQL-författaren har själv granskat sin migration och separat granskat rootens server/kontrakt samt UI-integrationen; detta ska inte beskrivas som en oberoende granskning av den egna SQL-implementationen.

Granskat mot DECISION-FLOW-CONTEXT och aktuell kod: `web/lib/plan-decision.ts`, `web/lib/server/plan-decision.ts`, de tre rutterna under `web/app/api/planbeslut/`, panel/provider samt integrerade program-/gymarbetsytor, och `supabase/migrations/20261012180000_plan_decision_flow.sql`.

## Källmässigt sammanhängande delar

- Råsvaret är exakt Detail plus source/catalog/hours. Revisionsregeln överensstämmer: programinsändning/återsändning/tillbakatagande ändrar granskningsrevision, programfastställande också planrevision; timövergångar ändrar båda.
- Servern verifierar den frysta katalogen och fulla rader/terminer/timmar inom samma transaktion innan beslutet får committa. Klientens ready/aktör/datum är inga beslutskällor. Mutationsrutt kräver MFA, CSRF, faktiskt mandat och obligatorisk audit.
- SQL låser via befintlig session–kund–skola–utbildning–plan-ordning. Allskolmandat krävs för programbeslut, egen rätt skola för timplan. Replay kontrollerar fortsatt session/uppdrag och programskolornas mandat, samt exakt identitet/uppdrag/request.
- Beslutstriggers använder en privat transaktions-/backendbunden permit-tabell, inte en användarsättbar GUC. Tillståndet avlägsnas i kommandot och återgår vid rollback. Helpers och nya tabeller saknar vanlig klient-/Worker-DML.
- Inskickad programplan kan inte ändras via term-, specialiserings-, ram-, utbildningsmetadata-, skollänks- eller raderingsväg. Arkivering och återkallade mandat kan fortfarande stänga beslutet. Timförslag och fastställda/ersatta timmar är låsta; återsända timmar är redigerbara.
- Oförändrat programinnehåll kan fastställas efter att timutkast skapats utan att den frysta källan skrivs om. Innehållsjämförelsen behåller planidentitet, katalog, rader och terminer men bortser från rena besluts-/livscykelrevisioner. Faktisk ändring kräver explicit ny källa/version.
- Äldre beslut ersätts atomiskt och behåller innehåll, beslutsuppgifter och klasslänkar. Beslut ändrar inga `class_timplans`. Historik och kvitton är separata och oföränderliga, med interna identiteter; kommentarer läggs inte i global säkerhetsaudit.
- Uppdragsbyte remonterar provider med `key={contextKey}`. Programeditor använder separat reviewstage för låsning trots kvarvarande databasstatus `utkast`. År/skolkontext och explicita versionsöppningar använder befintliga vägar.

## Konkreta fynd och åtgärder under granskningen

1. **Rättat i SQL:** Programfastställandets revisionsändring får inte ensam göra timkällan obrukbar. Exakt kanoniskt innehåll jämförs separat.
2. **Rättat i SQL:** Inskickat programs utbildningsuppgifter och delade skollänkar kunde annars ändras via andra RPC:er. Extra guards täcker dessa vägar.
3. **Rättat i SQL:** Revisionskonflikt jämförs före tillgänglig action så samtidiga beslut ger 409 i stället för missvisande 403.
4. **Rättat i SQL:** Ofärdiga planer hade kunnat försvinna ur rektorns Att göra när blockerande analys förekom. Prepare/revise prioriteras när rollen faktiskt kan bearbeta planen. HM får review för inskickat underlag och för direkt beslutsklart programutkast.
5. **Rättat i SQL:** Hela timradens summa måste vara positiv även om alla aktiva fält markerats med explicit noll, i paritet med serverkontrollen.
6. **Rättat i aktuell UI-källa, behöver regressionsprov:** Ett lyckat idempotent kvittoreplay återger originalresultatet. Panelens återläsning använder nu en separat `completed`-räknare och läser aktuell beslutsstatus efter varje lyckat kommando/replay, även när programplanrevisionen är oförändrad.
7. **Root rapporterar rättat, behöver regressionsprov:** `programplan_submitted` behöver 409 och begriplig låsning; det ska inte behandlas som förlorad session. Editorlås finns nu i aktuell integration.

## Kvarstående verifiering och omfattning

- SQL-rollbackharness, riktiga Worker-/audit-/mandat-/replayprov, dator/telefon, byggning och faktisk lokal leverans är ännu inte verifierade genom denna granskning. Körningarnas resultat ägs av respektive verifieringsrapport.
- En separat fokuserad `supabase/tests/phase5_plan_decision_contract.test.sql` prövar innehållsidentitet, privata ACL och inskickningsguards. Filen är ännu inte körd när denna granskning skrivs; den ersätter inte positiva beslutscykler.
- Fulla programregler och timkontroll är uttryckligen avgränsade till verifierad Gy25-profil för högskoleförberedande program. Yrkesprogram/okänd profil nekas fastställande. Det är en verklig funktionsbegränsning som måste synas i slutredovisningen, inte ommärkas till färdig kedja för alla gymnasieprogram.
- Inbox räknar alla behöriga öppna planer före gränsen 500. Mät körningstid på relevant mängd; det interna detail-anropet bygger katalog/analys för varje rad. Bra funktion vid liten syntetisk mängd är inget skalbarhetsbevis.
- Mänsklig begriplighetsbedömning, faktisk extern kommunanslutning och full fas-/pilotacceptans är andra bevis än dessa källkontroller.
