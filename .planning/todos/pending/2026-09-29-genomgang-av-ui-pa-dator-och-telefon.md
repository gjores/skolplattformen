---
created: 2026-09-29
title: Samlad genomgång av UI på dator och telefon
area: ui
files:
  - web/app/pupil-card.tsx
  - web/app/pupil-register-workspace.tsx
  - web/app/pupil-dialogs.tsx
  - .planning/phases/04-best-ndigt-och-skyddat-elevregister/04-HUMAN-UAT.md
---

## Problem

Användaren begärde 2026-09-29 en samlad UI-genomgång: ”ser för taskigt ut”. Under fas 4:s användarprov var klasstillhörighetens datum och perioder svårbegripliga, med långa tekniska provnamn, aktuell period utan synligt slutdatum och två kommande perioder med samma klassnamn.

## Solution

- Gå igenom listor, elevkort och dialoger på dator och telefon med fokus på läsbarhet, informationshierarki, avstånd och begripliga verksamhetsord.
- Visa klassperioder konsekvent och förklara varför samma klass kan ha separata perioder. Verifiera datamodellen innan eventuell sammanslagning; dölj inte verksamhetsmässiga skillnader.
- Skilj provfixturernas tekniska namn från produktens presentation och använd läsbara syntetiska namn vid användarprov.
- Planera avgränsade ändringar i GSD, bevara mandat och skydd, pröva berörda användarflöden i båda vyerna och uppdatera handboken vid ändrat beteende.

Status: fångat användarbehov för kommande planering, inte genomförd UI-ombyggnad. Datumanmärkningen kvarstår även i 04-22 tills den är utredd och omprövad.
