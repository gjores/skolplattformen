# Årsplaneringens anslutningspunkt för S1/S3

Status: SOURCE-ONLY utkast till 05-43; slutliga råbevisreferenser är TODO/null (PENDING). Full O36, separat slutC16, läsande release-V5 och ROOTs exakt verifierade3012-överföring med före-/efterprov måste vara accepterade innan dessa statusrader får kompletteras med faktiska referenser. Mänsklig begriplighet redovisas därefter som awaiting_user eller verkligt svar. Dokumentet definierar ingen ny API, roll, grant, modultillgång, beräkningstjänst eller publicering.

Underlag: `web/lib/planning-year-contract.ts`, `planning-year-model.ts`, befintliga program-/timplanskontrakt och skyddade serverdatavägar. Anslutning till [schemaprojektets S1/S3](SCHEMAMODUL-PROJEKT.md) är en kommande kontraktsuppgift. Ett TypeScriptfält är inte ett provat adapterkontrakt.

## Kontext och ägarskap

Planeringskontext äger valt planeringsläsår, skola, skolform, vy, sök/filter/sort/sida och urvalets revision. Elevregistret äger ett separat komplett urval med eget läsår. Ingen global årsvariabel får ersätta dessa två urval.

Aktuell serverbekräftad kund, uppdrag och context-epoch avgränsar minnet. URL är en visningsönskan som måste normaliseras mot faktisk läsbehörighet och rätt årsrad. URL eller klientens rollval bevisar inget mandat, ingen planversion och ingen kolumnkarta. Sessions-/uppdragsförlust rensar innehållet även när en sparstatus är okänd. Nuvarande sessions-API ger inget stabilt sessionId för persistent klientlagring; kontraktet förutsätter ingen ny session-/registerarkitektur.

Programramen äger innehåll och poäng, skolans timplan äger planerade timmar. Studieplanen ska senare äga elevens konkreta studierader, grupper ska äga organisation, tjänstefördelning ska äga resurstilldelning och schema ska äga konkreta tillfällen. En härledning får inte bli konkurrerande huvudkälla.

## Vad den nuvarande raden faktiskt bär

| Uppgift | Verklig källa nu | Gräns för nästa modul |
| --- | --- | --- |
| Kund/skola/utbildning | `PlanningRow.customerId`, `unitId`, `offeringId` | Stabilt ID måste ingå i scope; benämning är presentation. |
| Klass | `classes[].id/customerId/unitId/offeringId` | Klass-ID är stabilt när den verkliga resolverbindningen finns. Legacy klassnamn är endast uppslagsnyckel; saknad/tvetydig resolverstatus ska bestå. |
| Läsår och urval | `PlanningSelection.schoolYear` och övriga urvalsfält | Urvalets `selectionRevision` är inte planens skrivrevision. Sida >1 behöver rätt urvalsrevision. |
| Öppnad plan | `plan.id/version/revision/status`, eller null | Exakt årsradsversion; inget automatiskt senaste utkast. Skrivrevision ska användas av rätt CAS-operation. |
| Programkälla | `source.planId/offeringId/version/revision`, eller null | Timplanens frysta payload och startdatum måste läsas från faktisk timplan; aktuellt programinnehåll ersätter inte fryst källa. |
| Start | `start.provenance/startedOn/academicYear/legacyYear` | Legacy, saknat, ogiltigt eller motstridigt underlag förblir okänt. Kulltext är ingen datumkälla. |
| Gymnasiedel | Modellens `relativeYear`, `termIndices` och `terms` | Visning 1–3 använder originalindex 0/1, 2/3, 4/5; visningsval ändrar inte lagringsordning eller globalår. |
| GR-årsbindning | `application.schoolYear/planId/version/columnId` | Måste matcha faktisk årsrad och fullmatris. Äldre fastställd v1 kan gälla även när v2-utkast finns. |
| GR-kolumner | `columnMap.kind/provenance/planId/version/columnIds` | `kind:unknown` ger ingen årsindexmappning. Historiska positioner är läsbara lagrade positioner, inte härledd årskurs. |
| Aktuell GR-matris | Uttrycklig faktiskt läst utkastversion och dagens kolumner | Arbetsläge för originalceller, ingen historisk årsbindning. Ingen sådan proveniens skapas av URL; omladdning kräver ny bindning/uttryckligt val. |
| Rad och cell | `cells[].rowKey/points/pointTerms/hourValues` samt fullplanens riktiga rad-ID/kolumnindex | Originalnycklar och hela sexvärdesfördelningen måste bevaras; index får inte härledas från visuell position. |
| Underlagets karaktär | `underlag: class-bound/planning/forecast/missing`, `diagnostics` | Prognos/förberedelse får inte uppgraderas till faktisk placering eller genomförd undervisning. |
| Sökpresentation | `searchDetails` med egna koder och verifierade bundna katalognamn | Benämning/kod är inte planidentitet; ingen katalog-latest används som återöppningskälla. |
| Mätvärde | `PlanningMeasure.value/known/complete` | `value:null` är okänt/ofullständigt, `known` en partiell summa. Noll får aldrig ersätta saknat. |

