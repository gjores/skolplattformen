---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL-UX
status: planned
date: 2026-10-16
---

# APL: årskurs och termin först

Användaren bedömer levererad APL som funktionellt bra men onödigt krånglig och väljer uttryckligen **”Årskurs och termin först; exakta veckor eller datum senare”**. Målet är att välja exempelvis årskurs 2 och vårtermin, spara och återöppna en preliminär period utan datum, veckotal eller ämneskopplingar. Läsåret visas från den frysta timplanskällan. Tidigare funktionella resultat består; begriplighetsgapet är öppet.

## Färsk kodgrund

Septemberkartorna i `.planning/codebase/ARCHITECTURE.md` och `CONVENTIONS.md` ger orientering. Aktuell kod har granskats: `web/lib/apl-plan.ts` tillåter redan tomma perioder men har ingen terminsavsikt. Dess kanoniska periodpayload har åtta fält. `protected-apl-plan.tsx` visar separata datum/läsår och varje ämnes alla terminer. `planning-year-model.ts` har rätt frysta sexterminsprojektion, inklusive vårstart. SQL har separata INSERT-vägar i `phase5_apl_plan_command` och `phase5_apl_copy_structure`. Gamla kvitton har frysta svar och journalen hashbinder exakt request.

## Minsta hållbara kontrakt

- Inför valfritt `plannedTermIndex: 0..5` på AplPeriod och nullable `planned_term_index` i `apl_plan_periods`. Fältet är planeringsavsikt, oberoende av ämne och allokering. Frånvaro betyder ej uttryckligen angivet. SQL-null ska utelämna JSON-nyckeln; JSON-null, undefined, ogiltiga heltal och okända nycklar nekas. Behåll `structured_v1` med denna valfria utökning. Äldre klienter kan dock inte läsa nya fält; samordnat appbyte måste beaktas vid leverans.
- Äldre perioders kanoniska åttafälts-array förblir exakt. Endast när nytt fält finns läggs ett nionde element `['planned_term_v1', index]` till. SQL och TypeScript måste ge identiska bytes. Gamla contentHash, beslutshashar, requestHash, journaler och frysta kvitton skrivs aldrig om. Ändrad explicit avsikt ändrar innehållshash och följer befintligt krav på ny rektorsbekräftelse.
- Årskurs och termin använder befintliga sex index; härlett läsår kommer enbart från verifierad `plan.source.startedOn`, aldrig från dagens datum eller vyns årsfilter. Vårstart får inte flytta index. Vid okänd källa visas att läsår inte kan härledas. Ingen backfill på gamla perioder och ingen tyst tilldelning när de öppnas eller sparas oförändrade.
- Preliminär period får tomt namn, null-datum och tomma contents/allocations. Läsåret kan fyllas från det uttryckliga terminsvalet. Namnlös period kan få härledd visningsrubrik, men lagra inte terminsvalet i ett fabricerat namn. Inga dummyallokeringar, hela terminens datum eller antagna veckor.
- Datum, omfattning, anteckning och ämnen kan kompletteras senare. Exakta datum och övriga befintliga krav gäller fortfarande vid rektorsbekräftelse. Kalenderveckoväljare behövs inte för detta avgränsade paket: befintliga datumfält i ett senare steg uppfyller beslutet. Datum räknas fortsatt inte om till antal hela APL-veckor.
- Terminsval är en preliminär avsikt, inte en ny regel som förbjuder äldre flerminperioder. Exakta datum och faktisk fördelning fortsätter valideras av befintliga regler. Visa eventuell skillnad mellan avsikt och preciserad förläggning och låt användaren rätta avsikten; flytta/radera aldrig datum eller minuter automatiskt. Inför inga nya generella bekräftelseblockerare utöver beslutets omfattning.
- Första vyn är liten: namn, årskurs/termin och härlett läsår. Senare precisering utvecklas vid behov. Ofullständiga bekräftelseuppgifter ska inte dominera med fel i första steget. Sparat preliminärt underlag ska ha ett tydligt sparbesked och nästa steg.
- Normalfallet väljer termin en gång. Sparad tid i andra terminer är alltid synlig och bevarad i payload. Befintlig period med flera terminer ska kunna fortsätta utan ett tvingat ensamt terminsval. Avancerad fördelning får inte gömma eller kasta befintliga värden.
- Kopiering till ny timplansversion/namngiven plan bevarar avsikten med nya period-ID:n och utan giltig rektorsbekräftelse. Befintlig synlig kopiegranskning består. Ny elevkull får ingen implicit APL-kopiering. Mandat, CAS, MFA, auditrollback, journal och replay använder befintlig kedja.

## SS 12000 och bevis

Avstämning: **SS 12000:2024 utgåva 4, publicerat OpenAPI 2.1.0**, enligt [research och primärkällor kontrollerade 2026-10-16](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md). Terminsavsikt är internt planeringsunderlag, inte en `CalendarEvent` med verkliga datum, `Placement` eller faktisk `Attendance`. Stabilt plan-/period-ID, skola/utbildning och skrivansvar bevaras. Person/Group/GroupMembership och Activity är möjliga framtida referenser; ingen extern anslutning eller verifierad standardefterlevnad tillkommer. Testa att terminsval inte skapar externa ID:n, giltighetsdatum, elevplaceringar eller närvaro.

| Lokalt kriterium | Bevis |
| --- | --- |
| APLUX-01 Endast årskurs/termin sparas och återläses | Modell, faktisk SQL, HTTP/browser |
| APLUX-02 Rätt läsår och inga fabricerade datum/timmar | Modell inklusive vårstart/okänd källa, dator/telefon |
| APLUX-03 Begripligt preliminärt och senare precisering | UI, oförändrat bekräftelsekrav, handbok |
| APLUX-04 Äldre data/hashar/kvitton/kopiering/mandat bevaras | Paritet, faktisk SQL/API och före/efter |
| APLUX-05 Exakt testad kandidat och ärlig leveransstatus | Dator/telefon, bildgranskning, app-/handboksbygge, release |

Tre planer: UX-01 modell/SQL, UX-02 UI/handbok, UX-03 faktisk integration/leverans. Ingen ny extern teknik eller obesvarat verksamhetsval behövs. Största riskerna är gamla hash-/kvittobytes, kopieringens separata INSERT och dolda äldre allokeringar. Inga produkt-, runtime-, databas- eller tidigare statusfiler ändras av denna planering.
