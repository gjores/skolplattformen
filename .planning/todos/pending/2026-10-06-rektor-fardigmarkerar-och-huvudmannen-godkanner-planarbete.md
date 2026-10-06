---
created: 2026-10-06
title: Rektor färdigmarkerar planarbete och huvudmannens representant godkänner
area: planbeslut
status: pending
requirements: [ADMIN-02, ADMIN-04]
phase: "05"
related_plans: ["05-25", "05-26", "05-32", "05-33"]
files:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-gym-timplan-workspace.tsx
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
---

## Användarbeslut och gap

Användaren säger 2026-10-06: ”en rektor ska kunna färdigmarkera sitt arbete och en huvudmana representant ska kunna godkänna.” I det aktuella samtalets program-/timplansflöde behövs alltså en uttrycklig överlämning och ett separat godkännande. Det tidigare godkända användarprovet gäller det fungerande grundflödet; det innebär inte att dessa ännu saknade handlingar är levererade eller prövade.

Färsk kodkontroll: `protected-programplan-workspace.tsx` räknar fram `ready` ur analysen och visar ”Klar för beslut” medan versionen fortfarande är utkast. Detta är ingen färdigmarkering av rektor. De skyddade API-katalogerna för program-/timplaner saknar ännu rutter för att lämna över och godkänna arbetet. Gymtimplansvyn sparar timmar i skolans utkast; den förklarar att programutkastet inte fastställs av övergången.

## Befintlig planering

- 05-25/26 planerar huvudmannens programfastställande direkt ur ett serverkontrollerat utkast. Det täcker inte i sig rektorns uttryckliga färdigmarkering och överlämning.
- 05-32/33 planerar timplanens Lämna förslag, återremiss och huvudmannens fastställande. Detta motsvarar delar av behovet men är inte genomfört.
- Samtliga berörda planer har `replan_required`; de ska revideras mot dagens programram och skolvisa timutkast före genomförande. Detta behov ska tas med i den revisionen, inte tappas när redan levererat utkastarbete tas bort.
- Arbetsdelegation till skolorna följs i [befintlig todo](2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md). Delegation och beslutsrätt behöver hållas isär.

## Avsett arbetsflöde

1. Rektorn sparar sitt arbete och kan uttryckligen **färdigmarkera/lämna för godkännande** inom sitt aktuella skolmandat.
2. En behörig representant för huvudmannen kan se överlämnat arbete, granska den aktuella sparade versionen och uttryckligen **godkänna**.
3. Båda parter ser vad som är under arbete, överlämnat respektive godkänt, med spårbar aktör och tidpunkt. Programplan och skolans timplan är skilda versionsbundna objekt; ett godkännande får inte tyst godkänna båda.

Automatisk analysberedskap och rektorns färdigmarkering ska skiljas åt. Slutlig benämning, om godkännandet samtidigt är formellt fastställande, hur ändringar efter överlämning hanteras samt återlämning för rättning behöver preciseras vid omplaneringen. Skoladministratörens eventuella rätt att färdigmarkera är inte beslutad av det här beskedet. Ingen ny beslutsrätt följer av ett rollval i klienten.

## Verifieringsmål

- Rektor kan spara, färdigmarkera och läsa om rätt skol-/planversion; huvudmannen ser samma överlämnade underlag och kan godkänna det.
- Automatisk ”Klar för beslut” räknas inte som rektorns överlämning. Osparat arbete eller pågående/okänd sparning får inte ge ett kvitto på överlämnad version.
- Rektor kan inte godkänna som huvudman genom direkt anrop. Fel kund/skola, återkallat mandat och inaktuell revision nekas på servern; båda handlingarna loggas atomärt.
- Godkännande gäller exakt granskad version/revision. Äldre beslut, frysta källor och explicita klasskopplingar bevaras; nya eller ändrade planer blir inte automatiskt godkända.
- Verksamhetsflödet prövas på dator och telefon, med begriplig status och uppdaterad handbok. Återlämning/ändring efter överlämning provas enligt den reviderade planen.

**Status: pending.** Användarbeställt behov i fas 5; omplanering, implementation och verifiering återstår. Ingen ny körning, plan-SUMMARY eller full kravverifiering följer av registreringen.
