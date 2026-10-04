# 05-20 — Programplanens livscykel och skolkoppling

Användarbeställning och beslut 2026-10-04.

## Beställning

Huvudmannen ska kunna ta bort och redigera programplaner som ännu inte är aktuella för elever, och annars bara arkivera dem. Huvudmannen ska också kunna välja vilka skolor som har programplanen.

## Beslut (användarens val 2026-10-04)

- **D-01 Livscykel:** Framtida plan (elevkullen har inte börjat) kan redigeras och tas bort. Pågående och avslutad plan kan inte redigeras eller tas bort, bara arkiveras.
- **D-02 Datum:** Status räknas från kullens startår: före utbildningsstart = framtida; från start till tre läsår senare = pågående; därefter = avslutad. Exakt startdag (läsårsstart) hämtas från befintligt start-/terminsunderlag; saknas startår ska planen behandlas som framtida endast om ingen version är fastställd, annars som skyddad (aldrig gissad).
- **D-03 Skolor:** En programplan med samma versioner och innehåll kopplas till de skolor huvudmannen väljer. Ändring syns på alla valda skolor. Kräver att planen kan höra till flera skolenheter inom samma huvudman.

## Gränser

- Statusregeln avgörs och kontrolleras på servern/i SQL, inte bara i klienten. Direkta anrop som redigerar/tar bort pågående eller avslutad plan nekas.
- Borttagning gäller bara framtida plan och bevarar audit. Arkivering bevarar versioner, beslut och historik; arkiverad plan döljs som standard i listan men kan visas.
- Skolval begränsas till huvudmannens egna skolenheter. Borttagning av en skola från en pågående plan behandlas som skyddad ändring och nekas.
- Befintlig versions-/fastställandemodell, kopiering till nästa elevkull, klass–timplanskopplingar och mandatkontroller bevaras. Delegation till skolor är en separat todo.
- Handboken (`docs/handbok/programplaner.md`) uppdateras med verifierat beteende.

## Kompletterande beslut 2026-10-04 (efter plangranskning)

- **D-04 Pågående utan fastställd version:** D-01 gäller bokstavligt. Även en plan utan fastställd version låses vid kullens start; skapande med passerat startdatum nekas. Befintliga utkast i pågående planer blir skrivskyddade men tas inte bort.
- **D-05 Lägga till skola:** Huvudmannen får lägga till skola även i pågående/avslutad plan. Endast borttagning av skola nekas efter start.
- **D-06 Full skolkoppling:** En tillagd skola ska kunna koppla sina egna klasser, elevplaceringar och timplaner till planen. Byggs i egen plan efter skolvalet.
- **Uppdelning:** 05-20 = livscykel (D-01, D-02, D-04, inklusive stängda direkta tabellskrivningar till `offerings`). 05-21 = skolval (D-03, D-05). 05-22 = full skolkoppling för klasser/elever/timplaner (D-06).

## Beslut inför genomförande 2026-10-04

- **D-07:** 05-22 räcker som skolkoppling av befintliga datavägar; nya kommandon för att skapa klasser/timplaner och klass–timplanskoppling byggs inte nu.
- **D-08:** Inför 05-19:s mänskliga prov förbereds syntetiska provdata på vanlig 3012 med framtida kullstart, så att provet kan göras även efter 05-20:s lås. Inga verkliga elevuppgifter; befintliga provdata raderas inte.
