# Fas 2 — Plangranskning

**Datum:** 2026-09-13
**Status:** VERIFICATION PASSED (planering)
**Granskare:** gsd-plan-checker, oberoende av planeraren
**Omfattning:** 12 planer, 32 uppgifter, 11 vågor. 0 blockerare och 0 åtgärdskrävande varningar.

## Täckning och ordning

| Krav | Huvudsakliga planer |
|------|---------------------|
| IAM-01 | 01, 07, 09, 12 |
| IAM-03 | 05, 06, 10, 11, 12 |
| IAM-04 | 03, 04, 06, 10, 11, 12 |
| IAM-05 | 02, 03, 04, 06, 07, 09, 11, 12 |
| ACL-01 | 02, 05, 08, 09, 12 |
| AUDIT-01 | 05, 06, 08, 09, 12 |

Vågor: 01 → 02 → 03 → 04 → 05 → 06 → (07 + 08) → 09 → 10 → 11 → 12. Beroendegrafen är utan cykler. De större planerna består av högst tre avgränsade uppgifter med flera små route-, test- och konfigurationsfiler.

## Kontroller och rättningar

Samtliga tolv planer passerade GSD:s strukturkontroll. Valideringskartan innehåller 32 uppgiftskommandon, setupberoenden och obligatoriska beteendeprov. D-01–D-18 respekteras; D-18 innebär ärvt UI-kontrakt från fas 1 och ingen ny UI-SPEC.

Granskningen ledde till samordnade rättningar av personbindning och MFA vid inbjudan, sessionsuppslag under RLS, workeråtkomst till auth.uid(), provpersonernas TOTP, förväntade svar efter återkallad session, fokus/flikrensning, testtrace utan hemligheter och testfilter som faktiskt kör den byggda appens spikprov. Research och planer beskriver samma noncekontrakt: Workern ansvarar för OIDC-valideringen; GoTrue-registrering får inte ensam skapa appåtkomst.

Slutgrinden i 02-12 kräver färska och fullständiga säkerhetsbevis. Saknade, gamla, överhoppade eller blockerade obligatoriska prov får inte bli PASS. Databas-/OIDC-spiken är stoppande före beroende arbete. Valda lösningar är inte i sig passerade körprov.

## Begränsning

Detta är godkännande av planernas genomförbarhet, inte av fas 2:s implementation. Inga nya app-, databas- eller integrationsprov kördes under slutplaneringen. Kraven för fas 2 förblir öppna. Faktisk kommunanslutning och pilotdrift har fortsatt egna godkännandegränser.

Nästa steg: `$gsd-execute-phase 2`.
