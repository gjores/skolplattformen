# 05-14 — rootens avgränsade granskning

Granskad kod 43c91fa. Detta är rootens egen kod-/bevisgranskning, inte en separat agents oberoende granskning eller ett mänskligt begriplighetsgodkännande.

- Stegbyte till Granska utkast skickar inget API-kommando. saveDraft avvisar ett edit-kommando före granskning. Sammanfattningen kommer från exakt samma draft.refs/pin/startedOn som programplanCommand; Tillbaka ändrar bara presentationssteget. Gamla jämförelse-/osäkerhetslägen behåller sina uttryckliga kommandogränser.
- Sökning filtrerar endast tillgängliga nivåer från befintlig exakt katalogprojektion. Vald men inte tillagd nivå ingår inte i refs; både förhandsvisning och granskning säger detta. Ingen totalsumma, automatisk språkvals-/nivåföljdsregel eller points-to-hours införs.
- Exakt sourceReady/boundSourceMatches, revisionskontroll, legacy-bekräftelse, servermandat/MFA/audit och faktiska omläsningar är bevarade. Formulärinmatningsfel återgår till uppgifterna utan bortfall; oklart write-svar fortsätter genom befintlig avstämning.
- Förberedaren kontrollerar lokal protected target, exakta syntetiska kund-/skolnamn, ägarskap och varje programs referenser. SQL-katalogen parsas på sin råa kontraktsgräns och integritetsverifieras före programkontroll. Inga mandat ändras; alla redan befintliga verksamhetsrader jämförs och bevaras. Hela additiva operationen är en transaktion.
- Nytt browserfall använder fem egna utbildningar under slumpad syntetisk kund. Sparning, DB-/Worker-auditpar, faktisk databasbild, omläsning och korrekt program-/inriktnings-/versionsreferens kontrolleras. Befintliga 15 fall behåller negativa skydd och samtidighetsprov; två profiler ger 32 fall. Summeraren kräver hela matrisen och cleanup.
- Handboken beskriver användarbeteendet och dess begränsningar. Testprogram, syntetiskt startdatum och GSD-status hålls i interna provdokument. Generellt skapande av utbildning/extern uppladdning, nationella beslutsregler, klasskoppling och kullkopiering öppnas inte av en additiv provsetup.

Första fulla körningen på 0ebf5de passerade 32+20 browserfall. Därefter rättades enbart singular/plural i nivåantal och linjering av steg på dator. Slutbyggets faktiska resultat anges i 05-14-SUMMARY och phase5-14-guided-verification.json efter slutförd omkörning; första råbevisen ligger separat i ignorerad web/outputs/phase5-14-guided/first-0ebf5de.
