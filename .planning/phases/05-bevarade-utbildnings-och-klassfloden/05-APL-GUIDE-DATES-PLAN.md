---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-GUIDE-DATES
type: execute
status: executing
autonomous: true
---

# APL-handledning och gemensamma datumväljare

Beställt 2026-10-16. Användaren bekräftar att autofördelningen fungerar och efterfrågar tydlig handledning om APL-regler och hur appen stödjer efterlevnad, samt bättre datumväljare med veckonummer överallt. Godkännandet avser rapporterad funktion, inte alla delprov eller full fasacceptans.

## Avgränsning och kontrakt

- GUIDE-01: Verifiera aktuella regler mot Skolverket, gymnasieförordningen och Arbetsmiljöverket. Tydlig omfattning: appens stödda skolförlagda Gy25-yrkesprogram. Förklara15veckor,23h/GUT-vecka, ämnesinnehåll, rektors beslut, huvudmannens ansvar, arbetsmiljö/handledning/uppföljning. Lärling, delveckor och andra skolformer får inga generella gröna besked.
- GUIDE-02: Tillgänglig stegvis guide i APL-planeringen, också i läsläge, med konkreta appnamn och exempel. Skilj lagregel, appkontroll och manuell skyldighet. Ingen ny attest/checkruta eller falsk efterlevnadsstämpel. Handbok med källor och länkar. Befintliga datum-/omfattningskontroller och beslutsmandat består.
- DATE-01: Gemensam datumkomponent för samtliga faktiska datumfält i appen: APL, programplaners start/kopiering, läsår, elevplaceringar, mandat, tillstånd och loggfilter. Svensk kalender med måndagsstart och ISO-veckonummer, månads-/årsval, tangentbord/fokus, manuell inmatning, tömning där tillåtet, tydligt valt datum/vecka. Befintliga ISO-datumvärden, gränser, required, disabled och formulärfel bevaras. Inga klockslag/tidszonsförskjutningar införs.
- DATE-02: Kalenderveckor är datumhjälp; antal kalenderveckor är inte automatiskt APL-omfattning. Ingen automatisk omräkning eller ändring av läsår/termin/APL-minuter. Årsskifte, skottår, datumgränser, tomt värde, programmatisk uppdatering och låsta fält verifieras.
- VERIFY-01: Relevant modell/UI, dator/telefon, regressionsprov för berörda skyddade formulär, typ/lint, dokumentationsbygge, separat skyddat kandidatbygge och faktiskt användarflöde innan lokalt appbyte. Ingen aktiv dist-ombyggnad eller ny migration. Versionshantera och pusha avgränsat; bevara andra ändringar.

## SS 12000

SS12000:2024 utgåva4/OpenAPI2.1.0 enligt projektets dokumenterade avstämning. UI-datum är oförändrade kalenderdatum YYYY-MM-DD; befintliga giltighetsintervall för mandat, placeringar och utbildningsstart behåller betydelsen. Veckonummer är endast presentation. APL-guide beskriver intern planering; inga CalendarEvent/Attendance/Placement skapas och ingen anslutningskompatibilitet påstås. Verifiera att vald dag blir exakt samma servervärde även vid ISO-årsgräns och olika browser-tidszoner.

## GSD-våg och ägarskap

Oberoende arbete enligt execute-phase: datumagent äger gemensam datumkomponent och alla datumfältsintegrationer utom APL-vyn; guideagent äger APL-guide, APL-vyn och handledningen; verifieringsagent förbereder faktisk kandidatkontroll. Root samordnar kontrakt, granskning, slutprov, lokal leverans och planeringsstatus. APL-vyn kopplar datumkomponenten efter stabilt kontrakt. Kontrollpunkter hanteras med konkreta testresultat inom redan beställd omfattning; inga nya databas-/mandatbeslut.

## Senare designstyrning från användaren

2026-10-16 visade användaren två Plan Digital-bilder, den senare med kolumnrubriker: HT/VT och separat APL för varje årskurs, plus APL-andel och summa. Önskat arbetssätt är timmar per ämne/år först och perioder senare. Detta kräver en egen förändring av timplanens tidsmodell; nuvarande HT/VT-värden är totaltid inklusive APL och får inte tyst byta betydelse. Års-APL får inte skapas genom fabricerade perioder eller godtycklig terminsplacering. Separat APL-ANNUAL-plan konkretiseras innan den delen genomförs.

Datumkomponenten och den källbelagda regelhandledningen färdigställs som en avgränsad bas för befintlig app. Handledningen beskriver verifierbart nuvarande beteende tills årsmodellen faktiskt är införd; den nya arbetsgången får ingen falsk leveransstatus. Den nya timtabellen ska behålla åtskillnaden mellan poäng och undervisningstimmar och uppdatera handledningen tillsammans med funktionaliteten.
