# Timplaner — underlag för användarprov

Förberett 2026-10-01 efter användarens bild med tom timplanslista. Ingen mänsklig verifiering tillskrivs denna förberedelse.

De automatiska browserproven använder egna tillfälliga kunder och städar sina planer. De gav därför inget bestående underlag på användarens inloggade skola. `work/pilot/prepare-timplan-user-trial.mjs` lägger till tre separata provplaner på befintliga **Syntetisk skola 11** i **Syntetisk fas 3 kund 1**:

- Användarprov – grundskola, version 1, utkast, årskurs 7–9.
- Användarprov – grundskola, version 2, fastställd/låst provversion.
- Användarprov – introduktionsprogram, version 1, utkast, timmar per vecka.

Timvärdena är syntetiska UI-provdata och inga nationellt fastställda undervisningsplaner. Den låsta versionen är en privilegierat förberedd teststatus, inte bevis för att produktens fastställandeflöde är implementerat eller verksamhetsgodkänt. Planerna är inte kopplade till elever eller klasser.

Skriptet använder assertTarget('protected'), verifierar kund/skolnamn och ägarskap, skriver i en transaktion och utökar inga mandat. Befintliga planer och användarens senare ändringar skrivs inte över. Första körning och omkörning PASS; rektorns verkliga mandatavgränsade SQL-lista och alla tre matriser kunde läsas. Ingen reset eller migreringsändring genomfördes. Browserpresentation och faktisk celländring lämnas till användarprovet; SQL-läsningen är inte ett nytt fullständigt browserprov.

## Att pröva

### Användarresultat 2026-10-01

Användaren rapporterar: ”alla tester kring timplaner funkar”. De ovan förberedda användarproven registreras som användarrapporterat godkända för befintlig timplansvy. Enskilda provsteg, enheter och roller särredovisades inte i beskedet. Detta är inte verifiering av nationell regelöverensstämmelse, ännu ej implementerade fastställandeflöden eller hela fas 5. Beställd regelhandledning för rektor kvarstår i separat todo. Fas 4:s elevregisterprov påverkas inte.

1. Ladda om appen på http://127.0.0.1:3012/ och välj **Timplaner** som rektor på Syntetisk skola 11.
2. Öppna grundskolans **utkast, version 1**, ändra matematik för en årskurs och välj Spara ändring. Kontrollera sparat värde efter omläsning.
3. Öppna **version 2, fastställd** och kontrollera att den är en läsvy.
4. Öppna introduktionsprogrammets utkast och bedöm timmar per vecka.
5. Pröva en osparad ändring och Avbryt, samt läsbarhet på dator och telefon. Som huvudman ska planerna bara kunna läsas.

Återstående användarprov för elevregistret följs separat i 04-HUMAN-UAT.md. Att provunderlaget finns slutför inte någon fas eller checkpoint.
