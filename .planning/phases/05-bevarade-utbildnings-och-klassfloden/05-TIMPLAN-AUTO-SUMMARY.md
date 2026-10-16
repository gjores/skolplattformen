---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-AUTO
status: locally_delivered
completed: 2026-10-16
user_trial: awaiting_user
---

# Autofördelning av undervisningstid

Användarens beställning 2026-10-16: total timmar i modal, information om GUT och autofördelning motsvarande programplanerna. Detta är ett avgränsat tillägg inom fas 5, med delbevis för ADMIN-02/04 och PLANERING-01. Ursprungliga 42 pilotkrav, 88/100 planer och 3/8 faser ändras inte.

## Beteende och beslut

Dialogen frågar efter total undervisningstid för hela planen, visar känd Gy25-GUT och marginal/underskott och ger ett förslag för alla sex terminer. Förvalet behåller befintliga timmar inklusive uttryckliga nollor; användaren kan uttryckligen välja att fördela om alla timmar. Ny granskning föregår sparandet. Programplanens poäng ger vikter, inte en rättslig ämnesnorm.

Sparad APL-tid reserveras inom totalen, avrundad uppåt per ämnes-/terminscell. Återstoden fördelas proportionellt med deterministisk heltalsavrundning och 2 000-timmars celltak. Totalen blir exakt. APL-plan, klasskopplingar och identifierare ändras inte. Okända profiler får ingen gissad GUT. En total under GUT markeras men kan sparas som utkast.

Servern räknar om förslaget och använder befintliga radfunktioner i en gemensam transaktion. Mandat, skola, MFA, ursprung, kontext och revision kontrolleras. Ett radfel eller saknad obligatorisk audit återställer hela skrivningen. Klienten kontrollerar svar och återläst plan; okänt resultat ger manuell läsning och ny granskning, aldrig automatisk återsändning. Databasens struktur ändras inte.

## Genomförda kontroller

- Modell och server: **90/90 PASS** (`gym-timplan-distribution`, `gym-timplan`, `apl-plan`, serverns timplan/APL). Modellens exakta summa, avrundning, bevarade nollor, APL-golv och kapacitet samt serverns atomiska skrivning/återställning och skydd.
- Komponentflöden: **24/24 PASS**, dator och telefon, simulerad API. Se [UI-redovisningen](05-TIMPLAN-AUTO-UI-SUMMARY.md) för slutliga prov och tidigare fixture-/assertionsrättningar.
- Typkontroll, full `oxlint app lib`, separat skyddat bygge och dokumentationsbygge PASS. Dokumentation byggd men inte publicerad.
- Leveransverktyg: **88/88 PASS**, därav 19 nya code-only-prov och 69 befintliga APL-leveransprov (inklusive befintliga 48 underprov). Oberoende kodgranskning utan blockerare. Ett återställt misslyckat code-only-byte kräver särskild återhämtningsverifiering före nytt försök.
- Produktcommit `a55a15a2d05f59bcda4bf71621e18c03fffa89dd`. Separat privat bygge, 210 artefaktfiler, SHA-256 `3cdd9dc6a6717ac06cc6afc3b3a9cd9ba304e6a2213a6b6d3eadd51a2d1ee952`. Körande bygge berördes inte av byggkommandot.

## Faktisk Worker/OIDC-verifiering

Slutlig körning 02: **14/14 PASS**, riktig Worker, PostgreSQL och OIDC på isolerad 3014. Dator och telefon passerar total/GUT, bevarad nolla och 17 timmar, exakt 2 800 timmar trots årsfilter, återläsning/omladdning, uttrycklig omfördelning till 2 900 och huvudmannens inaktiva skrivknapp. API-proven passerar payload/skola/mandat/ursprung/kontext/CAS, APL-golv och oförändrat APL-underlag, spärr för fastställd plan, observerat andra-radsfel med full återställning, obligatoriskt auditfel med full återställning, verklig MFA/step-up, två samtidiga skribenter (200/409 och exakt vinnarmatris) samt återkallat mandat.

391 produktkällor och 56 verifieringskällor oförändrade under provet. Samma 210-fils artefakt. 17 observerade OIDC-callbacks; OIDC, separat runtime och schema städade. Schemafingerprint före/efter exakt `a2dffcfe42f2930b16ee9b70ec48a452a45ef7f6018e35e22538d1095364b216`. Inga levande verksamhetsrader kopierades. Samtliga sex skärmbilder granskade av root: läsbar total/GUT och granskning, vertikal rullning på telefon med tillgänglig sparknapp, inget sidspill.

