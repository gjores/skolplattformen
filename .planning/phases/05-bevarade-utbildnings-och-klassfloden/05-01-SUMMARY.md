---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "01"
status: completed
completed: 2026-09-29
requirements: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04]
---

# 05-01 — kodförankrad genomförandegrund

Två uppgifter genomförda: verksamhets-/mandatkontrakt i `05-CONTRACT.md` och krav→prov i `05-VALIDATION.md`. Nuvarande roller och beslutssteg kontrollerade mot organisation-, timplan- och läsårsmodellerna samt kullkopieringens SQL. Tvetydiga klassnamn får inte gissas till beständiga klass-ID:n. Föreslagna provfiler är uttryckligen framtida, inga skyddade rutter eller vyer har öppnats.

## Faktiska kontroller

Startrevision `80a6e1c`, oförändrad appkod. Modellprov för kull, organisation och timplan PASS30/30. Sparordningsreproduceraren FAIL2/2 med äldre100 över nyare200 och FK-fel vid följdändring efter skapande. Se `05-CURRENT-EVIDENCE.md`. Dokumenten korslästa mot källorna och `docs/pilot/baseline.md`: ansvarsfördelning, kopiering utan elever/klasser/beslut, versionsbunden klasskoppling samt stopgrind bevarade. Dokumentändring kräver ingen appbyggnad; inga nya API-/SQL-/browserprov körda.

## Kravkedja och fortsättning

ADMIN-01–04 har varsin rad med användarbeteende, negativa fall, rollback och nödvändigt SQL/API/browser-/handboksbevis. Kraven är fortsatt Pending; denna förberedelse är inte implementation eller slutverifiering. Nästa steg är avgränsade genomförandeplaner för skyddade kommandon, atomär lagring och sparordning före UI-öppnande.

Fas 4:s användarprov är partiellt, datum-/UI-anmärkningen kvarstår och separat fasverifiering saknas. Användarens instruktion att fortsätta nästa fas tillåter förberedelsen, inte att kvarstående prov markeras utförda. Bred UI-genomgång och SPAR/Skatteverkssynk ligger kvar som separata todos. Ingen verklig kommunanslutning eller drift verifierad.
