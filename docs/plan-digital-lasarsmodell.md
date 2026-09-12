# Plan Digitals läsårsmodell — observationer och vad de betyder för appen

2026-09-12. Läsande granskning av academedia3.plandigital.se (Kreativa Gymnasiet Nyköping, läsrättigheter) tillsammans med kartläggningen i `~/dev/playwright/plandigital-spec` (april 2026). Inget ändrades i Plan Digital. Detta är underlag för en kommande fas, inte ett beslut.

## Observerat

**Läsåret är linsen.** Väljaren `‹ 26/27 ›` (15/16–30/31, värde = startår) sitter i toppraden och styr alla vyer. Varje läsår har egen status med lås: 26/27 *Timplansarbete pågår*, 27/28 *Ej påbörjad* (skrivskyddad). Statusflödet per läsår enligt kartläggningen: Planering pågår → Tjänstefördelning pågår → Publicerad → Stängd → Arkiverad.

**Timplanen är en kull-matris.** `Timplan: SU26`: läroplan Gy25, program, period 2026–2029, tidsenhet timmar per termin, poäng 2500, trädnivå Bastimplan (nivå 1; max tre nivåer: bas → inriktning → fördjupning), kopplade grupper `SU26`, egen status (åtta steg: Arbetslagsledare arbetar … I bruk → Passerad). Sex terminskolumner T1–T6 märkta med riktiga terminer (HT26 VT27 | HT27 VT28 | HT28 VT29). Rubriken ovanför räknas om efter valt läsår: *Pågående läsår, åk 1 | Nästa läsår, åk 2 | Framtida år, åk 3*. Rader grupperade i Gymnasiegemensam, Programgemensam, Inriktning, Programfördjupning, Gymnasiearbete, I-VAL, med Poäng, Tid, per termin, Summa, Diff. Summor per termin, per år (759 / 825 / 787,5 h) och veckotid per termin (÷ 35,6 veckor).

**Årskurs härleds.** Listan *Timplaner* har kolumnen *Nuvarande åk* (= läsår − startår + 1) och flikarna *Aktuella (22) / Framtida (0) / Arkiverade (26)*. Klasslistan är läsårsberoende: i 27/28 fanns 25- och 26-klasser men inga 24-klasser. Separata timplaner finns för `IVAL26` (individuellt val) och `Omläsning26`.

**Tjänstefördelningen är snittet läsår × kull.** `Grupp: SU26` i 26/27 visar timplanens åk 1-rader med kolumner HT26/VT27, Schemalagd tid, Arbetstid, lärarsignatur med behörighetsmarkör (L / ⭐ / –), samläsning ("Visa 1 rad"), summa 800 p / 714 h / 20,1 h per vecka och en sammanfattning (1 klass, 8 lärare, 8 kurser, 8 ämnen, 1 timplan, 1 årskurs). Samma klass i 27/28 visar åk 2-raderna (HT27/VT28, 950 p, 825 h) utan lärare, eftersom det läsåret inte är påbörjat.

## Jämförelse med appen i dag

| Plan Digital | Appen |
|---|---|
| Globalt läsårsval med status och lås per år | Inget läsårsval; *Läsår & skoldagar* är en kalender per skolenhet (`school_years`) |
| Kull = `startår` (heltal), namn `SU26` | `offerings.cohort` är fritext ("Elever som börjar HT 2026"); året tolkas ur strängen i `copy_offering_cohort` |
| Timplan: sex terminskolumner, år-summor, veckotid | `ar1/ar2/ar3` (gymnasium), `ak1..ak9` (grundskola), `vecka` (IM); ingen HT/VT-delning |
| Årskurs härleds ur läsår − startår | `class_timplans` kopplar klass → timplan + kolumn för hand |
| Aktuella/Framtida/Arkiverade ur läsåret | `status planerad/aktiv/avvecklas` sätts för hand |
| Tjänsterad per läsår med lärare, tid och behörighet | Finns inte |
| Kopiering till ny kull ≈ ny timplan med nytt startår | `Kopiera till ny elevkull` gör motsvarande (poängplan + timplan, nytt beslut krävs) |

Kullkopieringen är alltså rätt sak; det som saknas är linsen.

## Förslag: läsårslins i appen

1. **`start_year` som riktigt fält på utbildningen** (heltal), med `cohort`-texten härledd. Migration + återfyllning ur befintlig text.
2. **Läsårsväljare i sidhuvudet** som kontext för alla huvudmanna- och rektorsvyer: `‹ 26/27 ›`, med läsårsstatus och lås. Status per läsår och skolenhet lagras (Planering pågår → Tjänstefördelning pågår → Publicerad → Stängd → Arkiverad) och styr skrivrätt tillsammans med rollen.
3. **Härledd årskurs och listflikar.** `åk = läsår − start_year + 1`; Aktuella (1 ≤ åk ≤ antal år), Framtida (åk < 1), Arkiverade (åk > antal år). Ersätter den manuella statusen som primär sortering.
4. **Terminskolumner i timplanen.** Gymnasiet: T1–T6 med läsårsmärkta rubriker (HT26/VT27 …) och rubrikraden *Pågående läsår, åk N*; grundskolan behåller årskurser men märker den kolumn som gäller valt läsår. Summa per termin, per år och veckotid ur läsårets skolveckor (vi har redan skoldagar per läsår — veckotalet kan räknas därifrån i stället för att vara en konstant).
5. **Automatisk klass → timplan-koppling** ur klassens startår och utbildning; `class_timplans` blir en override för undantag (omläsning, individuell studiegång, byte av inriktning), inte normalvägen.
6. **Tjänsterader per läsår** som eget objekt (kurs × klass × lärare, schemalagd tid, arbetstid, behörighetsmarkering, samläsning) — det steg som gör vyn *Grupp: SU26* möjlig. Hänger på uppdragsmodellen i fas 3 och behörighets-API:t i den öppna todon.

Ordningen 1–3 är liten och ger omedelbart "ställa sig i ett läsår". 4–5 är timplansarbete. 6 är en ny modul.

## Att kontrollera innan bygge

- Hur Plan Digital hanterar en klass som byter timplan mitt i utbildningen (inriktningsval år 2) — trädnivån antyder att klassen kopplas till bas + inriktning, inte byter.
- Exakt veckotal (35,6) — konstant per skola eller räknat ur läsårets kalender.
- Hur *Nuvarande åk* i den nya timplanslistan förhåller sig till valt läsår; vid granskningen ändrades inte kolumnen när läsåret byttes till 27/28, vilket kan vara en cache eller att den nya vyn räknar från dagens datum.
