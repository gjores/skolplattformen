---
created: 2026-09-26
title: Utred Sverige-id och integration i appen
area: auth
files:
  - .planning/REQUIREMENTS.md
  - docs/pilot/bankid-readiness-review.md
  - .planning/todos/pending/2026-09-13-planera-stark-identitetskontroll-och-bankid.md
---

## Problem

Användaren vill läsa på om Sveriges statliga e-legitimation Sverige-id och hur den kan integreras i skolplattformen. Utred alternativet tillsammans med BankID och kommunernas federerade inloggning. Punkten avser research och ett integrationsförslag; ingen fungerande anslutning eller utökning av aktuell fas är beslutad genom denna todo.

## Solution

- Läs Polisens information för användare och förlitande parter samt aktuella tekniska anvisningar från Digg/Sweden Connect. Skilj annonserade möjligheter från tillgängliga och verifierade tjänster.
- Kartlägg anslutningskrav, avtal, ansvarig förlitande part, testmiljö, kostnader och beroenden. Bedöm direkt anslutning respektive anslutning via identitetsförmedlare och hur detta passar appens befintliga OIDC-flöde; anta inte protokollkompatibilitet.
- Beskriv användning för personal, elever och vårdnadshavare, inklusive åldersvillkor, dator/telefon, tillgänglighet och alternativ vid avbrott eller avsaknad av e-legitimation.
- Utred säker kontolänkning med verifierad identitet och identifierare från rätt utfärdare. E-post får inte ensam avgöra länkningen. Styrkt identitet ger inte automatiskt roll, skolanknytning, vårdnadshavarrelation eller mandat.
- Håll inloggning, extra identitetskontroll inför en åtgärd och elektronisk underskrift åtskilda. Verifiera tillitsnivå och autentiseringsbevis, sessionshantering och begränsad säkerhetsloggning mot dokumenterade kontrakt.
- Leverera en intern beslutsanteckning med rekommenderat alternativ, öppna frågor, uppskattad arbetsinsats och provfall med syntetiska data. Samordna med BankID-utredningen och berörda identitets-, mandat- och integrationsfaser innan implementation planeras.
- Teknisk research hör till interna projektdokument. Docusaurus får endast senare beskriva verifierade användarinstruktioner och regler.

## Källor och första kontroll 2026-09-26

- [Polisen: Statlig e-legitimation – Sverige-id](https://polisen.se/tjanster-tillstand/pass-och-nationellt-id-kort/statlig-e-legitimation-sverige-id/): anger lansering den 1 december 2026 och att tjänsten är under utveckling. Datumet är källans uppgift, inte projektets leveransdatum.
- [Polisen: Sverige-id för förlitande parter](https://polisen.se/samverkan/sverige-id-forlitande-parter/): beskriver successiv anslutning och hänvisar till Sweden Connect. Detaljerade anslutnings- och säkerhetsvillkor återstår att granska.

Status: registrerad och källor översiktligt kontrollerade; teknisk utredning och anslutningsprov återstår.

## Teknisk komplettering 2026-09-26

Se [utvecklarunderlaget](../../../docs/pilot/sverige-id-developer-review.md) för officiell OIDC-profil, anslutningsbegränsningar, kodjämförelse och konkret arbetslista. En skillnad är appens nuvarande klientautentisering jämfört med Sweden Connect-profilens krav. Underlaget är en första granskning; full profilmatris, attributkontrakt, anslutningsrätt och verkliga prov återstår.
