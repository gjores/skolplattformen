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

- **Mobilt användarfynd 2026-10-06:** Programplanens årskursknappar fungerar bättre än dropdownen. Se [avgränsat förbättringsbehov för motsvarande timplansurval](2026-10-06-arskursknappar-i-mobilens-timplan.md); gymtimplanen är trolig målvy enligt kodkontroll, att bekräfta vid rättning. Detta innebär inte att alla dropdowns ska ändras.
- Gå igenom listor, elevkort och dialoger på dator och telefon med fokus på läsbarhet, informationshierarki, avstånd och begripliga verksamhetsord.
- Använd programplan/programplaner i stället för poängplan/poängplaner enligt användarbeslut 2026-09-29; se separat todo `2026-09-29-byt-poangplan-till-programplan.md`.
- Visa klassperioder konsekvent och förklara varför samma klass kan ha separata perioder. Verifiera datamodellen innan eventuell sammanslagning; dölj inte verksamhetsmässiga skillnader.
- Skilj provfixturernas tekniska namn från produktens presentation och använd läsbara syntetiska namn vid användarprov.
- Planera avgränsade ändringar i GSD, bevara mandat och skydd, pröva berörda användarflöden i båda vyerna och uppdatera handboken vid ändrat beteende.

Status: fångat användarbehov för kommande planering, inte genomförd UI-ombyggnad. Datumanmärkningen kvarstår även i 04-22 tills den är utredd och omprövad.
