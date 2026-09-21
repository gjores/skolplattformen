# Fas 3 — preliminär plangranskning

Status: Ändringar krävs. Sju planutkast finns; de är inte redo för execute-phase.

Planerna täcker samtliga sex faskrav och användarens beslut om elevhälsa, support och loggning. Följande behöver färdigställas före genomförande:

1. 03-03: konkretisera nya roller i `web/lib/server/db.ts`, `web/app/api/session/route.ts`, `web/app/api/context/route.ts` och inbjudningsinlösen; komplettera filomfattning och tester. Ange faktisk koppling mellan access_assignments och verksamhetens rektors-/läraruppdrag.
2. 03-06/07: rätta verifieringsberoendet. Full browsergrind kan inte krävas i 03-06 innan 03-07 har skapat testerna. Lägg browserproven före slutgrinden eller begränsa 03-06 till testad sammanställare och kräv full körning först i 03-07. Ange Playwright-konfiguration som faktiskt upptäcker de nya testerna.
3. 03-02/04/06: ersätt generiska verifieringsanvisningar och --help med kontrollerade runnerargument och konkreta namngivna acceptansfall. Bestäm datakontrakt/tabeller och faktisk källa/insamling för nekade direktvägsanrop; ett möjligt blockerande beroende får inte räknas som löst design.
4. ACL-05: konkretisera vilken lokal anslutningsadministration IT kan utföra; enbart statusläsning räcker inte som bevis för administration. Behåll gränsen mot verklig kommunanslutning.
5. Kontrollera must_haves.key_links mot faktiska anropskedjor och ge artefakterna specifika leveransbeskrivningar. Kontrollera UI-kontrakt mot befintlig design och checkpointens struktur.

Föreslagna synthetic-v1-värden är inte användarbeslut eller kundens driftpolicy. Ingen produktkod ändrad och inga genomförandeprov körda under denna planering.

Arbetet pausades av användarens kvotgräns: veckomätare 3 % vid diskussionens start, 7 % vid paus; totalt högst fem procentenheter är tillåtet. Återuppta med riktad plangranskning, inte genomförande.
