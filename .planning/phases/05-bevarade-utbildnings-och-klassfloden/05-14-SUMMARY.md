# 05-14 — programplaner med tydligt granskningssteg och flera program

Status 2026-10-02: automatiskt genomförd, ny mänsklig begriplighetsbedömning väntar. ADMIN-02 och hela fas 5 är fortsatt öppna. Kod och skyddat bygge: 43c91fa1bb3fd08ac44e39cc4decbc22fb3513dc.

Användaren efterfrågar ännu mer pedagogik och vill prova andra gymnasieprogram. Vyn visar tre synliga startsteg. Nästa handling kommer före frivillig begreppshjälp. Formuläret skiljer Förbered uppgifterna från Granska och spara. Sammanfattning visar exakt utbildning, skola, startdatum och ordnade nivåer. Granska sparar inget; Tillbaka bevarar formuläret. Sökning hjälper användaren att hitta ämnen, och en nivå som endast är vald i väljaren markeras som ännu inte tillagd.

Fem befintliga syntetiska utbildningar har lagts till additivt på Syntetisk skola 11: EK25/EKEKI v4, NA25/NANAP v4, TE25/TEINM v2, ES25/ESBIF v3 och VO25 utan inriktning v4. De använder den oförändrade integritetsverifierade katalogen hämtad 2026-09-05 och känt syntetiskt startdatum 2026-08-17. Nya utbildningar saknar initialt plan för användarens eget prov. Fyra tidigare SA-exempel och alla redan sparade planer bevaras. Förberedelse och omkörning verifierar faktisk befintlig rektors-/huvudmannaåtkomst och append-only audit; de ändrar inga mandat. Vid omkörningen var 12 befintliga verksamhetsrader oförändrade.

## Faktiska kontroller

- Färsk programbrowser 32/32 (16 dator + 16 iPhone/WebKit), timplan 20/20 på samma 43c91fa: retry0, skip0, frameworkErrors0. Alla 52 egna provgrafer städade. Program 1093/38 och timplan 302/26 audit/ankare bevarade. Fem-programsfallet sparar och läser om varje egen exakt referens och ordnad fördjupning genom Worker/SQL på båda profilerna.
- 27 relevanta Node-prov: katalog, skyddade UI-hjälpare, preparer och browserharness. Typkontroll, lint och skyddat bygge PASS. Ändrad användarhandbok byggd med PASS; texten är oförändrad efter implementationen b5024b6.
- Två egna visuella läsfixturer, fyra bilder per profil: introduktion, arbetsyta, förberedelse och granskning. Ingen verksamhetsmutation eller horisontellt överflöde, noll egna restgrafer/sessioner/mandat/triggers/functions. Bilder granskade av root. Emulering är inte ett fysiskt telefonprov eller mänskligt begriplighetsbesked.
- Vanlig 3012 återställd utan NODE_OPTIONS/preload eller debugnivå. Root, faktisk Worker/DB-hälsa och lokal IdP-discovery 200. Current-verifieraren läser alla nio utbildningarnas verkliga nuvarande status för rektor/HM genom 26 auditerade läsningar med obligatoriska DB-/Worker-par. Före-/efterbild identisk; endast egna tillfälliga lässessioner städade.

Första fulla omgången 32+20 på 0ebf5de passerade också. Efter visuell granskning justerades singular/plural och linjering; nya fulla prov avser slutbygget ovan. De första råbevisen finns separat i ignorerad web/outputs/phase5-14-guided/first-0ebf5de. Första preparerförsöket avvisades eftersom kontrollen förväntade sig serverprojektion på rå SQL-katalog. Transaktionen rullades tillbaka. Rättningen parsar råkontraktet och verifierar hela DB-katalogens fingerprint före exakt programkontroll; senare prepare/rerun PASS. Avvikelsen redovisas i phase5-14-trial-preparation.json.

## Återstående prov och gränser

Ladda om 3012, välj rektorsuppdrag Syntetisk skola 11 och Programplaner. Skapa ett utkast för ett nytt program med underlag 2026-09-05 och syntetisk start 2026-08-17; sök/lägg till, granska, gå tillbaka, granska/spara och ladda om. Bedöm själv om vägen och begreppen är begripliga. Tidigare mänsklig UX-bedömning är inte godkänd. Nytt resultat registreras först efter återkoppling.

Detta inför fler provutbildningar, ingen generell utbildningsskapande-UI eller extern underlagsuppladdning. Ingen ny rättighet, kataloguppdatering, nationell poängram, fastställande, klasskoppling eller kullkopiering. Fas 4:s separata checkpoint och tidigare previewavbrotts rotorsak kvarstår. Inget previewavbrott observerades i dessa omgångar; ingen orsaksfix påstås. Se 05-14-REVIEW, användarprovet och maskinrapporterna phase5-14-guided-* samt trial-preparation.
