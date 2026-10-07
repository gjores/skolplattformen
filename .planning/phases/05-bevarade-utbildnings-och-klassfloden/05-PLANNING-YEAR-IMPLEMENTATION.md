---
phase: 05-bevarade-utbildnings-och-klassfloden
topic: planning-year
created: 2026-10-06
status: in_progress
plans: ["05-36", "05-37", "05-38", "05-39", "05-40", "05-41", "05-42", "05-43"]
requirements: [PLANERING-01, PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
worker_build_revision_at_planning: 5dd7baf0fc0bd92d7b61f07e01020cef791e0908
---

# Genomförande: läsåret som sammanhang för planeringen

**Aktuellt delresultat:** [05-36-SUMMARY](05-36-SUMMARY.md) och [oberoende verifiering](05-36-VERIFICATION.md) är klara: ren modell/läskontrakt med 70 Node-prov, 20 oberoende prober och typ/lint PASS. 05-37 är därefter tillämpad/verifierad som stängd SQL-foundation, se [SUMMARY](05-37-SUMMARY.md) och [inventering](05-PLANNING-YEAR-FUNCTION-INVENTORY.md): 93 SQL/18 paritet/3 lås både före/efter apply. Nästa plan 05-38 är inte startad. API/UI i 05-38–43 och samtliga fulla PLANERING-krav kvarstår. Detta index beskriver både beställd planering och faktiskt avgränsad leverans. Läs [samtalsbesluten](05-PLANNING-YEAR-CONTEXT.md) och [färsk kodinventering](05-PLANNING-YEAR-DISCOVERY.md) före utförande. Planeringen bygger vidare på fungerande programplaner, skolvisa frysta gymtimplaner och direkt terminsinmatning; den ändrar inte det prövade bygget på 3012.

[Plangranskningen är klar](05-PLANNING-YEAR-PLAN-CHECK.md): åtta planer och 21 uppgifter har kontrollerade beroenden, avgränsningar och verifieringssteg. Inga granskningsfynd kvarstår. Detta bekräftar planens kvalitet; genomförande och verksamhetsprov återstår.

## Avsett resultat

Planeringen får ett gemensamt skol- och läsårsval, som följer med mellan årsöverblick och program-/timplansvyer. Elevregistret behåller eget årsurval. Planeringsåret 2027–28 visar både nya och fortsättande kullar, reella eller synligt saknade planunderlag, sökbara/sorterbara tabeller och rätt relativa matrisdel. Grundskolan följer explicita klass-, läsårs- och versionskopplingar samt en verifierbar originalkolumnkarta. Saknas kartan visas årets timmar som okända och osäker cellsparning spärras. Introduktionsprogram behåller veckotid utan en antagen treårsmodell.

Byte av läsår är ett urval. Det ändrar inga statusar, beslut, fastställda versioner, klasskopplingar eller elevplaceringar, och dagens verkliga mandat gäller för historiska/framtida år. Inga framtida studieplan-/grupp-/tjänst-/schemafunktioner byggs i första leveransen; bara deras kontrakt till schemaprojektets S1/S3.

## Paketets planer och beroenden

| Plan | Wave inom paketet | Uppgifter | Leverans och viktig gräns |
| --- | --- | --- | --- |
| [05-36](05-36-PLAN.md) | 1 | 2 | **Genomförd**, se SUMMARY/VERIFICATION. Ren läsårs-/snittmodell och strikt kontrakt. Januaristart, frysta datum, null/0 och GR/IM; inga DB-anrop. |
| [05-37](05-37-PLAN.md) | 2 | 3 | **Genomförd**, se SUMMARY/VERIFICATION. Stängda SQL-projektioner: 93 SQL/18 paritet/3 lås före/efter apply; 15 helradstabeller/ACL/journal bevarade. Inga nya Workergrants. |
| [05-38](05-38-PLAN.md) | 3 | 3 | Tre läsrutter i Worker, riktig temporär preflight med exakt återställning, därefter tre exakta permanenta läsgrants och samma slutmatris. |
| [05-39](05-39-PLAN.md) | 4 | 2 | Separat session-/uppdragsbunden planeringskontext, egen URL och kontextrad; elevregistrets år består. |
| [05-40](05-40-PLAN.md) | 5 | 3 | Verklig årsöverblick, gemensam sök/filter/sort/pagination och program-/gymtimplanstabeller. |
| [05-41](05-41-PLAN.md) | 6 | 3 | Rätt relativår i program/gymmatris, hela originalindex och osparat-/korsårssparskydd. |
| [05-42](05-42-PLAN.md) | 7 | 2 | Tabell för grundskola/introduktionsprogram och rätt års-/kolumn-/versionsöppning, utan automatiska nya klasskopplingar. |
| [05-43](05-43-PLAN.md) | 8 | 3 | Samlad seriell verifiering, handbok och S1/S3-kontrakt; verkligt användarprov separat. |

Beroendekedja: `05-36 → 05-37 → 05-38 → 05-39 → 05-40 → 05-41 → 05-42 → 05-43`. Alla är automatiskt körbara när deras faktiska föregångare är genomförda; åtta waves beror på delade kontrakt, filer och samma isolerade DB-underlag. Detta är en selektiv komplettering inom fas 5, **inte en instruktion att köra alla fasens planer med samma wave-nummer**. Generisk execute-phase på hela fas 05 kan träffa äldre 05-25 eller andra replan_required-planer. Välj uttryckligt endast det här paketets plan-ID:n och följ dess beroenden. Saknad SUMMARY i en föregångare är inte leveransbevis; kontrollera faktisk kod, källbundna resultat och tillämpad SQL.

## Varför åtta små planer

Avgränsningarna följer verkliga riskgränser: ren årsregel före data, stängd SQL före Worker, återställd preflight före grant, separat kontext före överblick och gym/GR-matriser separat. Därmed kan varje steg kontrolleras och pushas utan att färdigställa hela fas 5. Varje uppgift har högst fem implementationsfiler och varje plan har två eller tre uppgifter. 05-38/39/40/41/43 har fler än fem filer totalt genom tunna routes, delad UI-koppling och egna bevis; deras specifika omfattningsnoter håller varje uppgift avgränsad. Om en uppgift kräver ny datamodell, omfattande ombyggnad eller mer än dessa gränser, dela planen innan utförande och uppdatera beroenden/krav/index i stället för att gömma extra arbete i slutprov.

## Några precisa kontrakt

- Planeringens URL-fält är `planeringslasar`/`planeringsskola`; elevregistret fortsätter använda `lasar`/`skola`. Planparametrar, filter/sort/sida och exakta plan-ID:n bevaras vid retur/Back/reload; registerpersoner och filter kopieras inte in.
- Årsvalet 2000–2100 är ett dokumenterat produkturval för planeringen, kompatibelt med befintliga årsbindningar. Befintlig registermodell har en vidare giltighetsram och begränsas inte här. Planeringsvalet kräver ingen kalender-/elevregisterpost. Dagens läsår beräknas av serverdatum och 1 juli.
- `startAcademicYear` kommer från riktigt versionsbundet ISO-startdatum; januari–juni ger kalenderåret minus ett. `offerings.start_year` är inte en generell akademisk årsnyckel. Fritexten `cohort` och klassnamn är inte progressionskälla.
- Befintlig gymtimplan använder sitt frysta `source.startedOn` och sina frysta rader/poängterminer. En historiskt faktisk version kräver tillämpningsbevis; ett nyare/valt utkast utan årsbindning märks planeringsunderlag.
- Grundskolans `class_timplans.start_year` är dokumenterat tillämpningsläsår och `column_id` årskurs. Resolvern måste binda äldre nyckel till verkligt kund-/skol-/utbildningsbundet klass-ID, eller visa saknad/tvetydig identitet. Den ska inte byta gamla bindningar eller göra klassens registrerade startår till åk 1.
- Programramens poäng, skolans timram, antal klasser och introduktionsprogrammens veckotid hålls isär. Poäng summeras unikt per programplans-ID/version, årsindex och kanonisk rad. Timmar summeras unikt per timplans-ID/version, skola, årsindex/kolumn och rad. Klassantal räknas separat; samma ram multipliceras inte per klass eller skolrad. Kullramstimmar är inte tjänstefördelning utan grupper/samläsning/resurser.
- Årssnittet styr vilka kolumner som visas. Sparningen ska behålla alla sex gymnasievärden och grundskolans originalkolumner och sin exakta plan/skola/version/revision. Årbyte väntar vid pågående/okänt sparutfall och ett sent svar får inte uppdatera en annan kontext.

**Producentkontrakt efter 05-36:** 05-37 ska leverera hela det verkliga frysta/ursprungliga radinventariet, kontrollera faktisk kund/skola/planversion/klassresolver och behålla saknade förväntade rader som null/diagnos. Parserns `complete` autenticerar inte originalets fullständighet eller mandat. En planversion har en enda konsekvent originalkolumnkarta/timcellinventering; en programkälla har samma poänginventarium på varje skola. Okänd klassidentitet ger ofullständigt klassmått. NO/SO räknas via aktiva matrisrader; IM:s veckosumma är planerad ram inklusive annan aktivitet, inte verifierad undervisningstid. Se 05-36-SUMMARY:s bindande integrationsgräns innan SQL och dess paritetsprov skrivs.

## Genomförande- och verifieringsgränser

**Inga nya externa beroenden eller bibliotek** behövs enligt inventeringen. De föreslagna migrationsnamnen är `20261006120000_phase5_planning_year_reads.sql` och `20261006121000_phase5_worker_planning_year_reads.sql`; de var lediga vid planering men måste kontrolleras mot källor/andra planer och faktisk migrationsjournal igen före utförande. Ny RPC-namnrymd är `phase5_planning_year_`; gamla grants/definitioner ska jämföras exakt. Ingen textbackfill eller verksamhetsmutation följer av dessa läsprojektioner.

Alla DB-/Worker-/browserprov med verksamhetsbaslinje körs **seriellt** i ägd isolerad skyddad testmiljö. Fixtures ska verifiera ägarskap och städa endast egna business/session-/triggergrafer; audit/identitetsankare behålls. Ingen reset. Fingeravtryck ska täcka hela originalrader inklusive tidsstämplar, inte bara count. Första FAIL/setupfel/PARTIAL bevaras. Om annan verksamhet ändras samtidigt dokumenteras det, första jämförelsen skrivs inte över och uppgifter återställs inte godtyckligt.

Lokala Node-/typ-/lintkontroller körs i `web/`; DB-/applicerings-/APIharness och docsbyggnad från projektrot. Använd aktuell fungerande Node-runtime som projektet kräver. UI-prov använder Chromium desktop och WebKit telefon på samma käll- och byggverifierade Worker med en testprocess och utan automatiska omförsök. Varje UI-steg har avgränsade nya fall; slutmatrisen körs efter sista produktändring utan onödiga dubblettsviter. Handboksförändringar ligger i 05-43 och omfattar båda planvyerna och den nya planeringssidan före sammanhållen slutleverans.

Löpande commit/push av färdiga kontrollerade steg till aktuell origin-gren är redan godkänd enligt AGENTS.md. Ta inte med orelaterade `.planning/config.json`, `spike.json`, `.gsd/`, `state.json`, `04-PATTERNS.md`, hemligheter eller privata data. Inga force-push eller automatisk publicering/driftsättning. Kontrollera fjärr-HEAD efter push. Om 3012 uppdateras efter implementation ska den få byteidentisk prövad artefakt med lokal konfiguration och äldre klientassets bevarade.

## Kravspårning och kvarstående arbete

| Krav | Planer | Verifieringsmål, ännu inte genomförda |
| --- | --- | --- |
| PLANERING-01 | 36,39,41,42,43 | Egen kontext/URL/minne, registerår oförändrat, återgång och session-/uppdragsrensning. |
| PLANERING-02 | 36–40,42,43 | Nya+fortsättande kullar, januaristart, okänt/saknat, verkliga grundskoleår och introduktionsprogrammens veckotid under dagens mandat. |
| PLANERING-03 | 36–38,40,42,43 | Hela behöriga underlaget söks/filter/sorteras med stabil pagination och korrekt skol-/versionsöppning. |
| PLANERING-04 | 36–38,40–43 | Källbunden årsdel, deduplicerade mått, full matris/originalindex, osparat arbete, pågående skrivningar och okänt sparutfall hanterade. |
| PLANERING-05 | 37,38,41,43 | Verklig SQL/Worker/browser, exakta grants/audit/bevaring, handbok och begränsat S1/S3-kontrakt. |

Användarens nya krav kompletterar den ursprungliga pilotens 42 krav; de omklassar inte det godkännandet. 05-23/E är tekniskt avslutad separat. Yrkesram 05-17, beslut/garantikontroll, ADMIN-02/03/04 och hela fas 5 är fortsatt öppna. Äldre 05-25–35 ska omplaneras innan utförande. Först när faktiskt tabell-/årsarbete är verifierat får de två samordnade pending-todos sin riktiga leveransstatus; deras äldre automatiska klasskopplings-/globala-statusförslag byggs inte.

Det mänskliga provet kommer efter det konkreta resultatet och redovisas separat som awaiting_user tills användaren svarar. Samma redan fattade beslut ska inte återfrågas, och mänskligt vänteläge blockerar inte automatisk verifiering eller kontrollerad push. 05-36:s avgränsade SUMMARY/PASS godkänner inte SQL/API/UI, verklig kommunanslutning eller pilotdrift.
