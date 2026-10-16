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
- Kalendern finns inom samma DOM-gren även genom popover-portalen: disabled fieldsets omfattar också kalenderknapparna. Händelser skyddas dessutom mot skrivning om fältet blivit låst. Base UI hanterar fokus och enbart kalenderns Escape även inne i appens dialoger.
- 17 befintliga datumpositioner i åtta vyer har integrerats: programplaners skapande, metadata och kopiering; läsår; tillstånd; loggfilter; mandat; elevplaceringar. Guideagenten integrerar APL-vyns ytterligare två. Inventering med dubbel-/enkelcitat och dynamiska type-props visar ingen annan datumimplementation i app/components. Den enda kvarvarande konkreta `type=date` finns i den gemensamma komponenten.
- `calendar-date.ts` använder lokala kalenderdelar, aldrig `new Date(isoString)` eller UTC-serialisering av valda dagar. ISO-veckans år beräknas separat. Stabilt servervärde och befintliga SS 12000-relaterade giltighetsintervall ändras inte; veckonummer innebär ingen APL-omfattning.

## Verifierat

- 3/3 datumhelperprov: exakt tur/retur i Europe/Stockholm, America/Los_Angeles och Pacific/Kiritimati, sommar-/vintertidsbyten, skottår, ogiltiga/partiella datum, inklusiva gränser och ISO-årsskifte.
- 6/6 isolerade browserprov, en arbetare och inga retries: dator Chromium/Stockholm och telefon WebKit/Los Angeles. Kalendern väljer 2027-01-01 exakt med vecka 53 (2026); FormData behåller datumet och inget sparas förrän formulärets sparknapp används. Manuell inmatning, extern värdeuppdatering, månad/år, tömning, min/max, required, disabled/readOnly/fieldset samt dialogens tangentbord, Escape och fokus är prövade.
- Separat syntetisk preview på 5196; ingen databas eller aktiv 3012 användes. Första provet korrigerades eftersom DayPicker avsiktligt gör veckodagsrubriker aria-hidden (veckorader har läsbara etiketter) och 4 januari kräver nästa månad. Slutkörningen passerade utan retries.
- Bilder `/private/tmp/date-picker-desktop.png` och `/private/tmp/date-picker-phone.png` visuellt granskade: kalendern ryms inom bredden, svenska veckodagar och ISO-veckor är tydliga, åtgärder syns.
- 24/24 befintliga programplankopieringsprov passerar på dator och telefon i syntetisk preview 5195: senare startdatum, tangentfokus, exakt kopieringskommando, konflikter, återhämtning och rektors skolurval. Skyddad API/databas eller verklig identitetsanslutning simuleras inte som verifierad av komponentproven.
- Typkontroll och avgränsad lint passerar. Root gör samlad verifiering, kandidatbygge, verkligt isolerat flödesprov och eventuell lokal leverans efter det samlade APL-arbetet. Denna sammanfattning innebär inte att ny version redan kör på 3012.

## Privata provutdata

- `/private/tmp/date-picker-preview-final.log` samt `/private/tmp/date-picker-ui-results.json`
- `/private/tmp/date-picker-copy-regression.log`
- `/private/tmp/date-picker-tsc.log`, `/private/tmp/date-picker-lint.log`
