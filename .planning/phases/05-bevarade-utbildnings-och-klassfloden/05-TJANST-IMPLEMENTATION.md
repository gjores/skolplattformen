# Avtalsgrund, tjänstefördelning och rektors bedömning — genomförande

Datum: 2026-10-16. [Oberoende plancheck: PASS](05-TJANST-PLAN-CHECK.md). Status: **planerat, inte implementerat**. Planpaketet hör till befintlig fas 5. Aktivt APL-arbete och pilotens 42 krav/åtta faser behålls. Den här beställningen gäller planering, inte start av implementation.

## Målet

Huvudmannen kan välja flera kollektivavtal och följa resursläget. Rektor fördelar undervisning och andra uppgifter, bedömer varje tjänst med dokumenterade skäl och fastställer den version läraren får se. Hela tjänsten har en sammanhängande tidsbudget som inte fördubblas vid samläsning, mentorskap eller arbete på flera skolor.

Läs [användarbesluten](05-TJANST-CONTEXT.md), [gemensamt kontrakt och acceptanskriterier](05-TJANST-CONTRACT.md), [aktuell kodinventering](05-TJANST-DISCOVERY.md) och [källresearch](../../research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md). [Verifieringsmatrisen](05-TJANST-VERIFICATION.md) är ännu ej genomförd. [Användarprovet](05-TJANST-USER-TRIAL.md) genomförs först efter tekniskt verifierad leverans.

## Omfattning

- Huvudmannens valbara avtalsprofiler, centrala/lokala versioner, giltighet och individuell tillämpning.
- Person, anställning, sysselsättningsgrad och skoluppdrag, skilda från systemmandat.
- Tjänsterader från klassens exakta timplansversion, vakanser, samläsning och andra arbetsuppgifter inklusive mentorskap.
- Individuell bedömning, dokumenterade skäl, lag-/avtalskontroller, dialog och korrekt undantagsprocess.
- Rektors fastställande/publicering, lärarens egenvy och huvudmannens uppföljning/åtgärder.
- Årskopiering, flytt och massregistrering med förhandsvisning och atomär lagring.

Första automatiska bedömningsstödet gäller stödda Gy25-gymnasiefall. Okänd avtalsgrund eller blandad regeltillämpning ger utkast och kompletteringsbehov. Fullt schema och faktiskt utfall ingår i senare T3/T4; här visas ”Underlag saknas”. Plan Digital-import, BIA-export, lön, myndighetsregister och faktisk SS 12000-anslutning är separata spår.

## Genomförandeordning

<!-- PLAN_TABLE_START -->

28 planer i 14 vågor. Samtliga har status planned.

| Våg | Plan | Leverans |
|---|---|---|
| 1 | [TJANST-01](05-TJANST-01-PLAN.md) | Person, anställning och perioder |
| 1 | [TJANST-02](05-TJANST-02-PLAN.md) | Avtalsprofiler och tidsregler |
| 2 | [TJANST-01A](05-TJANST-01A-PLAN.md) | Eget lärarmandat och personbindning |
| 2 | [TJANST-03](05-TJANST-03-PLAN.md) | Undervisningsbehov, samläsning och kapacitet |
| 2 | [TJANST-04](05-TJANST-04-PLAN.md) | Beständig personal- och avtalsgrund |
| 3 | [TJANST-03A](05-TJANST-03A-PLAN.md) | Individuell bedömning och beslutsregler |
| 3 | [TJANST-04A](05-TJANST-04A-PLAN.md) | Skyddad egenåtkomst utan elevrättigheter |
| 3 | [TJANST-05](05-TJANST-05-PLAN.md) | Beständig tjänstefördelning och kapacitetslås |
| 4 | [TJANST-06](05-TJANST-06-PLAN.md) | Bedömning, samordnad ram och fastställande |
| 4 | [TJANST-07](05-TJANST-07-PLAN.md) | API för personal och avtal |
| 4 | [TJANST-07A](05-TJANST-07A-PLAN.md) | Serverläst uppdrag i session och kontextbyte |
| 5 | [TJANST-07B](05-TJANST-07B-PLAN.md) | Mandatgränssnitt och negativa åtkomstprov |
| 5 | [TJANST-08](05-TJANST-08-PLAN.md) | API för tjänst, bedömning och egenvy |
| 6 | [TJANST-09](05-TJANST-09-PLAN.md) | Sammanhållen SQL-/API-verifiering |
| 7 | [TJANST-10](05-TJANST-10-PLAN.md) | Personalvy och gemensamt tjänsteskal |
| 7 | [TJANST-15](05-TJANST-15-PLAN.md) | Regler för kopiering, flytt och massregistrering |
| 8 | [TJANST-10A](05-TJANST-10A-PLAN.md) | Huvudmannens avtalsval |
| 8 | [TJANST-11](05-TJANST-11-PLAN.md) | Rektors tjänstefördelning |
| 8 | [TJANST-15B](05-TJANST-15B-PLAN.md) | Atomisk lagring av års- och massändringar |
| 9 | [TJANST-12](05-TJANST-12-PLAN.md) | Rektors bedömning och fastställande |
| 9 | [TJANST-15C](05-TJANST-15C-PLAN.md) | Skyddad API för års- och massändringar |
| 10 | [TJANST-13](05-TJANST-13-PLAN.md) | Lärarens egen tjänst och dialog |
| 10 | [TJANST-14](05-TJANST-14-PLAN.md) | Huvudmannens uppföljning och åtgärder |
| 10 | [TJANST-15A](05-TJANST-15A-PLAN.md) | Gränssnitt för års- och massändringar |
| 11 | [TJANST-16](05-TJANST-16-PLAN.md) | Samlad produktkoppling och handbok |
| 12 | [TJANST-17](05-TJANST-17-PLAN.md) | Verkliga flödesprov på dator och telefon |
| 13 | [TJANST-18](05-TJANST-18-PLAN.md) | Kontrollerad lokal installation och bevarande |
| 14 | [TJANST-19](05-TJANST-19-PLAN.md) | Användarprov och avgränsad acceptans |

