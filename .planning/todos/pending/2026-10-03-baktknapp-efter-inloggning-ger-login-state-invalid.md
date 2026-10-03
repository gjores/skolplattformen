---
created: 2026-10-03
title: Bakåtknapp efter inloggning visar rå JSON-kod login_state_invalid
area: inloggning
files:
  - web/app/api/auth/callback/route.ts
  - web/lib/session-channel.ts
  - web/e2e/phase2-access.spec.ts
  - web/e2e/phase2-spike.spec.ts
---

## Problem

Användarfynd 2026-10-03: När man trycker bakåt i webbläsaren efter inloggning visas en rå svarstext i stället för en sida, till exempel:

`{"code":"login_state_invalid","correlationId":"…"}`

Trolig orsak, som inte är reproducerad ännu: Inloggningssidans återkomstadress `/api/auth/callback?code=…&state=…` ligger kvar i webbläsarhistoriken. Vid bakåt anropas den igen. Kakan `sp_login` raderades redan när inloggningen lyckades, så `openLoginState` ger `null`. `GET` svarar då med `fail('login_state_invalid', 400, …)`, som är JSON avsett för API-anrop. Webbläsaren visar svaret som text. Samma rå JSON visas när `completeAuthorization` misslyckas, till exempel om koden redan är använd.

Säkerheten fungerar som avsett: återspelat svar från inloggningstjänsten avvisas och loggas. Felet gäller hur avvisningen visas.

## Solution

- Återkomstadressen är en sidnavigering. Avvisningar ska därför skickas vidare (302/303 med `Cache-Control: no-store`) i stället för att visa JSON:
  - Har användaren redan en giltig session ska hen hamna på startsidan eller på `returnTo` utan felmeddelande.
  - Annars ska hen hamna på `/?inloggning=nekad&kod=login_state_invalid`, så att texten i `session-channel.ts` visas: ”Inloggningen kunde inte slutföras. Försök igen.”
- Behåll avvisning, radering av `sp_login` och auditloggning (`logDenied`). Lägg inte till detaljer om koder eller identiteter i adressen.
- Uppdatera e2e-proven som i dag väntar sig `login_state_invalid` i sidans text (`phase2-access.spec.ts:538`, `phase2-spike.spec.ts:273`). Lägg till ett prov där användaren loggar in och går bakåt, både med och utan aktiv session.
- Pröva på dator och telefon.

Kopplat till: fas 3 `deferred-items.md` om att inloggning via `localhost` och via `127.0.0.1` ger samma kod eftersom kakan är bunden till värdnamnet. Det är en annan orsak, men samma visningsproblem.

Status: gap fångat. Ingen kod är ändrad och fasplaceringen återstår.
