---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "18"
subsystem: protected-programplan-terms
status: complete
completed: 2026-10-04
requirements: [ADMIN-02]
requires: [05-16]
human_result: awaiting_user
worker_build_revision: d37f566b3575623171e07ef3150f16d55c6f14ed
---

# 05-18 — poäng per årskurs och termin

Användarens todo om årskurser/terminer är implementerad. Terminsfunktionen är automatiskt verifierad lokalt med syntetiska uppgifter; mänskligt begriplighetsprov väntar. Full fas 5 och ADMIN-02 är inte godkända genom denna delplan.

## Leverans

I en underlagsbunden programplan finns **Årskurser och terminer** med tre årskurskort, höst-/vårsummor och återstående poäng. **Fördela poäng** öppnar ämnes-/nivårader och sex terminsfält. På telefon visas vald årskurs med höst/vår bredvid ämnet. Rader grupperas efter programdel och visar fördelat/återstående; explicita spara/avbryt används. En 100-poängsnivå kan delas 50/50. Ofullständig fördelning får sparas; negativa tal, decimaler och överfördelning stoppas.

Fördelningen lagras med exakt programplansversion och samma revisionsräknare som fördjupningen. SQL härleder giltiga rader ur pinad katalog/basis och kontrollerar mandat, session, låsordning, CAS och obligatorisk audit. Fastställda/ersatta versioner är skrivskyddade. Versionsklon bevarar fördelningen; borttagning av en fördelad fördjupningsnivå kräver uttrycklig rensning först. Konflikt visar aktuell/egen fördelning; okänt writesvar läses tillbaka före ytterligare write. Osparat skydd och kontext-/mandatrensning bevaras.

Huvudman och rektor använder nuvarande mandat. Alternativa ämnen och underlag utan precisa nivåer väljs inte automatiskt; deras poäng ingår inte i fördelningssumman. Individuellt val och gymnasiearbete har ramrader, inte färdiga elevval. Poäng är inte undervisningstimmar. Skoladministratörens delegation och skapande av timplan från godkänd/fastställd programplan kvarstår i separata todos. Kopiering till helt ny utbildning bevarar ännu inte terminsfördelningen; versionskloning inom utbildningen gör det.

## Verifiering och bevisgränser

- Modell/kontrakt/server: 417/417 Node-prov PASS. Modeller och serverkällor oförändrade sedan denna körning. Browserharnessens slutna räknings-/proveniensprov 4/4 PASS efter uppdatering till befintliga 20 programplansfall.
- SQL: 236/236 kontroller PASS (nya 29, tidigare 108+31+18+50). Exakt 15 Worker-entrypoints, helpers och direkta klienter fortsatt stängda. Grant tillämpad endast lokalt efter återställd preflight-ACL.
- API: tidigare fulla preflight 31, final 31 och programplansregression 48 PASS; sju kontrollerade app/server/migrationshashar matchar slutkällan. Kompletterat releaseprov på d37f566 och vanlig 3012: 31/31 PASS, inklusive självständig klonändring och rensning av en enda rad med övrig fördelning bevarad. Originalverksamhet bytebevarad och båda egna fixturer städade.
- Browser: nya terminer 16/16 PASS på `d1f34ca`, verklig Worker/SQL, egna fixturer och exakt source/build. Full programplansregression 40/40 PASS på d1f34ca. Timplansregressionens alla 20 beteenden har passerat på d37f566 över fullkörning 19 + riktat omprov 1. Status är PASS_WITH_SETUP_FAILURES; det är inte en ren fullkörning 20/20. Endast API-/timplansprovharness ändrades mellan dessa två byggen; `git diff d1f34ca d37f566 -- web/app web/lib supabase/migrations` är tom. Produktkällorna är alltså exakt desamma, men byggrevisionerna redovisas separat.
- Typkontroll, lint, skyddat bygge och Docusaurus-handbok PASS. Dokumentationskällan är oförändrad sedan lyckat dokumentationsbygge.
- Fyra slutliga terminsbilder granskade på dator/WebKit. Grupper, summeringar och tre siffror ryms. Pekytor/inmatning minst 44 px på telefon; inget dokumentoverflow. Detta är automatisk emulering och kod-/bildgranskning, inte mänskligt godkännande på fysisk telefon.

