---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
plan: CLASS-COHORT-10
status: pending
updated: 2026-10-15
trial_readiness: pending_synthetic_preparation
human_result: not_requested
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Utkast till avgränsat användarprov

Provet är ännu inte redo att erbjudas. Sex faktiska dator-/telefonfall och leverans av samma testade bygge på3012 har passerat. Förberedelse av den egna syntetiska utbildningen återstår. Inget mänskligt utfall är insamlat och ingen ny användaracceptans påstås. Det här dokumentet är provunderlag för fortsatt arbete, inte en uppmaning att börja prova nu.

Syftet är att bedöma tidig klassbildning och om utbildningens startdatum, klassens första läsår och planeringens valda läsår är begripliga. Tidigare godkända prov av kullkopiering ska inte upprepas. Automatiserad status och bevisgränser finns i [VERIFICATION](05-CLASS-COHORT-VERIFICATION.md) och [08-SUMMARY](05-CLASS-COHORT-08-SUMMARY.md).

## Förutsättningar före erbjudandet

| Förutsättning | Status |
| --- | --- |
| Installerad SQL436 och separat faktisk samtidighet7 | Verifierat delresultat; proveniens och begränsningar i08-SUMMARY. |
| Verklig lokal Worker/API med OIDC/MFA30 | Verifierat delresultat; exakt cleanup och bevarande kontrollerade. |
| Riktade Node41, typ/lint och skyddat bygge | Verifierat delresultat. |
| Sex actual-fall och granskade bilder på dator/telefon |6/6 PASS,14 granskade bilder. |
| Handbok och samma prövade bygge på3012 med läsande OIDC-kontroll |09 PASS; produkt88145bc,201 filer. |
| Egen syntetisk vårkull och privat återöppningsjournal | Förberedelseskript finns; ingen mutation eller objektförberedelse är genomförd. |
| Privata direktlänkar till programplansutkast och fastställd timplan | Tillkommer först efter godkänd09-leverans och kontrollerad10-preparering. Inga objekt-ID:n eller konton lagras här. |

Den planerade fixturen ligger i den befintliga syntetiska skolan med dess befintliga skolmandat. En ny separat utbildning får en fastställd programplan v1, en fastställd timplan och programplansutkast v2 med samma startdatum. Den ska initialt ha noll klasser och noll klass-/timplanskopplingar. Användarens äldre utbildningar, versioner, elever och länkar ska bevaras. Prepareringen är syntetisk och ersätter inget prov av inloggning eller mänskligt beslut.

## Det datumexempel som ska kunna förstås

| Uppgift | Förberett värde | Betydelse |
| --- | --- | --- |
| Utbildningens start och nya klassers giltighetsstart | 15 januari2028 | Exakt startdatum. Inget slutdatum antas. |
| Klassens första läsår | 2027/2028 | Vårstarten hör till läsåret som började2027. |
| Valt planeringsläsår i provets ingång | 2026/2027 | Ett separat planeringsurval som inte ändrar utbildningsstart eller klassdatum. |
| Timplanens tillämpning | 2027/2028 för år1; 2028/2029 för år2 | Ett uttryckligt läsårsval vid koppling till den fastställda timplansversionen. Året före kullstart ska inte kunna tillämpas. |

Om appen behöver normalisera ett inkommande planeringsurval ska det faktiska synliga urvalet och beskedet noteras. Utkastets ingångsvärde får inte beskrivas som en observerad visning innan provet genomförts.

## Kort provtext att ge användaren när underlaget är klart

1. Öppna den privata länken till den förberedda vårkullens programplansutkast och välj ditt skoluppdrag. Öppna **Klasser för utbildningen**. Kontrollera att startdatumet15 januari2028 och första läsåret2027/2028 går att förstå och skilja från valt planeringsår.
2. Välj **Gör senare** och öppna klasssteget igen. Kontrollera att det går att fortsätta utan att utbildningen måste skapas på nytt.
3. Skapa två tomma klasser med egna tydligt syntetiska namn. Granska namn och startdatum innan du sparar. Kontrollera att klasserna finns kvar när du återöppnar utbildningen.
4. Öppna den privata länken till samma utbildnings fastställda timplan. Kontrollera att klasserna ännu saknar timplanskoppling. Öppna **Koppla klass**, välj en av klasserna och granska läsårsvalet:2027/2028 hör till år1 och2028/2029 till år2. Bedöm om tillämpningsläsåret är tydligt skilt från planeringsåret. För detta begriplighetsprov räcker det att granska kopplingen före bekräftelse.
5. Beskriv om klassflödet fungerar eller vilket steg som är oklart eller fel. Ange gärna om du använde dator eller telefon.

Om användaren redan har skapat klasser i just detta nya prov ska återöppningen bevara dem och använda en befintlig klass. Inget återställningsskript får radera mänskligt arbete för att återskapa initialt tomt läge. Huvudmannens läsläge kan visas separat vid behov; byte av roll eller en extra inloggning är inget obligatoriskt nytt acceptanskrav.

## Resultat att fylla efter faktisk leverans och mänskligt svar

| Fält | Ännu inte fastställt |
| --- | --- |
| Levererat bygge, artefakthash och leveransdatum |88145bc, artefakt5dcc159d…,2026-10-15. Se09-SUMMARY. |
| Privat prepareringsbevis och kontrollerade direktlänkar | Väntar på10:s faktiska preparering och läsning. |
| Datum då provet erbjuds | Inte erbjudet. |
| Användarens svar | Inget svar insamlat för detta prov. |
| Enhet | Inte angiven. Anta inte telefon- eller datorkontroll. |
| Begriplighet för startdatum/första läsår/planeringsår | Ej bedömd. |
| Gör senare, återöppning och tidiga tomma klasser | Ej mänskligt bedömda. |
| Tydligt läsår/årskurs vid timplanskoppling | Ej mänskligt bedömt. |
| Eventuella kvarstående problem | Fyll med faktisk återkoppling och avgränsad uppföljning. |

När samtliga tekniska förutsättningar är verifierade kan provet erbjudas och status ändras till väntan på användarsvar. Därefter registreras endast den omfattning användaren faktiskt bekräftar. Ett misslyckat delsteg kräver en avgränsad rättning; redan godkända delar ska inte upprepas utan skäl.

Provet omfattar ingen elevimport, kommunanslutning eller standardexport. SS12000:2024/OpenAPI2.1.0 är paketets dokumenterade modellavstämning, inte ett påstående om verifierat informationsutbyte. Tidigare öppna krav och full fasacceptans påverkas inte automatiskt av ett godkänt klassprov.
