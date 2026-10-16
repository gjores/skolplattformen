---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-01
status: implemented_isolated_verification_passed
completed: 2026-10-17
---

# Skolminuter och års-APL med bevarad historik

Två additiva migrationer inför tre tabeller för uttrycklig tidsmodell, minutceller och oföränderliga kommandokvitton. Äldre terminstimmar och frysta svar ligger kvar. Befintliga planer byter endast genom en uttrycklig helplansgranskning. Nya tomma yrkestimplaner får skoltid per termin och APL per årskurs; högskoleförberedande planer får ingen ny APL-funktion.

SQL och TypeScript använder heltalsminuter, skilda null/noll och fryst ämnesaktivitet. Perioder använder årsramen utan att öka timplanens total. Gemensamt planlås, revisionskontroll, uppdragskontroll, obligatorisk audit och begärandebundna kvitton skyddar skrivning. Kopior bevarar tidsmodell och synlig proveniens för bortfall; bekräftelse följer inte med.

## Verifiering

Slutligt isolerat PostgreSQL-prov: **44/44 PASS**, tre observerade samtidighetsfall, 75 oförändrade källhashar och full cleanup. Privat rapport `/private/tmp/timplan-time-v2-sql-14.json`. Endast schema kopierades, därefter egna syntetiska fixturer. Ingen aktiv installation ingår i detta resultat.

- Installation och rollback bevarar 74 tidigare tabeller, gamla kvitton och rättigheter; inga gamla planer fylls på automatiskt.
- 80 timmar minus 30 minuters registrerad APL blir 79:30 skoltid och 0:30 års-APL. Äldre kvitto återspelas exakt efter övergången.
- Årsram sparas utan perioder; senare förläggning ändrar inte totalen. Årsram kan inte sänkas under förlagd tid.
- Gamla radvägen och direktskrivning nekas för den nya modellen; fel skola, återkallad session och huvudman utan rektorsmandat nekas.
- Auditfel och fel mitt i flera rader återställer hela transaktionen, revision och kvitto.
- Rektors bekräftelse, inlämning och huvudmannens godkännande passerar för komplett syntetiskt 15-veckorsunderlag. En minuts ändring gör tidigare bekräftelse inaktuell. Årsbudget ensam räcker inte och låst plan kan inte ändras.
- SQL/TypeScript-paritet, kopieringsbortfall med granskning och minutbaserade årsöversikter passerar.
- Samtidig övergång samt båda riktningarna årsrad mot periodskrivning visar verklig låsväntan: en commit, en nekad gammal revision.

Tidigare utvecklingsfel och deras cleanup bevaras i privata rapporter 01–13; de anges inte som slutligt godkända prov. Samordnad Node-kontroll ger 161/161 PASS. Faktisk HTTP/OIDC/browser och aktiv installation verifieras separat i ANNUAL-04.

## SS 12000

Skolminuter och årsramar är intern planering, inte genomförd undervisning, CalendarEvent, Placement eller närvaro. Befintliga identiteter, klasser, medlemskap, giltigheter och informationsansvar ändras inte. Dessa prov innebär ingen verifierad extern standardanslutning.
