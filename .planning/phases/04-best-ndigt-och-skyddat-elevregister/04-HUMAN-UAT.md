# Fas 4 — mänskligt användarprov

Status: **Första provdelen och källavvikelse bekräftade; UI-/datumanmärkningar och återstående moment kvarstår.** Plan 04-22 är inte slutförd.

## Underlag och miljö

Förberett 2026-09-29. Lokal skyddad förhandsvisning: http://127.0.0.1:3012, byggd apprevision `892352916dcccbbf9b2019c41ddfc9a98082f991`. Samma appversion passerade den fulla automatiska fasgrinden 2026-09-29 och separat handboksbygge enligt `04-21-SUMMARY.md`. Planeringsrevision före denna förberedelse: `a1f2daa`.

Det isolerade protected-målet återskapades med projektets förberedelseskript, 42 migrationer och därefter fas 3-/fas 4-browserfixturer. Fas 4-fixturen rapporterade 62 syntetiska elever, giltig skyddsbehörighet och simulerad källa. Detta är miljöförberedelse, ingen ny fullständig fasgrind eller mänsklig granskning.

Lokala Chromium-fönster förbereds med syntetisk skoladministratör och sökning på Alex Prov. Datorvy 1440 × 900, smal telefonvy 390 × 844. Telefonvyn är Chromium med smal visningsyta, inte fysisk telefon eller nytt WebKit-prov. Faktiskt använd enhet/browser och datum ska fyllas i efter användarens återkoppling. Inloggningsuppgifter läses enbart ur privata lokala fixturfiler och sparas inte här.

## Provväg och observationer

| Moment | Att bedöma | Faktiskt mänskligt resultat |
| --- | --- | --- |
| Namnlika elever | Sök Alex Prov, skilj eleverna åt, öppna kort, ändra en uppgift och hitta den efter ny inloggning. | Första provdelen bekräftad; ny inloggning inte uttryckligen bekräftad. |
| Klass och utbildning | Pröva klassbyte till annan utbildning; bedöm datum, förklaring och historik. | Anmärkning: klassperioder och datum upplevs oklara; ännu inte godkänt. |
| Samtidig ändring | Två administratörer ändrar samma uppgift; bedöm konfliktmeddelandet och det uttryckliga valet. Separata inloggningar förbereds vid detta moment. | Väntar |
| Källavvikelse | Öppna Kommunkälla Provperson; bedöm källvärde, lokalt värde och valet mellan dem. Källan är simulerad. | Användaren bekräftade 2026-09-29: ”det andra testet funkade med källorna”. Exakt valt alternativ inte specificerat. |
| Skydd | Huvudmannen tilldelar och återkallar skyddsbehörighet; administratör utan denna ser anonym vy. Rollsessionerna förbereds vid detta moment. | Väntar |
| Export och personnummer | Markera ett urval, granska exportdialog och uttryckliga val. Bedöm separat visning av personnummer och eventuell förnyad verifiering. | Exportdialog bekräftad i första provdelen; separat personnummervisning inte bekräftad. |
| Dator och telefonvy | Bedöm om listan, kortet och dialogerna är begripliga och går att använda. | Första provdelen klar, men användaren begär samlad UI-genomgång: ”ser för taskigt ut”. |

## Återkoppling 2026-09-29

Användaren svarade ”klart” på instruktionen att skilja Alex Prov åt, öppna och ändra ett kort, kontrollera lista/historik samt pröva exportdialogen i dator- och telefonvy. Inga fel rapporterades. Svaret registreras som återkoppling på den presenterade första provdelen, utan att tillskriva användaren ytterligare observationer. Ny inloggning, separat personnummer­visning och de fyra återstående scenarierna är inte uttryckligen bekräftade. Faktiskt använd browser/enhet har inte specificerats av användaren. Den omgivande browserinformationen visar localhost:3000, vilket i sig inte belägger vilket provmål som granskades. Användaren preciserade därefter: ”De tre första momenten är klara”. Namnlika elever, ändring/historik och exportdialog i de presenterade vyerna är därmed bekräftade utan rapporterade problem; övriga moment väntar.

Användaren visade därefter klasstillhörighet med tidigare, aktuell och två kommande perioder och frågade om datumen. Bilden visar angränsande framtida perioder, men aktuell rad saknar synligt slutdatum och samma kommande klass visas i två perioder. Orsaken till perioddelningen är inte verifierad; inget databasfel fastställs enbart utifrån bilden. Tekniska provnamn och informationshierarki gör vyn svårläst. Samlad UI-genomgång följs i todo `2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md`; datumpresentationen är även en kvarstående anmärkning i detta användarprov.

Efter förklaring av den simulerade källans syfte bekräftade användaren: ”ok det andra testet funkade med källorna”. Detta gäller källavvikelseprovet, inte faktisk SPAR-/Skatteverksanslutning eller hela fasens godkännande.

## Fortsättning

Användarens konkreta observationer eller godkännande av det prövade beteendet är återupptagningssignal enligt planens `checkpoint:human-verify` med `gate="blocking"`. Registrera vad som faktiskt prövades; ett allmänt fortsättningskommando ersätter inte resultatet. Rapporterade problem dokumenteras och rättas före förnyat prov.

Efter användarprovet återstår separat `gsd-verify-work` och fasverifiering. Inget här godkänner verkliga elevuppgifter, kommunanslutning, identitetsleverantör eller pilotdrift.
