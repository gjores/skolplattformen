# Tydliga programplansrader med timplansstatus — 2026-10-12

Användarbeställning: visa vilka utbildningar som har timplan och lägg Skapa timplan direkt på rader som saknar timplan. Gör raderna lättare att förstå.

## Ändring

Programplaner visar fem kolumner: utbildning, skola/elevkull, programplan, skolans timplan och nästa steg. Skolvis sparad timplan får status, version, programplansversion och Öppna timplan. Om en annan programplansversion används framgår det uttryckligen. Saknad timplan får Skapa timplan för rektor/administratör när programplanen är sparad och utbildningen aktiv. Knappen öppnar befintlig underlagskontroll med exakt skola och programplansversion; inga planer skapas vid navigation. Huvudmannens läsvy, arkivering och kompletteringskontroller består. Saknad programplan eller okänd timplansstatus ger ingen skapaknapp.

Årsuppgifter och kopiering ligger under Visa detaljer. Telefon visar samma status och handlingar i kort. Öppna programplan och nästa elevkull finns kvar.

Migration 20261012160000 lägger skolvis timplansreferens på redan mandatavgränsade programrader. Samma preferens som underlagsvyn: senaste öppna plan före fastställd, annars ersatt. Finns oberoende av valt år och radens programplansversion. Andra skolors planer räknas inte; källa/skola/utbildning kontrolleras även i kontraktet. Revisionsstämpeln omfattar den nya uppgiften. Ingen ändring av verksamhetsdata, rättigheter, befintliga timplansurval eller summeringar.

## Verifiering före lokal leverans

- 62 modell-/serverprov, typkontroll och lint PASS.
- 16 isolerade browserprov på dator och telefon PASS, inklusive skapad/saknad timplan, radidentitet och huvudmannens läsvy. Första nya provet hade fel testskolnamn (Norr i stället för Nord); rättat test passerar.
- Skärmbilder av båda storlekarna granskade.
- Separat appbygge och handboksbygge PASS.
- Åtta lokala DB-urval i återställd transaktion PASS: 20 programrader bevarade, 3 med timplan och 17 utan. Fulla referenser jämförda mot lagrade skol-/utbildningsplaner, oförändrade andra rader, sidindelning/översikt/revision kontrollerade. Tio verksamhetstabeller och ägare/ACL bevarade före/efter rollback.

Installation och läsande OIDC-prov redovisas efter körning. Isolerat syntetiskt mål; ingen produktionspublicering eller ändrad krav-/fasstatus.