Rårapport `/private/tmp/timplan-auto-actual-02.json`, SHA-256 `6047940b4600b2629d868b129c436d6a89d47a82094bc6aae0e67dab303d6732`. Granskad kopia `/private/tmp/timplan-auto-actual-reviewed.json` binder rårapport och skärmbilder; rårapporten ändrades inte.

| Lokalt kriterium | Resultat |
|---|---|
| AUTO-01 exakt summa och alla aktiva terminer | Modell + faktisk dator/telefon/API PASS |
| AUTO-02 befintliga värden/nollor och APL | Modell + faktisk bevarande-/APL-kontroll PASS |
| AUTO-03 GUT och dialog | 24 komponentprov + faktisk dator/telefon + bildgranskning PASS |
| AUTO-04 atomisk skrivning, mandat och återhämtning | Serverprov + faktisk andra-rads/auditrollback, MFA/CAS/samtidighet PASS |
| AUTO-05 exakt testad lokal kandidat | Exakt 210-fils kandidat på3012, läsande OIDC och bevarande PASS |

## Diagnostik före slutprov

Faktisk körning 01 passerade nio kontroller (dator, telefon, API-mandat/CAS, APL-bevarande och spärr för fastställd plan) men stoppades av testverktygets felinjektionsräknare. PostgreSQL tillåter inte en anslutning att använda en annan sessions tillfälliga sekvens (0A000), även via den aktuella triggern. Orsaken reproducerades i en separat egen schemakopia. Testet använder därefter ett unikt provobjekt i den isolerade databasens public-schema som tas bort efter kontrollen. Ingen produktändring eller aktiv databasändring gjordes. Rårapporten och diagnosen bevarades; OIDC, runtime och båda schemakopiorna städades verifierat före nytt prov. Oberoende granskning av rättningen fann inga blockerare.

## Lokal leverans och användarprov

Code-only-förkontroll och överföring **PASS**. På3012 kör produktrevision `a55a15a2d05f59bcda4bf71621e18c03fffa89dd`, exakt samma 210-fils artefakt som faktisk-provet. Ingen migration eller DDL. Schema, privat konfiguration och samtliga 71 kontrollerade verksamhetstabeller är identiska före/efter. Befintlig rektor kunde logga in med riktig OIDC/MFA och läsa mandat, timplan och APL. Provets egen session städad; äldre sessioner, audit och verksamhetsdata bevarade. Föregående artefakt finns sparad för återställning.

Privata bevis (inga rådata i Git):

- Läsande förkontroll: `/private/tmp/timplan-auto-delivery-verify.json`, SHA-256 `6213648a7632e847077df5b35bd161992b4d31c90068f594f61d8f64f0c6865f`.
- Leverans: `/private/tmp/timplan-auto-delivered.json`, SHA-256 `774e65fea321c8f212ac32053effd852070101655e41501d6c6cf5aa324f3f33`.
- Granskad faktisk-provsrapport: `/private/tmp/timplan-auto-actual-reviewed.json`, SHA-256 `f9abed160928032ee60782b06fb6a11258536e694067a4896052a4091c57700d`.
- Läsande lokalt OIDC-bevis: SHA-256 `e426af4d808a64d88b8ca5960bcde0b5cb58dc8bb98fe2c7b8aa110040bd7de2` (exakt sökväg i leveransbeviset).

Mänskligt begriplighetsprov **awaiting_user**: ladda om3012, öppna eget timplansutkast och välj **Autofördela timmar**. Ange total, kontrollera GUT och bevarandeläge, välj **Granska fördelning → Spara fördelning**. Kontrollera totalsumma och ämnesbehov. Teknisk leverans avslutar genomförandeplanen; användarens acceptans antas inte.

## SS 12000 och gränser

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 enligt planens avstämning. Intern planerad undervisningstid, utan nya standardobjekt eller informationsutbyte. Stabila identifierare och explicita klassrelationer bevaras. Automatiska prov är inte mänsklig begriplighetsacceptans, genomförd APL eller verifierad kommunanslutning. Tidigare APL-UX-användarprov och övriga fasluckor kvarstår.
