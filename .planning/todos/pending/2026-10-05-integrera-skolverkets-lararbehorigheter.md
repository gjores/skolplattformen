---
created: 2026-10-05
title: Planera integration av Skolverkets lärarlegitimation och undervisningsbehörighet
area: integration
status: pending
planning_goals: [LLEG-01, LLEG-02, LLEG-03, LLEG-04]
related_requirements: [GROUP-01, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08, MODUL-03]
files:
  - .planning/research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md
  - .planning/research/SCHEMAMODUL-PROJEKT.md
  - web/lib/admin-model.ts
  - web/lib/server/db.ts
  - supabase/migrations/20260922120000_phase3_staff_bindings.sql
---

## Användarens uppdrag

2026-10-05: efter research om lärarregistrets åtkomst ska planerna ses över för hur uppgifterna kan beaktas och integreras. Planeringsöversynen är utförd i [underlaget](../../research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md). Genomförande, leveransomfattning, regelbeslut och verifiering återstår. LLEG-01–04 är föreslagna mål för senare planer och ändrar inte pilotens 42 krav.

## Fortsatt arbete

1. L1/S1: definiera intern lärarresurs, skyddad personmatchning, källa, kodliste-/Gy25-mappning, mandat och regler. Skilj Skolverkets undervisningsbehörighet från lokalt uppdrag och systemåtkomst.
2. Bekräfta leveransväg med Skolverket: offentlig API-dokumentation är inte verifierad, men XML-utdragsformat finns. Begär aktuellt XSD, syntetiska exempel och besked om återkallelser, maskinåtkomst, anslutningsvillkor och testmiljö när kontakt är beställd.
3. L2: planera separat XML-import med förhandsgranskning, radfel, omkörning, revisioner och audit; en bekräftad API-adapter kan senare använda samma interna kontrakt. Tomt/saknat/inaktuellt underlag får inte tyst radera data eller bli ett positivt besked.
4. L3/S3: använd exakt behörighetsversion i tjänstefördelning, undervisningsgrupper och schema; prova syntetiska begränsningar även i S2. Ändringar visar konsekvenser och kräver ny kontroll inför publicering. Definiera tillämpliga undantag/granskningsregler utan automatisk lagtolkning.
5. L4/S4: dokumentera verkligt anslutningsprov och komplettera avsedd informationshantering/drift. Lärarutdrag ersätter varken elevregisteranslutningens INT-07 eller personalinloggningens IAM-02.

## Verifiering och relation till äldre uppgift

Alla framtida verifieringsfall och ansvar L1–L4 finns i researchunderlaget. Varje genomförandeplan ska omfatta aktuella datavägar, syntetiska negativa/positiva prov och berörd handbok med dator-/telefonprov när användarbeteendet ändras. Inga sådana prov är körda genom planeringsöversynen.

Den äldre [API-/statistikuppgiften](2026-09-12-api-f-r-l-rares-beh-righeter-med-statistisk-uppf-ljning.md) gäller lokala läraruppdrag och statistisk uppföljning. Denna uppgift gäller myndighetsuppgifter om undervisningsbehörighet; de är separata beroenden för tjänstefördelningen.
