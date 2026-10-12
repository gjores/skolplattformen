---
phase: 05-bevarade-utbildnings-och-klassfloden
status: passed-local-supported-profile
requirements: [ADMIN-02, ADMIN-04]
---

# Beslutskedja och uppgifter per roll — verifiering

2026-10-12. Användarbeställd kedja från programutkast till fastställd programplan och skolans fastställda timplan. Uppgifter och beslut ska vara synliga i hela appen för huvudman, rektor och skoladministratör.

## Faktiska resultat

| Kontroll | Resultat och gräns |
|---|---|
| Kontrakt/modell/server | 53 relevanta Node-prov PASS. Sista riktade kontrakt-/adapterkörning 12/12 PASS. Två prov av aktiveringsgrinden PASS. |
| SQL och oberoende TypeScript-projektion | 34/34 PASS, först med reparationsmigration inom rollback och sedan mot installerat skick. Båda kedjorna med återsändning/rättning/fastställande, fryst utkastkälla efter oförändrat programbeslut, mandat, låsning, revisionskonflikt, replay och auditrollback. |
| Faktisk skyddad utvecklings-Worker | 19/19 PASS genom riktiga HTTP-anrop och PostgreSQL, egna syntetiska sessioner. MFA, CSRF, fel roll/skola, kontext/revision, båda beslutskedjorna och Worker-auditfel. |
| Privata DB-kontrakt efter aktivering | 11/11 PASS med full rollback. |
| Isolerad UI på dator/telefon | Sex rollprov PASS. Slutliga åtta riktade filter-/besluts-/källbytesprov PASS. Tidigare timeouter och upptäckta testförväntnings-/React-key-/checkboxfel bevarade i lokala rapporter och omprovade efter rättning. |
| Typ/lint/app/handbok | PASS efter sista berörda ändring. |
| Lokal installation | Bygge `50fe0133ffb238009580f0743e7a15e772353e8c` installerat på 3012; 183 filer bytejämförda med separat slutbygge. Föregående bygge bevarat. |
| Vanlig lokal OIDC på levererat bygge | PASS för huvudman, rektor och administratör på 1440/390 px. Indikator, Start, korrekt rollantal, navigation från Programplaner och exakt beslutspanel verifierade utan planskrivning. Inga pageerrors/horisontellt överflöde. |
| Slutbyggd API-kedja | 19/19 PASS genom samma installerade bygge på 3012, med riktiga HTTP-anrop och PostgreSQL. Båda returkedjorna och slutbesluten, auditrollback, städning, identiska ACL/fingerprints samt alla 19 bevakade tabeller verifierade. |

## Levererat beteende

- Global **Att göra** och Start visar aktivt uppdrags uppgifter för alla läsår, antal egna beslut och nästa roll. Rollbyte återställer uppgifterna och länk öppnar exakt version och skola.
- Rektor skickar programplan. Rektor/skoladministratör skickar timplan. Huvudman granskar, återsänder med skäl eller fastställer. Huvudman kan även fastställa beslutsklart programutkast direkt.
- Sparat underlag, automatisk analys och manuella granskningspunkter krävs. Inskickade och fastställda planer är låsta. Återsända planer kan rättas. Osäkra svar kan återförsökas utan dubbla beslut.
- Tidigare versioner, frysta underlag, gamla beslut och klasskopplingar bevaras. En ny version flyttar inte klasser automatiskt. Timplanslistan visar fortfarande endast skapade planer.

## Bevarande, avvikelser och kvarstående omfattning

De 15 etablerade verksamhetstabellerna och fyra nya beslutstabellerna jämfördes med fulla rader och tidsstämplar före/efter verifiering. Funktioner, ACL, policies, triggers och migrationsjournal hade identisk fingerprint efter rollback/API-städning. Säkerhetsloggen behåller provens händelser och identitetsankare; detta är inte identiska rader i alla publika tabeller.

Foundation 180000 installerades med stängda Worker-grants. Det upptäckta PL/pgSQL-variabelfelet rättades framåtriktat i 180100. Efter verifierad riktig Worker-preflight öppnade 181000 exakt tre beslutsfunktioner; privata helpers och tabeller förblev stängda.

Högskoleförberedande Gy25 är den verifierade beslutsprofilen. Yrkesprogram/okänd profil blockeras, GR/IM får ingen ny beslutskedja här. Manuell granskning av möjliga elevval och lärarledd tid krävs. Programplan måste fastställas före elevkullens start. Skyddat skapande av klass och explicit klass–timplanskoppling återstår. Se [genomgång av luckor](05-DECISION-GAPS.md).

Dator/telefon betyder automatiserad browser med respektive viewport, inte fysisk mobil eller mänsklig begriplighetsacceptans. Lokal syntetisk IdP/API är inte en verklig kommunanslutning. CAS provades med gamla revisioner, inte ett parallellt databasrace. Fulla ADMIN-02/04 och fas-/pilotacceptans kvarstår.

## Lokala bevisfiler

Körningsloggar och bilder är ignorerade lokala artefakter: `web/outputs/decision-live.json`, `decision-live-*.png`, `decision-ui-verification-2026-10-12.json`, `decision-contract-api-final.log`, `decision-tsc-release.log`, `decision-lint-release.log`, `decision-build-release.log`, `decision-docs-release.log`. Privata DB-/API-bevis finns under `/private/tmp/plan-decision-*.json`. Inga sessionstoken eller inloggningshemligheter förs in i versionshanteringen.

Två första lokala OIDC-prov avbröts vid planeringslistans femsekunders standardväntan. Samma produktkod passerade alla sex roll/viewport-kombinationer med 45 sekunders testväntan. Det är inget löfte om normal svarstid; inkorgens och listornas kostnad bör följas upp enligt gaprapporten.
