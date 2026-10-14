---
created: 2026-10-14
title: Utred saknade identitetsankare i äldre syntetiska säkerhetsloggar
area: audit
status: pending
requirements: [AUDIT-01, AUDIT-03]
---

# Inventerat fynd

Läsande SQL-inventering av isolerad lokal protected-databas fann 1 827 säkerhetshändelser vars actor_identity_id saknar motsvarande identitetsrad. Händelsedatumen ligger mellan 2026-09-30 och 2026-10-05. Detta upptäcktes vid kopieringsrättningens faktiska API-slutkontroll 2026-10-14; inga gamla logg- eller identitetsrader ändrades av det provet. Inga aktörsnamn, ID-listor eller personuppgifter förs in här.

Det fjärde API-provet har bevarad FAIL för antagandet att globalt antal redan var noll. Den nya avgränsade slutgrinden måste i stället inventera och bevara alla äldre rader och deras uppmätta avvikelse samt kräva noll nya saknade ankare. Det godkänner inte den historiska luckan.

# Avgränsad uppföljning

- Identifiera från privata lokala bevis om äldre fixtur-/cleanupverktyg tappade ankare eller om raderna är från en annan avsiktligt isolerad provväg. Återkör inte gamla skrivprov för att utreda historik.
- Kontrollera om nuvarande relevanta cleanupvägar bevarar varje identitet som hänvisas till av behållna audithändelser, inklusive nekade anrop.
- Redovisa ursprung och konsekvens för verifieringsunderlag före samlad pilotacceptans. Reparera endast med styrkt källa om sådan finns; skapa inga gissade historiska identiteter eller tidsstämplar.

Historiska användar-/fasgodkännanden och första körresultat skrivs inte om. Verklig kommunanslutning eller verkliga elevuppgifter ingår inte i inventeringen.
