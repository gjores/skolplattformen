# Kvarstående luckor efter granskning av beslutskedjan

2026-10-12. **Källgranskning, inte beteendegodkännande.** Omfattar programplan → skolans timplansutkast → insändning/återsändning/fastställande → ny version/ny elevkull → klasskoppling, samt huvudman/rektor/skoladministratör och uppdragets gemensamma inkorg. SQL- och Worker-verifiering pågår separat. Ingen fysisk mobil, verklig kommunanslutning eller pilotacceptans är verifierad här.

## Rättat inom leveransen

Återsänd timplan med ändrat programunderlag kan nu ersättas av ett nytt utkast. Spärren för inskickat förslag består. Riktade UI-prov på dator och telefon passerar för korrekt föregångare och källversion. Hela beslutskedjan prövas separat i SQL/Worker.

## Nästa avgränsade förbättringar

| Prioritet | Verklig begränsning eller UX-glapp | Förslag och bevarandekrav |
| --- | --- | --- |
| P2 | Skyddad app saknar skapande av klass och explicit klass–timplanskoppling. `timplan-classes.tsx` används i äldre `organisation-workspace.tsx`; handbokens `programplaner.md` beskriver begränsningen. En fastställd plan innebär därför inte att hela klassens operativa övergång kan slutföras i skyddad app. | Separat skyddat flöde efter fastställande: välj klass, läsår och relevant årskolumn. Visa befintliga kopplingar och versionsval. Kräv mandat, revisionskontroll och audit. Bevara tidigare länkar; flytta aldrig klasser automatiskt när en ny version fastställs. |
| P2 | Beslut är avgränsat till verifierad högskoleförberedande Gy25-profil. Yrkesprogram och okända profiler blockeras; GR/IM har inte motsvarande beslutskedja. Automatiska poäng-/timkontroller ersätter inte manuell granskning av möjliga elevval eller lärarledd tid. | Visa omfattningen redan vid utbildningsval. Nästa regelprofil ska få eget verifierat källunderlag, tydliga villkor och regressionsfall. Beskriv inte nuvarande kedja som stöd för alla gymnasieprogram. Koppling till individuella studieplaner och genomförd undervisning är separat arbete. |
| P2 | Inkorgen räknar alla planer men skickar bara de första 500, sorterade program före timplan och därefter utbildningsnamn. En handlingsbar uppgift kan saknas i urvalet även när räknaren visar den. Hänvisningen till ordinarie listor är inte ett motsvarande uppdragsövergripande sökflöde. | Inför sidindelning/sökning för uppdragets alla läsår, prioritera egna beslut och återsända planer och behåll exakta plan-/skollänkar. Mät frågekostnaden med relevant mängd: SQL bygger komplett underlag för varje kandidat före gränsen. Ingen faktisk prestandabrist är uppmätt här. |
| P2 | Programlistans statusfilter bygger fortfarande på `utkast/faststalld/ersatt` och kan inte välja enbart inskickade eller återsända program, trots att radens beslutsstatus nu visas. | Lägg till separat filter för beslutsskede, från serverns uppdragskontrollerade granskningsdata. Behåll skillnaden mellan planversionens status och beslutsärendets steg. |
| P2 | Efter fastställande står det att ändringar kräver ny version, men timplanens nya utkast nås via tillbaka till **Skolans timplaner**. Vid rent ändrad beslutsstatus kan `sourceChanged` dessutom visa **Välj nytt underlag** trots oförändrat innehåll. | Visa en tydlig rollstyrd **Skapa ny version**-väg och vilka klasskopplingar som stannar på föregående version. Skilj serververifierat innehållsbyte från enbart uppdaterad beslutsstatus, så användaren inte uppmuntras att skapa en onödig kopia. |
| P3 | Programplanen låses när elevkullen börjat enligt redan beslutad livscykel. Huvudmannen kan kopiera till ny utbildning/elevkull, medan rektor och skoladministratör saknar den åtgärden. Låstexten förklarar främst vad som inte går att göra. | Beskriv nästa tillåtna steg och ansvarig roll intill spärren, exempelvis att huvudmannen kan förbereda nästa kull. Behåll startlåset och uttrycklig kopiering; öppna inte pågående programplaner som en UX-genväg. |

## Redan rättade fynd ska inte återöppnas som gap

- Beslutspanelen läser nu aktuellt underlag efter varje lyckat kommando, även idempotent replay med oförändrad programrevision (`completed` i `plan-decision-panel.tsx`).
- Root har rättat de äldre motsägande handbokstexterna om att godkännande saknas; skolformernas olika omfattning ska hållas tydlig.
- Uppdragets inkorg räknar ofärdiga utkast/återsända planer som arbete för behörig rektor, och huvudmannens tillåtna direktfastställande av beslutsklart programutkast som beslut.
- Programgodkännandets rena status-/revisionsändring skiljs i SQL från faktiskt ändrat timplansunderlag. Befintliga klasslänkar flyttas inte vid fastställande.

Källmässiga rättningar ovan behöver fortfarande stöd av de separata faktiska verifieringsresultaten innan leveransen kan kallas klar.
