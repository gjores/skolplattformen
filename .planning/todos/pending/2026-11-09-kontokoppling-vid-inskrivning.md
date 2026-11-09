---
created: 2026-11-09
title: Elev- och vårdnadshavarkonton kopplas vid inskrivning, inte i elevvalet
area: planning
status: pending
phase: "05.2"
---

**Fynd i användarprovet VP-15, U7, 2026-11-09.** Användaren lyckades inte koppla elevkontot under **Kontokopplingar**. Kopplingen hör inte heller hemma när eleven redan har en klass och ska välja kurser. Den ska finnas när eleven skrivs in, eller komma från elevregistret.

## Läge nu

- Skolan kopplar konton per elev under **Kontokopplingar** i Elevval. Den behöver då den kontoreferens som visas på kontoinnehavarens Mina val. Kontot måste ha loggat in en gång.
- Loggen från provet visar att kopplingarna lästes men att inget sparande nådde servern. Vad som stoppade i vyn är inte utrett.
- **Provisoriskt för provet:** `work/pilot/prepare-valplan-user-trial.mjs` kopplar `vp.elev` och båda vårdnadshavarkontona till valprovselev 1, med rektors uppdrag som intygare och från dagens datum utan slut. Vårdnadshavare 1 bekräftar valen, Vårdnadshavare 2 ser dem. Skriptet skapar medlemskap och koppling direkt i databasen, som skolans intygande gör, men utan händelse i granskningsloggen. Det gäller bara syntetiska provdata.

## Att avgöra

- Var kopplingen görs: vid inskrivning och placering, i en egen kontovy eller via elevregistret med eget källansvar.
- Hur kontot identifieras utan att skolan skriver av en referens, och vad som gäller för vårdnadshavare med och utan rätt att bekräfta.
- Om **Kontokopplingar** ska ligga kvar i Elevval som undantag, eller bara visa läget.

## SS 12000

Relationen mellan elev och vårdnadshavare finns i SS 12000:2024 som ansvariga personer (`responsibles`) på elevens `Person`. Fältnamnet ska stämmas av mot specifikationen. Kontot är en lokal inloggningsidentitet, och kopplingen kan inte härledas ur standarden. Om relationen ska komma från elevregistret krävs kontrakt och källansvar.
