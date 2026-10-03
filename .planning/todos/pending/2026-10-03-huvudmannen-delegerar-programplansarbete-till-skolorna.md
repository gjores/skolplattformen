---
created: 2026-10-03
title: Huvudmannen ska kunna delegera programplansarbete till rektor och skoladministratör
area: programplaner
files:
  - web/app/protected-programplan-workspace.tsx
  - web/lib/server/programplan-planning.ts
  - docs/handbok/programplaner.md
---

## Problem

Användaren vill att huvudmannen (HM) ska kunna delegera arbetet med programplaner till skolorna, så att rektor och skoladministratör kan utföra arbetet för sin skola. Behovet ska tas med i återstående fas 5-planering tillsammans med ADMIN-02 och befintliga mandatregler.

## Solution

- Gör det möjligt för huvudmannen att tilldela och återkalla programplansarbete för rektor och skoladministratör inom uttryckligt angivna skolenheter.
- Precisera vilka arbetsmoment delegationen omfattar, exempelvis skapa och bearbeta utkast samt lägga till ämnen/nivåer och programfördjupning. Skilj arbetsdelegation från rätten att fastställa en plan; beslutsrättens omfattning behöver klargöras i planeringen.
- Visa tydligt vem som får arbeta med skolans programplaner och vilka åtgärder uppdraget medger. Använd den gemensamma arbetsytan för nya och befintliga utbildningar.
- Kontrollera aktuellt uppdrag och skol-/kundgräns på servern även vid direkta anrop. Bevara obligatorisk audit, konflikthantering, planversioner och tidigare beslut. Återkallat uppdrag ska upphöra att ge åtkomst.
- Uppdatera handboken och planera användarprov för huvudman, rektor och skoladministratör när funktionen genomförs.

## Verification

- Huvudmannen delegerar programplansarbete för en skola. Både rektor och skoladministratör kan utföra tilldelade arbetsmoment, spara och läsa om resultatet.
- Arbete på annan skola eller hos annan huvudman nekas även genom direkta API-anrop. Återkallelse stoppar fortsatt arbete utan att sparade planer eller historik förloras.
- Delegationen ger endast de uttryckligen tilldelade arbetsmomenten; fastställande prövas separat enligt beslutade mandat. Tilldelning, återkallelse och programplansändringar är spårbara.

Status: **pending**. Användarbeställt behov; genomförande och verifiering återstår.