`PlanningRow.source` kan vara null när timplan saknas även om en programplan finns. En nästa modul måste först läsa ett uttryckligt valt programunderlag inom rätt skola. Den får inte gissa källa utifrån utbildningens namn eller en första skolkoppling.

## Årsintervall är inte skolkalender

Produktmodellen har årsval 2000–2100, läsårsintervall juli–juni och sex höst-/vårintervall. Detta är modellens visningsintervall, inte nationell regelversion, ett faktiskt schema eller skolans verifierade terminskalender. Januari/aprilstart kontrolleras mot faktiskt startdatum; poäng före start markeras för granskning och flyttas inte tyst.

Nuvarande planeringsrad bär inte en full skolkalender med lov, undervisningsdagar eller konkreta schematider. S1:s framtida adapter måste därför tillföra faktisk kalenderkälla, kalender-/period-ID, revision, giltighet, tidszon och verifieringsstatus. Saknad kalender ska vara explicit null/saknat och stoppa en kalenderberoende beräkning, utan att stoppa själva årsvalet. Dessa framtida fält finns inte genom att detta dokument nämner dem.

## Enheter och sammanräkning

Gymnasiepoäng beskriver innehållets omfattning. Gymnasiets/grundskolans planerade timmar och introduktionsprogrammets timmar per vecka är skilda mått. Minuter är relevant för konkreta schematillfällen senare; konvertering kräver uttryckligt kontrakt och får inte blandas med gymnasiepoäng. Skolkalender, faktisk undervisning och individens beslut kan inte härledas ur kullens terminsram.

Gemensamma programramars poäng dedupliceras enligt exakt källram; varje skolas timmar hålls separata. Klassantal gäller resolverbundna klasser och inga påhittade elevantal. En prognos eller null-summa ska visas med sin proveniens och begränsning. Kulltimmar är inte personaltimmar och bevisar inte garanterad undervisningstid.

## Skrivning, loggning och ändringskonsekvens

Varje befintlig skrivväg kontrollerar faktiskt aktuellt mandat, skola, status, session/MFA och säkerhetsaudit på servern och i datavägen. Klientkontroller är visnings-/navigationsskydd. En radskrivning bär den riktiga planrevisionen och hela radens originalvärden; en cellskrivning bär det riktiga rad-ID:t och originalkolumnindex. Pågående/okänd sparning spärrar navigation fram till verklig återläsning eller säkerhetsrensning.

S3 ska jämföra precis den källrevision som en härledning användes från med aktuell tillåten källa. Ändring betyder inaktuellt härlett underlag/avvikelse som behöver ny kontroll, inte tyst timflytt, automatisk omfördelning, klassflytt, fastställande eller publicering. Fryst timplanskälla består tills ett uttryckligt nytt utkast skapas enligt befintligt mandat.

Saknad elevplacering, grupp, resurs, behörighetsunderlag eller kalender blockerar respektive efterföljande beräkning. Det ger ingen integration åtkomst till fler kunder, skolor eller individer. Personresurser behöver senare stabila ID:n; namn/e-post och lärarnamn i exempel är inga säkra matchningsnycklar. Modultillgång och personmandat är separata framtida kontroller enligt S1, inte nya funktioner införda av detta spår.

## Beslut som fortfarande återstår

Rektor ska enligt användarens registrerade gap kunna färdigmarkera sitt arbete och huvudmannens representant godkänna. Detta flöde är ännu inte levererat. Beräknat **Klar för beslut**, sparat utkast, historisk fastställd version och nytt beslutsmandat är olika saker. 05-17, ADMIN-02/03/04 och full fas5 hålls öppna; tidigare verifierat grundflöde eller 05-23/E upphävs inte.

Ingen studieplans-, grupp-, tjänste-, schema-, licens-, betalnings-, Rust- eller AI-integration påstås genom detta kontrakt. S1 behöver egen kontrakts-/mandatprecision och S3/S4 egna verkliga prov. Slutlig 05-43-text ska endast ange aktuella avgränsade PLANERING-delresultat och ett faktiskt användarsvar eller awaiting_user.
