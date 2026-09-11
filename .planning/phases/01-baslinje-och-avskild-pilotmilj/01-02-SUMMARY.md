---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 02
subsystem: docs
tags: [pilotprofil, PILOT-01, öppna-beroenden, syntetiska-data, anslutningsprofil]

# Dependency graph
requires:
  - phase: 01-baslinje-och-avskild-pilotmilj
    provides: "01-CONTEXT.md D-01–D-10 och 01-RESEARCH.md § Pilotprofilens minsta innehåll"
provides:
  - "docs/pilot/connection-profile.md: daterad anslutningsprofil (2026-09-11) med 15 profilrader märkta Bekräftat/Syntetiskt exempel/Förslag/Öppet"
  - "Föreslagen minsta fältuppsättning för elev och placering (11 rader) med exempel, föreslaget skrivansvar och status"
  - "Öppna beroenden OB-01–OB-08 med beslutsägare, blockerad fas/krav och villkor för stängning"
  - "Uppdateringsregler: hur en rad byter från Öppet till Bekräftat och att syntetiska exempel aldrig blir Bekräftat"
affects: [01-04, 01-09, fas 4 (STU-01–STU-04), fas 6 (INT-02), fas 7 (IAM-02, IAM-06, INT-07), fas 8 (OPS-01, OPS-02)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Statusmarkering per rad (Bekräftat | Syntetiskt exempel | Förslag | Öppet) med källkolumn som pekar på D-xx, krav-ID eller fas 1-plan"
    - "Öppna beroenden som ID-satt tabell (OB-xx) med beslutsägare, blockerad fas och stängningsvillkor"

key-files:
  created:
    - docs/pilot/connection-profile.md
  modified: []

key-decisions:
  - "Provmiljöns organisation (Exempelstads kommun, 2120009999, 99999902/99999903, 24 elever) står som Syntetiskt exempel, inte som beslut; verklig volym, källa och partner står som Öppet"
  - "Profilen fick ett avsnitt om hur beroenden stängs: rader byter status först vid skriftligt besked, beroenden stryks inte utan dateras i ändringsloggen, syntetiska exempel blir aldrig Bekräftat"

patterns-established:
  - "Pilotdokument i docs/pilot/ är daterade med ändringslogg och skiljer förslag från beslut"

requirements-completed: [PILOT-01]

# Metrics
duration: 6min
completed: 2026-09-11
---

# Phase 01 Plan 02: Daterad anslutningsprofil för piloten Summary

**Daterad anslutningsprofil (PILOT-01) där varje rad är märkt Bekräftat, Syntetiskt exempel, Förslag eller Öppet, och där pilotpartner, IdP, kontokälla, registerleverantör, drift och acceptansprov redovisas som åtta öppna beroenden med beslutsägare och blockerad fas.**

## Performance

- **Duration:** ca 6 min
- **Started:** 2026-09-11T10:25Z (ungefärlig)
- **Completed:** 2026-09-11
- **Tasks:** 2 av 2
- **Files modified:** 1 (skapad)

## Accomplishments

- `docs/pilot/connection-profile.md` (94 rader) med de tre obligatoriska huvudrubrikerna plus fältförslag, öppna beroenden och ändringslogg.
- Profiltabellen har 15 rader i planens ordning; varje rad spårar till D-01–D-10, ett krav-ID eller en fas 1-plan.
- Stycket "Vad profilen inte påstår" avgränsar tydligt: inga verkliga elevuppgifter, inga fiktiva bevis på kommunanslutning eller mandat, ingen påverkan på godkännandegränserna i fas 7/8.
- Inga förbjudna statusord ("Inloggad", "Behörig rektor", "Kommun ansluten", "Säker pilot") förekommer.

## Antal rader per statusmarkering

Profiltabellen (`## Profil`):

| Markering | Rader |
|-----------|-------|
| Öppet | 9 |
| Syntetiskt exempel | 2 |
| Bekräftat | 2 |
| Förslag | 2 |

Fälttabellen (`## Föreslagna elev- och placeringsfält`): 7 rader Förslag, 4 rader Öppet (Klassreferens, Källsystemets namnrymd, Externt ID, Personnummer/Adress/Kontaktuppgifter).

`grep -c 'Öppet'` över hela dokumentet: 15 (planens verifieringskrav ≥ 15).

## Öppna beroenden OB-01–OB-08

| ID | Beroende | Beslutsägare | Blockerar |
|----|----------|--------------|-----------|
| OB-01 | Val av pilotpartner | Projektansvarig tillsammans med kandidatkund | Fas 7 (IAM-02, IAM-06, INT-07), fas 8 |
| OB-02 | Identitetsleverantör och autentiseringskrav | Pilotpartner / kommunens IT | IAM-02 |
| OB-03 | Kontokälla för tilldelning och avveckling | Pilotpartner / kommunens IT | IAM-06 |
| OB-04 | Elevregisterleverantör, kontraktsversion och testmiljö | Pilotpartner / leverantör | INT-02, INT-07 |
| OB-05 | Fältlista, originalkälla och skrivansvar per fält | Pilotpartner | STU-04, INT-02, fas 4/6 |
| OB-06 | Verklig pilotvolym och skolenheter | Pilotpartner | Fas 6–8 |
| OB-07 | Drift, avtal, underleverantörer, konsekvensbedömning | Projektansvarig / pilotpartner | OPS-01, fas 8 |
| OB-08 | Skyddsfall och spärr-/återställningsmål | Pilotpartner | DATA-01, OPS-02 |

## Task Commits

Each task was committed atomically:

1. **Task 1: Skriv anslutningsprofilens stomme med status per rad** - `99cc30e` (docs)
2. **Task 2: Lägg till föreslagna elev-/placeringsfält och öppna beroenden med beslutsägare** - `11441cc` (docs)

## Files Created/Modified

- `docs/pilot/connection-profile.md` - Daterad anslutningsprofil för piloten: läsanvisning, profiltabell, vad profilen inte påstår, föreslagna fält, öppna beroenden, uppdateringsregler och ändringslogg.

## Verification

Planens `<automated>`-kommandon kördes för båda uppgifterna och gav utfall OK. Kompletterande kontroller: alla nio krävda områdessträngar finns, alla elva fältrader finns, exakt 8 rader börjar med `| OB-0`, samtliga OB-rader har beslutsägare och fas-/kravreferens, `2120009999` står tillsammans med `fiktivt`, och `grep -ciE 'kommun ansluten|säker pilot|behörig rektor|inloggad'` ger 0.

Manuell källspårning (01-VALIDATION Manual-Only): 24 elever står som Syntetiskt exempel (D-03), verklig volym som Öppet (D-03; pilotpartner). Återstår för fasverifiering i 01-09.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dokumentet nådde inte planens minimilängd och Öppet-antal**
- **Found during:** Task 2
- **Issue:** Efter planens exakta innehåll var filen 88 rader (krav ≥ 90) och innehöll 14 förekomster av `Öppet` (planens verifiering kräver ≥ 15).
- **Fix:** Lade till ett kort avsnitt "Så uppdateras profilen när ett beroende stängs" under Öppna beroenden med tre regler (statusbyte kräver skriftligt besked, beroenden dateras i stället för att strykas, syntetiska exempel blir aldrig Bekräftat). Innehållet stödjer D-10 och ersätter inget av planens föreskrivna innehåll.
- **Files modified:** docs/pilot/connection-profile.md
- **Commit:** 11441cc

Övrigt: planen föreskrev en commit i task 2; exekveringsprotokollet kräver commit per uppgift, så task 1 committades separat (99cc30e) och task 2 med planens commit-meddelande (11441cc). Inga krav i REQUIREMENTS.md ändrades (uppdateras i 01-09).

## Known Stubs

Inga. Dokumentet innehåller avsiktligt markerade öppna värden ("Ej vald", "ej satt i provet"), vilket är PILOT-01:s syfte, inte platshållare.

## Issues Encountered

Inga.

## Next Steps

- Plan 01-04 skapar de syntetiska fixturer som profilen beskriver som Syntetiskt exempel.
- Plan 01-09 verifierar fasen och markerar PILOT-01 efter den mänskliga kontrollpunkten.
- OB-01–OB-08 kvarstår som blockerare för fas 7/8 tills beslutsägarna lämnat besked.

## Self-Check: PASSED

- docs/pilot/connection-profile.md finns
- Commits 99cc30e och 11441cc finns i git log
