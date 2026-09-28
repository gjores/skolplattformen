---
phase: 04
wave: 3
status: complete
full_sql_status: fail
completed_plans: [04-03]
next_plans: [04-04, 04-11]
---

# Fas 4 — våg 3

Plan 04-03 flyttar syntetiska provrelationer till det beständiga registret och inför huvudmannens uttryckliga skyddsbehörighet per administratörsuppdrag och skola.

## Genomförande

- Elev-/grupp-ID:n och mandat bevaras; elevens placering får egen stabil identitet. Ärendets skola förblir eget historiskt scope vid elevflytt och kan inte kopplas över kund-/huvudmannagränsen.
- Äldre Worker-läsning genom `phase3_read_pupils` samt direkt tabellåtkomst är stängda. Gamla syntetiska urvals-/scopefunktioner återstår att porta i 04-14/04-17. Den gamla elevprovsvyn kan därför inte användas för elevläsning under övergången.
- Skyddsbehörighet kräver både giltigt administratörsuppdrag och giltigt huvudmannauppdrag inom samma organisation och skola. Återkallelse och brutna kedjor prövas på nytt vid varje skyddat anrop. Huvudmannen får ingen elevinsyn av sin tilldelningsrätt.
- Nya SQL-entrypoints är fortsatt stängda för Worker tills 04-11:s API med MFA och obligatorisk loggning är implementerat och prövat. Ingen loggad API-tilldelning eller användarvy påstås färdig i denna våg.

## Verifiering

- Samlad modell-/serversvit: 350/350 PASS (`node --test lib/*.test.mjs lib/server/*.test.mjs`).
- Register/migrering: 100/100 PASS; skyddsbehörighet: 69/69 PASS; periodregression: 43/43 PASS. Samtliga mot målskyddad lokal databas. Testkörarens fyra snabbprov PASS.
- Full SQL-svit: **FAIL**, 13 filer. Alla 363 exekverade assertioner passerar, men sex äldre fas 3-fixturer stoppar innan någon assertion körs: `phase3_boundaries`, `phase3_connections`, `phase3_matrix`, `phase3_policy`, `phase3_temporal` på rad 16 samt `phase3_mandates` på rad 17. De skapar äldre ärenderelationer utan registerelev och nekas med `Case school scope denied`. Dessa är inte godkända eller överhoppade prov. Portningen ägs av 04-14/04-15; full fasgrind förblir röd.
- Fullkörningens gröna filer är `phase1_isolation`, `phase2_access`, `phase2_audit`, `phase3_audit` och de tre aktuella fas 4-filerna. Minimerade resultat finns lokalt i `work/pilot/results/phase4-wave3-full-sql.json`.
- Ingen appkod eller användarvy ändras i vågen. Nytt appbygge och visuellt användarprov är därför inte denna vågs bevis.

## Avvikelser och nästa steg

Före/efter-provet kör den faktiska migrationskällan inne i en återställd testtransaktion. Testköraren behövde hantera att Supabase endast monterar själva testfilen i testcontainern; en avgränsad säker expansion av migrationsreferensen och explicit sökväg till kopierad testfil infördes. Ett äldre periodprovs negativa UPDATE-fall avgränsades också till sin egen provkund, så migrerade bakgrundsrader inte orsakar ett annat fel före avsedd relationskontroll. Förväntade SQL-felkoder är oförändrade. Ingen databasreset och inga tillämpade migrationer ändras.

04-11 har preciserats med en separat framtida Worker-GRANT-migration. Endast tre publika behörighetsentrypoints ska öppnas när den auditerade vägen finns, aldrig tabeller eller interna hjälpfunktioner. Samordna detta med 04-04:s provägarskap i samma våg.

Nästa steg är våg 4: behörighetsstyrt elevurval och fältvisning (04-04), samt huvudmannens API och dialog för skyddsbehörighet (04-11). Våg 1–3 ska inte göras om efter godkänd delverifiering. Full fasgrind och separat fasverifiering återstår; lokala syntetiska prov godkänner inte verklig anslutning eller drift.
