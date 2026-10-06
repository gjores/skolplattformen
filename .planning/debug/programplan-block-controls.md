---
status: resolved
created: 2026-10-06
requirement: ADMIN-02
scope: local-synthetic-only
---

# Blockramar utan blockhantering i programplanen

Användaren fann 2026-10-06 att valbara block fortfarande syntes. Efter förtydligande väljer användaren uttryckligen: **”Behåll blockramarna, ta bort blockhanteringen.”** Det ersätter den tidigare placeringen av blockeditorn, utan att beställa borttagning av poängramar eller lagrade block.

Före rättningen visade koden `ChoiceBlockEditor` i Programfördjupning och Individuellt val. Rättningen tog bort editorn, knapparna och klientens blockskrivning. Blockrader, terminsfördelning, fasta nivåval, analyser, versioner och övergång till timutkast består. Ingen migration eller ändring av verksamhetsrader ingår; den skyddade API-grunden bevaras för senare kontrollerat organisationsarbete.

B02 ersätter sitt historiska skapa/dela-block-flöde med ett riktigt Worker-prov för tidigare sparade ramar, frånvaro av blockhantering och fortsatt 2 500-poängsfördelning/sparning/omladdning. Block- och ramflöden samt källretur till timplan prövas på dator och telefon. Handboken beskriver den nya avgränsningen. Resultat och lokal serverleverans dokumenteras efter faktiska prov; fulla ADMIN-02 och fas 5 förblir öppna.

Första blockomgången passerade 6/6. Första ramomgången passerade fyra datorfall men F05 väntade på den nu borttagna knappen ”Dela i block”; fem återstående fall kördes inte. Första rårapporten och felbilden bevaras. F05 ändras till att bevisa frånvaron av blockhantering och pröva samma kvarvarande 409-skydd genom ett direkt anrop till verklig Worker; plan, historik, utbud och paket ska fortfarande vara helradsidentiska. Det är en anpassning till användarens ändrade beteendekrav, inte ett produktfel som döljs eller ett borttaget serverskydd.

## Leverans och verifiering 2026-10-06

Rättningen är genomförd i `f211005`; testanpassningen i `a7c78e1` ändrar inga produktkällor. Blockbrowser B01–B03 6/6 på f211005, ram F01–F05 10/10 och timövergång T01/T03 4/4 på a7c78e1 passerar med verklig Worker/PostgreSQL, Chromium/dator och WebKit/telefon. Slutomgångarnas 20 fall har inga retries, skips eller fel; alla egna verksamhetsrader städade. Första ramomgångens FAIL och fem cleanupbilagor består som historik. Sex bilder granskade för sparade ramar, kopiering och timversioner. Typkontroll, lint, skyddat bygge, handbok och diff-kontroll PASS.

Vanlig 3012 kör exakt det prövade a7c78e1-bygget: 174 artefaktfiler byteidentiska, privata miljöfiler undantagna och äldre klientfiler behållna. Färsk baslinje före rättningen och kontroll efter alla browserfall/serverbyte visar samma hela rader i 14 verksamhetstabeller samt 18 scenarier och 44 auditpar per läsomgång. Ingen reset, migration eller ändring av befintliga verksamhetsuppgifter. Nya råbevis/loggar/bilder finns lokalt i `work/pilot/targets/protected/runtime/block-controls-evidence/`; minimerade versionshanterade rapporter heter `work/pilot/results/phase5-programplan-block-controls-*.json` och binder råbevisens hash till käll-/byggrevision.

Detta avslutar endast den avgränsade rättningen. Full 05-23/E, ADMIN-02/03/04 och mänsklig begriplighetsbedömning är fortsatt öppna; separat skolutbud/elevval/blockorganisation/bemanning är inte levererade. Tidigare audit-FAIL och 05-22 metadata PARTIAL ändras inte.
