# Uppskjutna fynd — fas 1

Fynd utanför en plans omfattning som noterats under genomförandet. Inget här är åtgärdat.

| Upptäckt i | Fynd | Föreslagen hantering |
|------------|------|----------------------|
| 01-07, Task 1 | Sidomenyns märkesyta i `web/app/page.tsx` (`Navigation`) visar det hårdkodade skolnamnet **Testskolan** och personen **Alex Lind**, som inte kommer ur pilotfixturen (Exempelstads kommun, Björkhagens grundskola, Exempelstads gymnasium). Planen 01-07 räknar inte upp dessa texter, och de förbjuds inte av acceptanskriterierna. | Låt `Navigation` få huvudmannens namn och vald exempelskola som props från `ExampleHome` (fixturens `organisation.organizer.name` och `schoolLabel(unit)`), lämpligen i 01-08/01-09 när browserprovet ändå ser sidomenyn. |
