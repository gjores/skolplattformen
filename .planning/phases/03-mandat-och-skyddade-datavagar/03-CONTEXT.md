# Fas 3: Mandat och skyddade datavägar — diskussionsunderlag

Status: Fasdiskussion avslutad. Redo för planering med nedanstående öppna preciseringar. Detta är inte en färdig genomförandeplan.

## Omfattning

Fasens godkända krav är ACL-02–05 och AUDIT-02–03. Behörighetsgränser provas med syntetiska uppgifter. Elevhälsans rollmodell och åtkomstgränser ingår; detta innebär inte beslut om ett komplett elevhälsoärendesystem.

## Beslut

- Användaren godkände grundfördelningen: lärare ser egna undervisnings-/mentorsgrupper; skoladministratörer arbetar inom tilldelade skolor; huvudmannen ser organisationsöversikt och behöver separat uppdrag för elevinsyn.
- Tidigare användarbeslut kvarstår: huvudmannen utser rektor; rektor tilldelar läraruppdrag inom aktuella skolenheter och giltighetstider.
- Användaren påpekade att elevhälsan saknades i rollförslaget och godkände att dess åtkomst kan avgränsas både till hela skolenheter och särskilt tilldelade elever/ärenden, beroende på uppdrag.
- Skolomfattning och elev-/ärendetilldelning måste vara uttryckliga delar av uppdraget. Medlemskap i ett elevhälsoteam ger inte automatiskt tillgång till alla uppgifter.
- Användaren godkände ansvarsfördelningen: rektor tilldelar elevhälsans uppdrag inom sin skola; en särskilt utsedd elevhälsoansvarig kan tilldela uppdrag över flera skolor. Ingen får utöka sin egen behörighet.
- Användaren godkände IT-/supportmodellen: IT hanterar anslutningar utan elevinsyn. Supportåtkomst till elevuppgifter kräver ett separat, tidsbegränsat uppdrag för angiven skola och tydligt syfte, godkänt av rektor inom dennes skola. Åtkomsten loggas och upphör automatiskt.
- Användaren godkände loggpolicyn: elevläsningar, ändringar, exporter, behörighetsändringar och nekade åtkomstförsök registreras med aktör, faktiskt uppdrag, tid, objekt och resultat. Elevuppgifter och anteckningarnas innehåll kopieras inte till loggen. Om obligatorisk loggning inte fungerar stoppas den skyddade åtgärden med tydligt felmeddelande. Lagringstiden är konfigurerbar; verklig drift kräver kundens beslut.
- Medicinska elevhälsojournaler ligger fortsatt utanför milstolpen enligt PROJECT.md.

## Förslag att precisera

- Separata uppdrag för specialpedagog, speciallärare, kurator, psykolog, skolsköterska och skolläkare. Exakta åtgärder och fält per profession är ännu inte beslutade.

## Öppna beslut

- Vem utser elevhälsoansvarig och vilka skolor omfattar dennes mandat? Eventuell separat delegering av elev-/ärendetilldelning behöver preciseras vid planering.
- Åtgärder och informationsfält per uppdrag, inklusive skillnader mellan elevhälsans professioner.
- Exakta tillåtna åtgärder och tidsgränser för supportuppdrag behöver preciseras vid planering.
- Konkret lagringstid för den syntetiska provmiljön behöver väljas och dokumenteras i planeringen; kundens lagringstid i verklig drift förblir ett öppet kundbeslut.

## Arbetsram

Användaren har begränsat fasdiskussionen till högst ytterligare 3 procentenheter av veckokvoten. Mätaren visade 3 procent använt vid diskussionens start. Håll diskussionen kort; ingen exakt hård kvotgräns kan ställas in här.
