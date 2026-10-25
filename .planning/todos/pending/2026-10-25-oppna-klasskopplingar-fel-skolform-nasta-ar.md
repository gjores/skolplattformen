---
created: 2026-10-25
title: Öppna klasskopplingar leder fel för gymnasiet och nästa läsår är svårt att koppla
area: tjanstefordelning
status: pending
phase: "05.1"
source: användarprov etapp 2 (3012, kandidat 1eb5467)
---

# Användarrapporterat problem

Användaren lyckades inte tjänstefördela en klass ett år längre fram. Tjänstefördelningen för läsåret 28/29 på Syntetisk skola 11 (filter BYGG27) visar *Inga klasser med timplan. Ingen klass på skolan har en timplan för läsåret 28/29. Koppla klasserna till timplaner först.* med knappen **Öppna klasskopplingar**.

# Iakttaget (läsande kontroll 2026-10-25)

- I databasen har skolans gymnasieklasser (start 2027) bara kopplingar för 2027/28 (`ar1`). BYGG27 kopplades under provet, men för 2027/28. Det finns inga kopplingar för 2028/29.
- `goToClassLinks` i `web/app/protected-home.tsx` sätter alltid `schoolform: 'grundskola'`. Från tjänstefördelningen hamnar man därför i grundskolans timplaner, även när klasserna hör till gymnasiet, och inte i den aktuella gymnasietimplanens *Klasser och läsår*.
- Själva kopplingen för årskurs 2 finns: Timplaner › gymnasietimplanen › *Klasser och läsår* › **Läsår för klassens timplan** = 2028/29 (handbok *Timplaner › Koppla en eller flera klasser till ett läsår*). Vägen dit är dock otydlig, och valet av läsår är lätt att missa.

# Att åtgärda

- **Öppna klasskopplingar** ska leda till rätt skolform, och helst direkt till respektive klass timplan och *Klasser och läsår* med läsåret 28/29 förvalt. Det kan också vara en lista över skolans okopplade klasser för läsåret, med väg per timplan.
- Överväg ett tydligt flöde för att föra klasser vidare till nästa årskurs med samma timplan (uttrycklig granskning, ingen automatisk koppling).
- Tomt läge i tjänstefördelningen: förklara att gymnasieklasser behöver en koppling per läsår (årskurs 2 och 3), inte bara vid start.
- Bevara explicita klass–timplanskopplingar och kopiering till nästa elevkull. Handbok (*Tjänstefördelning › Öppna fördelningen*, *Timplaner*). Pröva på dator och telefon.

Registrerad som backlogg enligt användarens önskemål. Ingen ändring är gjord.
