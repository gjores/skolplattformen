# Fas 3 — upptäckta frågor utanför respektive plans omfattning

## Från 03-06 (2026-09-26)

1. **Felkod för support före starttid.** Ett supportuppdrag vars `starts_at` ligger senare samma dag nekas korrekt (403, inget innehåll, nekandet loggas), men koden blir `assignment_expired` i stället för `assignment_upcoming`. `invalidAssignmentCode` i `web/lib/access-rules.ts` jämför bara `validFrom` (datum), inte `starts_at` (tid). Behörigheten är rätt; det är meddelandet till användaren som är missvisande. Påverkar 03-07:s användarprov om support prövas före start. Bevis: `phase3-api.json`, fallet `support-boundary`, kontrollen "före start".
2. **Den byggda previewn på port 3000 stannade** under en access-regression kort efter källavbrottsprovet (Postgres, Kong och Storage startades om). Processen fanns inte kvar, och ingen logg fanns. Den startades om med samma bygge och regressionen gav då 16/16 PASS. Orsaken är okänd: antingen en krasch i workerd efter databasomstarten eller att processen avslutades tillsammans med sessionen som startade den. Bör följas upp om det upprepas.
