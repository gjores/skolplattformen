---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-03
status: implemented_ui_verification_passed
completed: 2026-10-17
---

# Skola HT/VT och APL per årskurs

Den nya tabellen samlar skoltid per termin och APL per årskurs, med total och APL-andel. Rader sparas när användaren lämnar raden eller trycker Enter. Hela timmar och timmar:minuter bevaras exakt; tomt och noll har olika betydelse. Telefon visar en årskurs i taget med sidledsrullning för breda tabeller.

Årsram kan sparas utan perioder. APL-panelen ligger efter timtabellen och visar årsram, förlagt och kvar att förlägga. Perioder läggs in genom Förlägg APL i perioder. Autofördelning reserverar års-APL och fördelar endast återstående skoltimmar. Högskoleförberedande planer saknar APL-panel och APL-kolumner.

Äldre planer har en uttrycklig helplansgranskning före byte. Totalen måste bevaras. Ej tidigare registrerad APL behöver granskas; systemet påstår inte att föreslagna nollor bevisar frånvaro av APL. Låsta planer kräver ny version.

## Verifiering

- Ny tabell: **24/24** simulerade dator-/telefonprov PASS, inga automatiska omprov. Budget, minutrest/null/noll, årsbyte, saknat mandat, CAS, MFA, osäkert svar/reload, HTTP500 efter accepterad skrivning, övergång/cancel, ändrat underlag vid samma revision, kopieringsgranskning och autofördelning.
- En beständig begärandebunden journal sparas före skrivning. Den tas inte bort på osäkert 5xx-svar eller äldre återläsning. Ändrat övergångsunderlag kräver ny granskning.
- Befintlig autofördelning **24/24 PASS**. Befintlig APL-svit **59/60**, återstående telefonfall **1/1 PASS** i separat körning. Det första felet var timeout vid sidladdning; ett avbrutet fokuserat försök stannade vid sessionsstart. Inga tidsgränser eller assertions försvagades. Alla råa felrapporter bevaras.
- Samordnad Node **161/161**, typkontroll, full produktlint och handboksbygge PASS. Senaste övergångsändringen följs dessutom av typ/lint inför kandidatbygget.
- Root granskade ny tabell på dator och telefon samt övergångs- och fördelningsdialog på telefon. Skolfält, års-APL, sparstatus och summering är läsbara; breda tabeller rullas inom sin behållare. Den fristående fixturens två testknappar ingår inte i produktvyn.

Privata bevis: `/private/tmp/annual-time-ui-final4.log`, `/private/tmp/annual-time-ui.json`, `/private/tmp/annual-time-ui/`, `/private/tmp/apl-annual-distribution-ui-final-03.log`, `/private/tmp/apl-annual-apl-regression-final-02.log`, `/private/tmp/apl-annual-apl-regression-focused-02.log`, `/private/tmp/apl-annual-node-final.log`, `/private/tmp/apl-annual-docs.log`. Tidigare misslyckade annual-körningar är bevarade separat; slutlig24 är det aktuella resultatet.

## Begränsning och nästa steg

Detta är komponent-/domänprov med syntetisk transport, inte faktisk OIDC/Worker eller lokal leverans. ANNUAL-04 prövar och installerar exakt byggd kandidat. Mänsklig begriplighet, faktisk APL-närvaro och extern SS12000-anslutning är separata och inte godkända genom dessa prov. Handboken beskriver timmar först, perioder senare och fortsatt granskning inför beslut.

## Slutlig paketstatus 2026-10-17

Faktisk SQL48, Worker/OIDC14 på dator och telefon samt lokal installation och exakt kandidatöverföring har nu passerat. Se [ANNUAL-04](05-APL-ANNUAL-04-SUMMARY.md) och [samlad verifiering](05-APL-ANNUAL-VERIFICATION.md). Tidigare återstående steg ovan beskriver delplanens ursprungliga avgränsning; mänsklig begriplighet väntar fortsatt.
