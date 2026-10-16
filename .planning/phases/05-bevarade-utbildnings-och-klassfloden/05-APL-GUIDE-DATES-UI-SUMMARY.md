---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-GUIDE-DATES
part: DATE-01/DATE-02
status: verified_component
---

# Gemensamma datumväljare

## Levererad kod

- `web/components/ui/date-picker.tsx` och avgränsad CSS återanvänder installerade Base UI Popover och React DayPicker 9.8.1. Kalendern är svensk, börjar måndag och visar ISO-veckonummer. Månad och år väljs direkt; dagens datum, valfri tömning och explicit stängning finns. Vald dag och ISO-veckoår visas också vid årsskifte.
- Native `input type=date` behålls för manuell inmatning, giltiga `YYYY-MM-DD`/tomsträng, min/max, required, namn/FormData, disabled/readOnly och befintliga formulärfel. Ingen partiell text skickas till läsårsmodell eller giltighetsmandat. Kalendern ändrar endast samma kontrollerade fältvärde; inga sparanrop eller omfattningsberäkningar tillkommer.
- Kalendern använder Base UI:s standardportal och ett explicit fokusmål. Intern portalplacering i datumfältet visade sig konkurrera med yttre dialogens fokusåterställning på dator; standardportalen löser detta utan timer. En observer bevakar disabled på samtliga överordnade fieldsets och stänger kalendern när input.matches(':disabled') blir sant, med respekt för native legendundantag. Observern kopplas bort när kalendern stängs. Triggern behåller native fieldsetlås och valhändelser kontrollerar låset igen innan ett värde lämnas vidare.
- 17 befintliga datumpositioner i åtta vyer har integrerats: programplaners skapande, metadata och kopiering; läsår; tillstånd; loggfilter; mandat; elevplaceringar. Guideagenten integrerar APL-vyns ytterligare två. Inventering med dubbel-/enkelcitat och dynamiska type-props visar ingen annan datumimplementation i app/components. Den enda kvarvarande konkreta `type=date` finns i den gemensamma komponenten.
- `calendar-date.ts` använder lokala kalenderdelar, aldrig `new Date(isoString)` eller UTC-serialisering av valda dagar. ISO-veckans år beräknas separat. Stabilt servervärde och befintliga SS 12000-relaterade giltighetsintervall ändras inte; veckonummer innebär ingen APL-omfattning.

## Verifierat

- 3/3 datumhelperprov: exakt tur/retur i Europe/Stockholm, America/Los_Angeles och Pacific/Kiritimati, sommar-/vintertidsbyten, skottår, ogiltiga/partiella datum, inklusiva gränser och ISO-årsskifte.
- 10/10 isolerade browserprov, en arbetare och inga retries: dator Chromium/Stockholm och telefon WebKit/Los Angeles. Kalendern väljer 2027-01-01 exakt med vecka 53 (2026); FormData behåller datumet och inget sparas förrän formulärets sparknapp används. Manuell inmatning, extern värdeuppdatering, månad/år, tömning, min/max, required, disabled/readOnly/fieldset samt dialogens tangentbord, Escape och fokus är prövade. Dynamiskt fieldsetlås medan kalendern är öppen stänger popupen utan värdeändring. Faktiska logg- och mandatkomponenter i syntetiska fixtures skickar ingen request vid datumval; först uttrycklig Visa/Tilldela skickar exakt rätt datum. Alla 19 datumkomponenter har via AST-inventering kontrollerats ligga utanför label-element; fyra logg-/mandatwrappers rättades med bibehållen layout.
- Separat syntetisk preview på 5196; ingen databas eller aktiv 3012 användes. Första provet korrigerades eftersom DayPicker avsiktligt gör veckodagsrubriker aria-hidden (veckorader har läsbara etiketter) och 4 januari kräver nästa månad. Slutkörningen passerade utan retries.
- Bilder `/private/tmp/date-picker-desktop.png` och `/private/tmp/date-picker-phone.png` visuellt granskade: kalendern ryms inom bredden, svenska veckodagar och ISO-veckor är tydliga, åtgärder syns.
- 24/24 befintliga programplankopieringsprov passerar på dator och telefon i syntetisk preview 5195: senare startdatum, tangentfokus, exakt kopieringskommando, konflikter, återhämtning och rektors skolurval. Skyddad API/databas eller verklig identitetsanslutning simuleras inte som verifierad av komponentproven.
- Typkontroll och avgränsad lint passerar. Första faktiska körningen bevaras i /private/tmp/apl-guide-dates-actual-01.json som FAIL: en separat referensfunktion i scenariot väntade fel vecka för 2028-01-01 eftersom den räknade från kl12 med avrundning uppåt. Produktkalendern visade korrekt vecka52. Referensen rättades till UTC-midnatt och kontrollerades mot fyra kända ISO-årsskiften. OIDC, runtime och schema-only-databas är bekräftat städade. Root gör ny samlad verifiering, kandidatbygge, verkligt isolerat flödesprov och eventuell lokal leverans efter det samlade APL-arbetet. Denna sammanfattning innebär inte att ny version redan kör på 3012.

