---
created: 2026-09-29
title: Samlad genomgång av UI på dator och telefon
area: ui
updated: 2026-10-15
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

## Klassflödet: användaråterkoppling2026-10-15

Användaren bekräftar ”ok allt funkar” i CLASS-COHORT-provet men tillägger: ”vi kommer behöva se över detta så UI och allt funkar smidigt. Mycket knappar med tekniska grejre nu”. Före godkännandet behövde användaren fråga hur den nya klassen sparas. Funktionen är användarrapporterat godkänd; smidighet och tydlighet har kvarstående anmärkning.

- Gör huvudåtgärden för aktuell uppgift tydlig, särskilt granska → spara klass. Användaren ska hitta sparningen utan förklaring i chatten.
- Minska konkurrerande knappar och tekniska begrepp. Gruppera sekundära funktioner och visa återhämtning/statusåtgärder när situationen kräver dem; exakt utformning bestäms vid planering.
- Pröva ett sammanhängande flöde mellan programplan, klasser och timplan med verksamhetsord och tydligt nästa steg.
- Bevara servermandat, MFA, skydd vid osäkert sparsvar, explicita datum-/års-/versionsval och befintliga data. Färre knappar får inte ta bort nödvändiga verksamhetsbeslut.
- Planera berörda handbokssidor och dator-/telefonprov. SS12000-mappning och stabila identiteter/perioder ska bevaras; en presentationsändring innebär inget nytt standardstöd.

Se [registrerat användarutfall](../../phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-USER-TRIAL.md). Detta är fångat förbättringsbehov inför avgränsad planering, inte en genomförd ombyggnad eller krav på att göra om redan godkänt funktionsprov.

## Konkret gap efter klasskopplingsprovet 2026-10-15

Användaren misstog programplanens lista över befintliga klasser för timplanens klassval och kunde inte hitta hur två klasser kopplas. Efter vägledning fungerade kopplingen, men användaren beställde ett uttryckligt gap och designunderlag. [CLASS-COHORT-UX-01](../../phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-UX-GAP.md) samlar fynd, avgränsning och stängningskriterier. [Prompt till Claude Design](../../phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-CLAUDE-DESIGN-PROMPT.md) används med skärmdumpar för sammanhängande flöde, tydligt sparande, synliga klasskopplingar och föreslaget flerval. Design och implementation återstår; gapet ersätter inte denna bredare UI-genomgång.
