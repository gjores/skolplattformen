---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: OPERATIONAL-06
status: completed
updated: 2026-10-12
requirements: [ADMIN-02, ADMIN-03, ADMIN-04, PLANERING-01, PLANERING-03, PLANERING-04, PLANERING-05]
---

# Lokal leverans och samlad verifiering

Den beställda avgränsningen är implementerad, kontrollerad och installerad på lokalport3012. Rektor/skoladministratör kan skapa beständig klass och uttryckligen välja fastställd gymnasietimplansversion och läsår. Huvudmannen kan läsa länkarna. Ny timplansversion flyttar inga klasser. Rollinkorgen prioriterar egna uppgifter, söker över hela urvalet och visar beslutsskede och 50-raderssidor. Fastställande av oförändrad programplan ger inte längre falsk ändringsvarning i timplanen.

## Färska kontroller

| Område | Resultat och bevis |
|---|---|
| Modell/server/kontrakt | 129/129 PASS, `web/outputs/operational-node.log`. Agenternas delsviter ingår, räknas inte en gång till. |
| UI dator/telefon | 56/56 PASS, `web/outputs/operational-all-ui.log`; simulerade API-svar i verkliga komponenter. Därutöver två riktade bildprov PASS och granskade klassvyer. |
| Klassdata | 56 SQL-/kontraktkontroller, 11 Node-prov samt verify/apply av210000 PASS. Se plan01. |
| Vårstart | Framåtriktad240000 skiljer utbildningens kalenderstartår från klassens första läsår. Sex SQL-prov, verify/apply och20 bevarade verksamhetstabeller PASS; `/private/tmp/class-start-calendar-{verify,apply}.json`. |
| Beslutslistor | 45 SQL-/TS-kontroller med520 extra planer och rollparitet, rollback19 tabeller PASS; separat verify/apply220000 bevarar20 tabeller. Se plan03. |
| Källinnehåll | SA25/BF25,4/4 kontroller, verify/apply230000,20 tabeller och ACL/DDL PASS; `/private/tmp/operational-source-{verify,apply}.json`. |
| Faktisk byggd Worker | BF25 och BA25 vardera18/18 API/UI PASS, `/private/tmp/class-timplan-api-{bf2,ba}.json`. Faktiska klasskommandon, mandat/MFA/CSRF, konflikt/idempotens, korrekt årslista, nyversion utan flytt, explicit byte samt auditfel med rollback. Fyra faktiska klassbilder på1440/390px granskade. Egna provdata städade,20 ursprungliga tabeller och ACL/DDL bevarade. |
| Faktisk OIDC/HTTP | Tre roller,21/21 kontrollpunkter PASS och samma14 planer/rutter/räknare/20tabeller före/efter. `/private/tmp/operational-decisions-http-{before,after}.json`. |
| Faktisk OIDC/browser | Sex läsande prov, tre roller på1440/390px PASS, `web/outputs/operational-live.json` och `.log`. Start/global Att göra, programlista, retur till inkorg och öppning av konkret beslutspanel. Inga pageerrors eller horisontell sidöverströmning. Root har visuellt granskat huvudmannens datorvy, rektorns telefonvy och BA-klassens telefonvy; klassagenten alla fyra faktiska klassbilder. |
| Typ/lint/app/handbok | PASS med kända exit0; `web/outputs/operational-{tsc,lint,build,docs}.log`. Dokumentationsbygget publiceras inte externt. |

De faktiska slutproven går mot produktbygge `0ab206494909936cd6e40135cd72fc2502e8115b`.188 produktfiler matchades bytevis vid installation, tidigare bygge bevarades och health visade fungerande skyddad workerd-runtime. `web/outputs/operational-install.json` dokumenterar överföringen. Kalenderårsrättningen240000 ligger i senare commit5ff563d och är installerad i lokalDB; den ändrar inte produktbyggets filer. Senare ändringar rör verifieringsskript och dokumentation.

Första misslyckade testförsök är bevarade: SQL520 slog i äldre projektionens timeout; ett negativt SQL-prov antog felaktigt olika skolor; första BF-API-provet förväntade GR-liknande columnId där GY-årsprojektionen korrekt använder relativt år. Korrigerade prover bevarar respektive verksamhetskontroll. Äldre UI-förväntan på dialogtext uppdaterades till den tydligare informationen om bevarade klasskopplingar. Inget av dessa första försök räknas som PASS. Oberoende granskning hittade förlorat klassnamn vid Läs om och vårstartens kalenderår/läsår; båda är rättade och provade.

## Uppmätt förbättring och kvarvarande väntan

Tre riktiga HTTP-läsningar per roll på samma14 planer gav median före→efter: huvudman4,51→3,60s, rektor4,94→0,97s och administratör10,69→3,25s. Första huvudmannaläsningen efter ändringen tog7,32s. Det är en uppmätt förbättring, men HM/admin behöver fortsatt optimering av kostsamma detaljunderlag.520-radersgränsen har verkliga SQL-bevis och UI-kontraktprov, inte en beständig520-raders HTTP-fixtur.

## Godkänd datastädning

Användaren godkände uttryckligen arkivering av exakt sex äldre testutbildningar. Förkontroll, serialiserbar rollback och faktisk tillämpning PASS. Sex utbildningar fick arkivstatus; fyra programplaner (tre utkast/en fastställd), historik och övriga59 tabellers rader bevarades. Inga timplaner, klasser eller elever hörde till urvalet. Privata backup-/verify-/applybevis: `/private/tmp/approved-fixture-archive-{backup,verify,apply}-20261012.json`. Befintliga17 programplaner utan timplan ligger kvar enligt användarens tidigare beslut. Övriga okända test-/auditankare har inte raderats. Se plan05 och inventeringen för exakt avgränsning.

## Leverans och gränser

Handbokens Programplaner/Timplaner beskriver verifierade kommandon och rollflöden. Selektiva produktcommits och migrationer är pushade till origin/master enligt stående mandat; sista dokumentationscommit fjärrverifieras vid avslut. Ingen extern driftsättning ingår.

[Oberoende verifiering](05-OPERATIONAL-VERIFICATION.md) skiljer denna färdiga beställning från fulla ADMIN-02/04, övriga skolformers beslut/klassflöden,05-22:s historiska metadataavvikelse och mänsklig fasacceptans. Verklig kommunanslutning påstås inte. Sex nya avgränsade planer redovisas separat från historiska88/100 planer och3/8 faser.
