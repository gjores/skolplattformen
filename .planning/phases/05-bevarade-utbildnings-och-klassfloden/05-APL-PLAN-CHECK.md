---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
date: 2026-10-16
status: passed_for_execution
plans_reviewed: 11
tasks_reviewed: 21
waves_reviewed: 8
blockers: 0
major_issues: 0
minor_issues: 0
code_revision: af70fb1a3993d1361e2c39b81961c3a255a1db16
---

# APL etapp 1 – oberoende plangranskning

**PASS för genomförande enligt paketets beroenden och uttryckliga körförutsättningar.** Granskningen avser [kontext](05-APL-CONTEXT.md), [kontrakt](05-APL-CONTRACT.md), [genomförandepaket](05-APL-IMPLEMENTATION.md) och de elva planerna 01–10 inklusive 04A. Ingen produktfunktion, faktisk migration eller mänsklig acceptans är verifierad genom denna plangranskning.

Planerna har lästs mot [APL-researchen](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) och aktuell kod för timplansläsning, radskrivning, autosparning, namngivna kopior, versionsskapande och beslutsprojektion. Särskilt granskades `projectPlanDecision`, de strikta parsers som omger gamla beslutskvitton och de senaste SQL-definitionerna i migrationskedjan. Äldre kodkartor räknades inte som bevis för dagens funktion.

## Genomförbarhet

| Kontroll | Resultat |
| --- | --- |
| Uppgifternas fullständighet | Alla 20 automatiska uppgifter har namn, exakta filer, åtgärd, verifiering och mätbart klartvillkor. Plan 10 har en separat mänsklig checkpoint med prov och återupptagningssignal. |
| Beroenden och vågor | Elva planer i åtta vågor. Alla beroenden finns och går till tidigare våg. Ingen cykel eller självberoende finns. |
| Filägarskap | Inga filkollisioner inom parallella vågor. Senare gemensamma verifierings-/leveransdokument är ordnade genom beroenden. |
| Referenser | Befintliga kontextfiler finns; ännu oskapade filer produceras av uttryckliga föregångare. Den tidigare obefintliga browserkonfigurationen har ersatts med en giltig referens. |
| Verifieringskommandon | Modell-/serverprov, egna Playwright-konfigurationer och föreskrivna SQL-/API-runnerkommandon är angivna. Framtida runners presenteras som implementation som återstår. |
| Målstyrning | Samtliga planer har observerbara resultat, artefakter och samband. APL1-01–08 kan följas till implementation och rätt provnivå utan att bli nya antagna pilotkrav. |
| Omfattning | Plan 04 delades i API/grants och 04A:s beslutsparsers/journal. UI-planernas extra filer är egna konfigurationer och fixturer för samma användarflöde. Plan 08 omfattar sammanhängande faktisk verifiering och förberedelse av leverans. Filantalet i sig är inte en kvarstående invändning. |

## Avgörande sakfrågor

1. **Tidsredovisning utan dubblering.** Befintliga heltalstimmar förblir totaler. APL fördelas i heltalsminuter och kontrolleras mot `totalHours × 60`. Modellen provar 690 + 690 minuter och flera ämneskopplingar. Null och överfördelning får uttrycklig hantering. 23-timmarsregeln används endast för granskade hela veckor i den stödda profilen.
2. **Korrekt osäkerhet.** Okänd utbildningsform, lärling och del-/blandveckor ger inget obestyrkt uppfyllelsebesked. Datumens ISO-veckogräns är uttryckligen endast en övre rimlighetskontroll, inte en omräkning till fullgjord eller planerad APL. Vårstart, terminsgränser och ofullständiga valblock ingår i provmatrisen.
3. **En gemensam kontraktsdefinition.** Plan 02 väntar nu på 01:s exakta typer, svarsscheman, enumvärden, hashvektorer och definition av revisionsutfall för oförändrad sparning respektive rektorsbekräftelse. SQL och TypeScript behöver inte gissa parallellt.
4. **Skilda ansvarshändelser.** Rektors beslut binds till innehållet, medan CAS använder timplansrevision. Ren submit/approve får inte ogiltigförklara granskningen. Administratörens beredning, rektors förläggning och huvudmannens fastställande provas separat på server och i SQL.
5. **Historiska kvitton.** Plan 03 och 04A bevarar gamla resultat och skiljer betrodd historisk tolkning från nya anrop. Klienten kan inte välja legacy som genväg. Befintliga inskickade äldre ärenden får en uttrycklig återkalla/återsänd-väg. Programplansbeslut får inget cirkelberoende av skolans timplan.
6. **Samordnad sparning.** Plan 05 äger APL-kommandot och rektorsknappen. Plan 06 visar resultatet och använder befintliga beslutsåtgärder. Samlat osparat/pågående/okänt läge spärrar även en redan öppen beslutsdialog. Gamla kvitton skriver inte över nyare levande data.
7. **Kopiering och identitet.** Båda timplansskapvägarna omfattas. Källplanen lämnas orörd; målplanen följer dagens rad-/terminskompatibilitet. Omatchad information bevaras som granskningsunderlag utan ogiltiga aktiva relationer. Rektorsbeslut och klasskopplingar kopieras inte. Kullkopiering behåller sin nuvarande omfattning.
8. **Bevarande och leverans.** Additiva migrationer, slutna hjälpare och exakt Workeråtkomst prövas i isolerad syntetisk miljö. Faktiska SQL-, Worker-, OIDC- och browserprov är åtskilda från simulering. Plan 09 kräver aktuell konkret leveransauktorisering och kontroll av användarmiljöns originaldata. Återställd app beskrivs inte som återställd databas.
9. **SS 12000.** Version 2024, utgåva 4/OpenAPI 2.1.0 är identifierad. Egna planobjekt förväxlas inte med `Placement` eller faktisk `Attendance`. Stabil identitet, skolrelation, giltighet och källansvar är bevarandevillkor; inget externt informationsutbyte påstås.

## Rättningar under granskningen

Före slutkontrollen förtydligades minutprecisionen, den sekventiella kontraktsöverlämningen 01 → 02, strikt legacytolkning, separata browserfixturer och gränsen mellan APL-knappen och beslutspanelen. Plan 05 skapar nu sitt browserunderlag redan före den första uppgiftens verifiering. Kopieringsformuleringen skiljer oförändrad källa från kompatibel målprojektion. Dessa fynd är åtgärdade; inga blockerande eller större öppna frågor kvarstår i planpaketet.

Granskningens sammanvägda manifestfingeravtryck är `acaeda5772d6a3b893c65ad271486987785bff9578d4c20eda29fd858394cd14`: SHA-256 över alfabetiskt sorterade rader `filnamn SHA-256\n` för kontext, kontrakt, genomförandepaket och elva planfiler. Detta identifierar planunderlaget, inte en byggd eller installerad produkt.

Godkänd riktning innebär att arbetet kan börja med plan 01. Senare bevis, installation och användarbedömning återstår. Denna PASS stänger inte etapp 2–3, de ursprungliga pilotkraven eller hela fas 5.
