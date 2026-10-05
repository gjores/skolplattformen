# Uppskjutna fynd utanför planernas omfattning

## Från 05-20 (2026-10-05)

- **phase2_audit.test.sql fall 13** ("händelse utan serverkontext nekas") fallerar: triggern på `organisation_events` svarar `History denied`, provet väntar sig ett meddelande med "serverkontext". Triggermeddelandet byttes i 05-15 (`575ac93`, `phase5_programplan_organisation_actor`); 05-20 behåller samma gren oförändrad. Nekandet sker fortfarande, bara meddelandet skiljer. Hela SQL-sviten hade inte körts sedan fas 4, så felet syntes inte tidigare. Åtgärd: ny migration som återställer ett meddelande med "serverkontext", eller ett beslut om att uppdatera provet.
- **Skolenheter och Workerns skrivrätt.** 05-20 stänger borttagning av skolenheter för alla roller, men Workern behåller insert/update på `school_units`, eftersom kundadminens skolimport (`import_school_unit`, security invoker, fas 2) kräver det. Att stänga även detta kräver att importen görs till ett stängt SQL-kommando.