## Privata provutdata

- `/private/tmp/date-picker-wrappers-verified.log` samt `/private/tmp/date-picker-ui-results.json`
- `/private/tmp/date-picker-copy-regression.log`
- `/private/tmp/date-picker-wrapper-tsc-final.log`, `/private/tmp/date-picker-wrapper-lint-final.log`

## Separat observation

Mandatdialogens befintliga tillgängliga namn saknades i en komponentpreview trots synlig DialogTitle. Datumprovet avgränsar därför den befintliga dialogen via dess synliga rubrik och comboboxarnas tillgängliga namn. Ingen generell dialogombyggnad har gjorts i datumrättningen.

## Faktisk isolerad verifiering 2026-10-16

- Kandidat `c02e6000b7b2d27654adec67668932acc4f8ef12`, artefakt SHA-256 `118a34b275c3101565bd32a80e6c796465bc7050fdd8cb00edbb939e3271e390`, 210 filer, verifierades via riktig OIDC, Worker på 3014 och egen syntetisk schema-only-databas. Ingen DDL eller ändring av aktiv 3012 ingick.
- Körning 04 passerade 8/8 kontroller, fyra vardera på dator Chromium/Stockholm och telefon WebKit/Los Angeles, utan retries. Rektor läser regelguiden, väljer datum med ISO-veckor, sparar och läser tillbaka samma ISO-datum och period-ID. Årskurs, termin, läsår, okänd APL-omfattning och timplanens timmar bevaras. Huvudmannen läser guiden utan redigeringsrätt. Felgrinden kräver inga pageerrors under hela login- och planeringsflödet.
- Samtliga 14 skärmbilder är visuellt granskade. Telefonens återläsningsbild visar terminsdelen; datumvärden längre ned verifieras av DOM, API-svar, återläsning och SQL. Guiden bryts inom telefonbredden och rullas vertikalt. Kalendern visar svensk månad/år och ISO-vecka 52 vid 2028-01-01.
- Schemafingeravtryck före/efter/källa är identiska; produkt, verifieringskällor och artefakt är oförändrade under körningen. OIDC-städning är komplett med åtta verifierade callbacks; runtime och databasstädning är kompletta.
- Original: `/private/tmp/apl-guide-dates-actual-04.json`, SHA-256 `513ab87be1bbaffc064ff3b011bc6a630d9853c0e182a6d1008aa1ae05ef027a`. Separat granskningskopia: `/private/tmp/apl-guide-dates-actual-04-reviewed.json`, SHA-256 `7b19ace26ad7392f481b63cd9b46b66410f7e411cb08778141b49c3670c0cc7f`. Original och tidigare felbevis är orörda.
- Körning 02 bevaras som FAIL efter en testselektor som felaktigt krävde exakt labeltext trots inbäddade selectalternativ. Två selectfält använder nu comboboxarnas tillgängliga namn, enligt befintliga APL-prov. Körning 03 bevaras som FAIL trots åtta passerade verksamhetskontroller: WebKit rapporterade ett sessionsfel vid täta navigeringar. Körning 04 väntar synlig arbetsyta och avslutad nätverksaktivitet före nästa avsiktliga navigation, binder fel till fas och behåller den strikta felgrinden utan undantagslista. Alla misslyckade körningar städades komplett.
- Root ansvarar för efterföljande lokal preflight och leverans. Detta bevis avser syntetiska data och är ingen extern SS 12000-anslutning eller bekräftelse på genomförd APL.