<!-- PLAN_TABLE_END -->

Plan-ID:n är paketlokala. SUMMARY-filer skapas vid genomförandet; de finns inte som verifieringsbevis vid planeringen. Planernas `depends_on` och `wave` är styrande. När flera planer ligger i samma våg kan de köras parallellt om de inte delar skrivfiler. Samordnaren uppdaterar paketstatus och planöversikt sekventiellt efter varje kontrollerad del; parallella agenter ska inte skriva gemensam STATE eller göra överlappande Git-commits.

## Kravspårning och verifiering

| Lokalt kriterium | Genomförande | Bevis som krävs före avslut |
|---|---|---|
| TJ1-01 avtal | 02,04,07,10A | Modell/SQL/API, minst två verkligt olika granskade profiler, versions-/giltighetsprov och HM-vy |
| TJ1-02 person/kapacitet | 01,03,04,05,07,10 | En person/två skolor, deltid/periodbyte, verklig konkurrens i09/17 |
| TJ1-03 behov/samläsning | 03,05,08,11 | Exakt klasskälla, två klasser/en lärare och en klass/två lärare, bevarad elevtid |
| TJ1-04 hela uppdraget | 02,03,05,11 | Uppgift × tidsform, mentorskap/PU/APL, okänt kontra0, ingen budget/schemaaddition |
| TJ1-05 bedömning | 03A,06,08,12 | 120-procentsregeln, individuellt tak, deltid/avrundning, ändrat underlag och skäl |
| TJ1-06 beslut/egenvy | 06,08,12,13,14 | Rektor fastställer atomärt, HM följer upp, historik och rätt publicerad version |
| TJ1-07 undantag | 03A,06,08,12,13 | Eget initiativ på delad dialogversion, spoofing nekat, skilda11§grunder, återkallelse |
| TJ1-08 årsrutiner | 15,15B,15C,15A | Nya utkast/ID:n, ingen kopierad beslutsgiltighet, atomisk flytt/batch/kapacitet |
| TJ1-09 mandat/integritet | 01A,04A,07A,07B,07,08,09,15C | Direkt SQL/HTTP-nekande, self utan elevmetadata, audit/CAS/status/återkallelse |
| TJ1-10 begriplighet/standard | 10–16,17,19 | Dator/telefon, handboksbygge, källor/enheter och dokumenterad SS12000-mappning |

09 verifierar backend i isolerad riktig SQL/Worker; sessionsmetoden redovisas exakt. 17 bygger vidare på samma verifieringsrunner och lägger till faktisk OIDC/MFA och fulla dator-/telefonflöden. 18 verifierar lokal överföring av exakt samma bygge med originalbevarande. 19 avser mänsklig begriplighet. Modellprov, simulerade UI-svar, faktisk lokal HTTP, mänskligt prov och extern anslutning är olika bevisnivåer.

## Genomföranderegler

Gör färsk inventering före implementation: APL och andra fas5-paket kan ha ändrat källor sedan planen skrevs. Ta senaste kompatibla bas och reservera lediga migrationsnamn, utan att redigera redan installerade migrationer. Anpassa verifieringsinventeringen till faktisk installerad bas; utgå inte från historiska tabellantal eller grants.

Domänmodellernas TDD låser tidsmatematik, identitet och beslutsregler. SQL måste därefter passera samma vektorer. API-planernas många filer är tunna routefamiljer; varje uppgift har avgränsat ägarskap och högst fem filer. UI byggs i separata komponenter och samlas först i16. Gemensamma läs-/skrivgränser, `commandId`, strikt parsning och beslutshash får inte omtolkas i varje vy.

Privata provrapporter får bara använda syntetiska personer. Schema-only-isolering ska styrkas; ingen kopia av aktiva person-/elevrader och inget reset av aktivt mål. Lokalt migrations-/appbyte förbereds först som en exakt granskningsbar ändring; befintligt användarmandat återanvänds när det täcker åtgärden. Ingen automatisk extern publicering ingår.

Varje färdig relevant kontrollerad plan versionshanteras separat och aktuell gren pushas enligt stående godkännande. Kontrollera commiturval och fjärrens SHA. Blanda inte in parallellt APL-arbete. Vid delvis leverans uppdateras lokala kriterier med faktisk provnivå; fulla pilotkrav eller fas5 markeras inte klara enbart av paketet.

## Nästa steg

Efter plancheck är första genomförandevågen TJANST-01 personalgrund och TJANST-02 avtals-/tidsregler. Denna planeringsbeställning startar inte vågen. APL:s aktuella uppdrag i STATE står kvar.