API-paritet gäller den faktiska SA25-fixturen; den är inte en uttömmande nationell regelkontroll. Exakta rapporter: `work/pilot/results/phase5-18-*`. Oberoende verifiering: `05-18-REVIEW.md`. Backendens migrations-, ACL-, rollback-, audit- och bevarandebevis: `05-18-BACKEND-VERIFICATION.md`. Framgångswrite är verklig; enbart negativa transportfel injiceras i browser.

## Rättningar under verifieringen

- Radparitetens numeriska subjectVersion normaliserades så giltigt JSON 1.0 ger samma nyckel som TS 1. Alla tidigare programplansrader bytebevarades vid helperrättningen.
- Första kontraktsförslaget utökade terminsrepliken med källrader. Slutkontraktet är separat `{planId,revision,status,distribution}`; UI använder verifierad pinad katalog och kräver samma version/basis/nivåer i separat planläsning. Planen dokumenterar avgränsningen; SQL är skrivningens auktoritet.
- Mobilens colspan-grupp höll kvar osynliga terminskolumner. Separata grupperade celler gav plats för fälten; ärvd inputpadding begränsades så hela 100 syns. Faktisk mått-/textbreddkontroll och bildgranskning tillagda.
- Tidig programregression upptäckte att termins-preflight dolde tidigare CAS 409 och att global hasUnsaved hindrade övergång efter godkänd nyutbildningssave. Preflight behåller gamla CAS vid olika revision; enbart verifierad nyssskapadplan använder intern forceövergång. Vanlig navigation skyddar osparat. Nekad session stoppar nu redan terminsläsningen; prov väntar korrekt på denna route.
- Den äldre harnessen räknade 19 fast 20 programplansfall redan fanns. Räknare och strikt negativt harnessprov uppdaterades till 20. Initial FAIL med 30 pass / 8 fail / 2 ej körda bevaras i `phase5-18-programplan-browser-initial.json`; sista uteblivna fall stoppades av versionsgrinden efter påbörjade källrättningar.
- Oberoende review fann en andra analysingång som kunde unmounta osparad terminsedit. Båda analysknappar låses under terminsedit; nya dator-/telefonprov 02 verifierar detta och återöppning efter avbryt.

- Tidigare timplansfall 08 väntade på en programväljare som ersatts av startlistan före denna uppgift. Provet följer nu startlista → gymnasieutbildning → skyddad underlagsläsning. Initialt 18/20 PASS bevaras. En senare körning hade 19/20 PASS med timeout under phone beforeEach, före UI. Alla 19 färdiga fixturer städades och separat DB-läsning fann 0 kvarlämnade kunder med fixturens egen markör efter att provprocessen avslutats; inga data raderades för att gå vidare. Samtliga FAIL-rapporter och riktat omprov bevaras separat.

- Första kompletterade API-release hade 29/31: partial-draft fick transporttimeout (executable23), följande CAS-snapshot fick FAIL; samtliga nya klon-/rensningskontroller och cleanup/bevarandebevis passerade. FAIL bevaras. Ny full 31 på färsk Worker/vanlig 3012 passerade utan ändrade produktkällor, timeouts eller provvillkor.

## Överlämning

Vanlig 3012 kör det nya skyddade d37f566-bygget, temporär 3058 är avslutad. Mänskligt prov finns högst upp i `05-PROGRAMPLAN-USER-TRIAL.md`. Öppna en bunden utkastsversion, fördela 100 poäng över två terminer, spara och läs om; bedöm sedan telefonvyn. Mänskligt resultat är awaiting_user. Tidigare begriplighetsFAIL, fas 4:s checkpoint och full fas 5-färdigställning kvarstår. Ingen verklig kommunanslutning eller pilotdrift verifieras här.
