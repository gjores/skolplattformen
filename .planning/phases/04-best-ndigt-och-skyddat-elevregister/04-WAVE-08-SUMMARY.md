---
phase: 04
wave: 8
status: complete
completed_plans: [04-23, 04-13, 04-15]
next_plans: [04-17]
---

# Fas 4 — våg 8

Vågen öppnar Worker-körrätt för registrets skrivfunktioner (04-23, tillagd efter våg 7 enligt användarbeslut 2026-09-28), bygger elevkortet och dialogerna (04-13) och portar de sista äldre fas 3-SQL-proven (04-15). Allt är lokalt och bygger på syntetiska uppgifter. Inga krav är markerade som slutverifierade.

## Verifierat

- Modell- och serversvit efter vågen: 389/389 PASS. `tsc --noEmit` och `oxlint app lib` PASS. Appbygget passerade i 04-13.
- **04-23:** Migrationen `20260929170000_phase4_worker_register_execute.sql` ger bara `skolplattform_worker` körrätt på `phase4_change_pupil(jsonb)`, `phase4_resolve_source(jsonb)`, `phase4_reveal_personal_number(jsonb)` och `phase4_export_pupils(jsonb, boolean)`. Den tillämpades bara lokalt mot protected-målet. Resultat efter migrationen: register 162/162, periods 101/101, export 22/22. Verkligt Worker-prov (`phase4-worker-execute-probe.mjs`) 9/9 PASS i slutkörningen: behörig administratör med MFA når ändring, personnummer och export, medan anrop utan MFA, fel roll och direktanrop från klientroller nekas med beständig logg. Provets sessioner skapas direkt i databasen, så det är ingen riktig inloggning.
- **04-13:** Elevkort, sex ändringsdialoger, konfliktvy, källavvikelse och exportdialog med serverprövat antal. Riktat webbläsarprov 9/9 mot byggd Worker på dator samt telefon i 390 och 320 px. Listans prov 13/13.
- **04-15:** Hela SQL-regressionen är grön för första gången sedan fas 4 började: 16/16 filer och 1161 assertions (`phase3_boundaries` 41/41, `phase3_connections` 19/19, `phase3_audit` 19/19). Inga tidigare assertions är ändrade. Fixturskriptet för fas 3 kan köras två gånger i rad utan dubbletter.

## Kvarstår

- **Lokala Worker-avbrott på nekade anrop.** I 04-23 stannade den lokala Workern i 5 av 11 körningar efter ett nekat anrop (500, sedan inget svar). Inga uppgifter läckte och inget ändrades. Problemet är beskrivet i `deferred-items.md` och bör utredas före E2E och grindar (04-16, 04-19, 04-21). Under 04-13:s körningar inträffade inga avbrott.
- **Skyddade elever utelämnas alltid ur exporten.** Listans API markerar inte vilka elever som är skyddade, så varken valet att ta med dem eller skyddsmärket i listan kan visas. Det kräver en ändring i serverns listsvar, och ingen plan äger den ännu.
- **Ej provat i webbläsare:** lyckad sparning, konflikt mellan två administratörer, avvikelsepanelen och nedladdad fil, eftersom provkontot saknar engångskod. Detta ägs av 04-16 och 04-19.
- **Avvikelser från UI-SPEC som API:et inte räcker till för:** ett namnfält i stället för förnamn och efternamn, kommunkod i stället för kommunnamn, inget aktörsnamn i historiken, inget klassval vid skolbyte och ingen brödsmula "Elevkort". Tolkningen av den anonyma listraden (endast namnknapp) behöver bekräftas mot D-19 i 04-19.
- `verify-mandates.mjs` skriver fortfarande tillfälliga rader i det gamla elevprovet. Detta ägs av 04-18.
- GSD-verktygen kunde inte flytta fram STATE och förvanskade ROADMAP, så båda rättades för hand. Ett verktyg markerade STU-01 som klart i REQUIREMENTS.md, vilket återställdes.

## Nästa steg

Fas 4 har 16 av 23 planer genomförda. Våg 9 är 04-17, som avvecklar elevprovet utan att lämna alternativa datavägar.
