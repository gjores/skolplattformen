---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-05
status: ui-verified-simulated-api
completed: 2026-10-18
verification_scope: production-ui-with-synthetic-api
---

# Separat APL-process och enklare timplansyta

Timplanen visar skoltimmar HT/VT och års-APL i tabellen. Perioder, datum, veckor, arbetsmoment och APL-granskning ligger i APL-planering efter timplanen. Godkännandet av timtabellen skiljs från rektors bekräftelse av APL och huvudmannens separata granskning. Genomförd APL eller närvaro påstås inte vara verifierad.

Root har genomfört produktändringarna. Detta underlag redovisar avgränsad UI-verifiering: verklig React-arbetsyta, navigering, journal och kontraktsparsning med syntetiska API-svar. Det bevisar inte servermandat, SQL-låsning, OIDC eller leverans till port 3012. Dessa bevis samordnas i delplan 06.

## Genomförda beteenden

- Timplan och APL har skilda vyer med samma explicita plan-, skol-, utbildnings- och versionsidentitet. Header, sidomeny, Back, reload och tillbaka till timplan är provade.
- APL-väljaren använder full sidindelad timplanslista. Högskoleförberedande program syns med förklaring och kan inte öppnas för APL; ingen vilseledande klientfiltrering av serverns totalantal.
- Godkännande är infällt som standard. Blockerarsammanfattning och knappen Visa vad som saknas är synliga även när granskningen är stängd. Efter konflikt finns Uppdatera status kvar.
- Återstående års-APL hämtas först efter explicit årskurs och termin. Befintliga perioders timmar i samma år, andra terminer och andra år lämnas oförändrade. Upprepad hämtning dubblar inte timmarna. Perioden kan sparas utan datum.
- APL-spara, rektorsbekräftelse och huvudmannagranskning använder APL-revision plus den godkända timplansrevisionen. Mockens frysta timplan jämförs i sin helhet efter varje prov.
- Ändring efter granskning visar Behöver ny granskning och spärrar ny huvudmannagranskning utan aktuell rektorsbekräftelse. Tidigare granskning bevaras.
- Okänt sparsvar blockerar navigation och återhämtas efter reload med samma journalförda kommando och båda revisionsfälten.

## Verifiering

| Kontroll | Utfall | Bevis |
| --- | --- | --- |
| Ny processnavigation och kompakt beslut | 12 PASS, dator + telefon | ingår i ny svit nedan |
| Separat APL, årsram, roller och journal | 10 PASS, dator + telefon | ingår i ny svit nedan |
| Nya två Playwright-sviter | 22 PASS, inga retries, 35,7 s | `/private/tmp/planning-flow-combined-stable-captures.log`, `/private/tmp/planning-flow-ui.json` |
| Äldre beslutsunderlag och konflikt/okänt svar | 26 PASS, inga retries, 24,6 s | `/private/tmp/planning-flow-legacy-final-menu.log`, `/private/tmp/apl-decision-ui.json` |
| Riktad lint av fem test-/fixture-/configfiler | PASS | `npx oxlint e2e/planning-flow.spec.ts e2e/planning-apl-process.spec.ts e2e/fixtures/planning-flow-data.ts e2e/apl-decision.spec.ts playwright.planning-flow.config.ts` |
| Typkontroll | PASS (`npx tsc --noEmit`) | `/private/tmp/planning-flow-ui-tsc-final.log` |

Nya testfiler: `web/e2e/planning-flow.spec.ts`, `web/e2e/planning-apl-process.spec.ts`, `web/e2e/fixtures/planning-flow-data.ts` och `web/playwright.planning-flow.config.ts`. Äldre `web/e2e/apl-decision.spec.ts` har fått nya verksamhetsord och öppnar de nu infällda sektionerna; dess historik-, revision-, konflikt- och replaykontroller finns kvar.

Tolv nya bilder från slutkörningen är visuellt granskade. Sökvägar och SHA-256 finns i `/private/tmp/planning-flow-ui-image-review.json`. Fullsidebilder tas vid sidans topp; inga komponenter eller CSS döljs för bilden. Tidigare bilder vid postinteraktionsscroll fångade stickyhuvudet ovanpå målsektionen. Stabil omtagning visade ingen sådan överlagring.

## Fångade och rättade avvikelser

1. Blockerare doldes i stängd beslutssektion. Root lade till synlig sammanfattning och öppningsknapp. Nytt regressionsprov passerar.
2. Efter HTTP 409 saknades omläsningsknapp när beslutsunderlaget rensades. Root återställde Uppdatera status utanför den underlagsberoende sektionen. Äldre konfliktprov passerar.
3. Ändrad APL efter huvudmannagranskning visade ett för generellt sparbesked. Root införde Behöver ny granskning och tidigare granskningshistorik. Nytt stale-prov passerar.
4. Planens äldre ankarlänk till APL-editorn ersattes med menyanvisning eftersom editorn flyttat till egen destination. Den faktiska ingången provas i nya ProtectedHome-sviten; historikpanelen har ingen död ankarlänk.

Första misslyckade körningar och bevis finns kvar under `/private/tmp/planning-flow-ui-hidden-blocker-failure`, `/private/tmp/planning-flow-legacy-conflict-first-failure` och `/private/tmp/planning-apl-process-stale-first-failure`. En parallell tidigare körning stannade länge i laddning; orsaken är inte fastställd. Sekventiell slutkörning passerade utan svagare assertions eller retries.

## Begränsningar och återstående bevis

Telefonens gemensamma planeringshuvud är högt och kräver vertikal scroll innan arbetsytan. Timplanens tabell använder sidscroll och APL-väljaren scroll för fler rader. Inga påståenden görs om att allt ryms i första skärmbilden. Långa APL-formulär är fortfarande långa, men ligger i den senare processen.

SS 12000-bedömningen följer huvudplanen (SS 12000:2024 utgåva 4, OpenAPI 2.1.0). Testerna bevarar stabila plan-/skol-/utbildningsidentifierare och explicit version genom navigation och gör ingen implicit klassomkoppling. APL-planering är intern verksamhetsdata; den får inte etiketteras Attendance eller Placement eller användas som bevis för genomförande. Ingen extern standardanslutning har verifierats här.

Fullt skolmandat, gamla oförändrade kvitton i databasen, samtidighet, SQL-rollback, verklig kandidat med OIDC, handboksbygge och eventuell lokal leverans återstår att sammanföra från delplanerna 02–04 och 06. Denna UI-sammanfattning ändrar inte deras status och registrerar inget nytt användargodkännande.
