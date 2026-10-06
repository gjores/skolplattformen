---
created: 2026-10-06
title: Använd programplanens årskursknappar i mobilens timplan
area: ui
status: pending
phase: "05"
related_plans: ["05-41"]
files:
  - web/app/protected-programplan-board.tsx
  - web/app/protected-gym-timplan-hours.tsx
  - web/app/protected-gym-timplan.css
  - docs/handbok/timplaner.md
---

## Användarfynd och tolkning

Användaren säger 2026-10-06 att programplanernas årskursknappar fungerar mycket bra i mobilläge och att dropdownen är sämre. Användarens önskemål är att återanvända det fungerande knappmönstret för motsvarande årskursval.

Färsk kodkontroll: `protected-programplan-board.tsx` har tydliga knappar för Åk 1–3 med markerat aktivt val. `protected-gym-timplan-hours.tsx` har i stället dropdownen ”Visa årskurs”, med Alla årskurser och Årskurs 1–3. Gymtimplanens dropdown är den troliga referensen utifrån samtalet; användaren har inte uttryckligen namngivit målvy. Även GR/IM-vyn har ett separat kolumnurval, men en generell ändring av alla dropdowns är inte beställd.

## Avsedd rättning

- Använd samma tydliga årskursknappar som i programplanen för gymtimplanens mobilurval, med synligt aktivt år och tillgänglig markering.
- Behåll åtkomsten till hela planen. Knappvalet visar motsvarande HT/VT utan att flytta timmar, byta planversion eller kasta dolda terminers värden.
- Bevara direkt timinmatning, radvis autospar, köade ändringar, konflikt-/okänt-svarshantering och osparatskydd vid årskursbyte.
- Samordna med 05-41:s framtida kontrollerade årsval och oförändrade terminsindex. Rättningen kan avgränsas separat efter kontroll av målvy; den kräver inte hela läsårspaketet.

## Verifieringsmål

På telefon: byt mellan Åk 1, 2 och 3, kontrollera rätt HT/VT, tydlig aktiv knapp, läsbara tryckytor och bestående timmar efter återöppning. Pröva årskursbyte efter inmatning och under pågående sparning. På dator: åtkomst till alla sex terminer och befintligt timplansarbete ska bestå. Granska berörda bilder och uppdatera handboken om instruktionerna ändras.

**Status: pending.** Användarfynd registrerat; målvy behöver bekräftas vid rättning. Ingen UI-implementation, ny browserkörning eller planverifiering följer av denna registrering. Tidigare användargodkännande av grundflödet består, med detta nya förbättringsbehov tillagt.
