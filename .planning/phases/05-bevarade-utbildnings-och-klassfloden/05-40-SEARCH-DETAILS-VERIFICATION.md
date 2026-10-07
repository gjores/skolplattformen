---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "40-SEARCH-DETAILS"
verified: 2026-10-07
status: passed
score: "4/4 must_haves verified"
scope: local-synthetic-only
method: independent-source-and-actual-evidence-review
gaps: []
---

# 05-40 SEARCH-DETAILS — verifiering

**PASS för den avgränsade backendplanen, 4/4 mål.** Faktiska rollback-, apply-, Worker/API- och slutrapporter visar serverbaserad sökning med verifierad metadata, strikt bakåtkompatibilitet och bevarade behörigheter/verksamhetsrader. Detta gäller det ägda skyddade syntetiska målet. UI39–43, användarens slutprov och fulla fas-/kravgodkännanden återstår.

Oberoende granskning utgår från [planens mål](05-40-SEARCH-DETAILS-PLAN.md), produkt-/provkällor och de faktiska rapporternas detaljer. Rapporternas SHA, källrevisioner, historiska Git-bytes, byggbindning, katalogdiff, originalhelrader, audit-/identitetsankare och kedjan rollback→apply→applied har jämförts läsande. Ingen ny DB-, API-, browser-, bygg- eller testkörning ingår i denna verifiering. Bedömningen grundas på faktiska integrationsbevis, inte enbart rena Node-prov.

## Måluppfyllelse

| Planens mål | Status | Faktiskt bevis och källkoppling |
| --- | --- | --- |
| Behörig användare hittar namn, lokal kod, program, inriktning och kull i hela års-/skolurvalet, även efter första sidan. | PASS | 23 SQL-sökfall och 19 HTTP-fall/204 kontroller. Ägd 52-raders mängd ger 50+2 sidor; senare lokal kod hittas av servern. Program-/inriktningskoder och benämningar, gemener, literal `%`/`_`/apostrof, filter, tomresultat och list-/översiktsurval provas. Sökpredikatet körs efter mandatavgränsning och före count/sort/sidindelning. |
| Koder är egna sparade uppgifter; benämningar kommer från verifierad exakt källa; okänt blir saknat. | PASS | SQL-fallen jämför metadata mot verkliga offering-/katalograder och kontrollerar scope/proveniens. HTTP provar exakta programvarianter, null/saknat underlag och fryst äldre källa. Namn hämtas först efter canonical validation med exakt katalog/programversion/inriktning. Fel programkod ger null för båda namnen; fel inriktningskod ger null för inriktningsnamnet men behåller det korrekt verifierade programnamnet. Ingen latest-fallback införs. |
| Två strikta radformer; oföränderliga original93/18 och historiska 05-38-bevis. | PASS | Parsern godtar exakt den äldre 19-fältsformen eller den formen plus ett exakt femfältigt `searchDetails`. Äldre form behåller äldre utdata. Oförändrade 93 SQL-prov och 18 SQL/TS-kontrakt passerar runt båda definitionerna i både rollback och applied. Ny faktisk Worker läser även den äldre DB-formen: 27 parser-/rollkontroller samt full API15/247 före apply. Historiska rapportkällor binds till sina egna Git-revisioner. |
| Mandat, auditpar, felkoder, 28 entrypoints, verkliga identiteter och hela verksamhetsrader består. | PASS | 38 kärnjämförelser, oförändrad API15/247 i båda lägena, sökfall för två kunder/skolor samt 401/403/400/409 och samtliga DB-/Worker-auditfel. Positiva läsningar kontrollerar DB+Worker-par och no-store. Alla 15 originaltabellers fulla radhashar inklusive tidsstämplar, råa ACL/28 entrypoints, ursprunglig säkerhetsaudit och identitetsankare består. Ägd cleanup är färdig utan deferred/unknown recovery. |

De 38 jämförelserna behåller kärnidentiteter, källor, celler, klasser, summor och felutfall. Endast deklarerad metadata och dess uttryckligt metadata-bundna revisionsändring hanteras separat. Ändrad lokal kod eller katalogbenämning ger avsiktligt SQL40001/HTTP409 för gammal fortsatt sida; det redovisas som ändrad sök-/revisionssemantik, inte som kärnparitet.

## Artefakter och kopplingar

| Artefakt/koppling | Bedömning |
| --- | --- |
| `web/lib/planning-year-contract.ts` → faktisk lista/översikt | Finns, är substantiell och används av Worker-adaptern. Slutna äldre/utökade former, fem parsade metadatafält och befintliga shape-/scope-/källkontroller består. Ingen generell acceptans av extra fält. |
| `20261006123000_phase5_planning_year_search_details.sql` → offering/katalog → sökning | Ersätter endast privat `public.phase5_planning_year_rows(jsonb)`. Egna koder och verifierade namn projiceras före serverns sökning. Befintlig exakt cachekey, 128 nycklar/50 000 celler, fallback och fryst timplansväg består; egna plan-/utbildningsreferenser återanvänds inte från en annan rad. |
| Coordinator/fixture/apply → faktisk skyddad Worker | Slutna käll-/rapport-/målgrindar, historiska beroenden, ägda SQL/API-fixturer, migrationslås5520 och förutsagd katalogdiff används. Okänt setup-/HTTP-/SQL-avslut får inte följas av cleanup/snapshot/PASS. Slutrapporterna visar bevisat avslut och färdig cleanup. |
| Metadata → kommande 05-40-tabell | Läskontraktet och serverbeteendet är verifierade. Den planerade UI-kopplingen och dess dator-/telefonflöden ska verifieras separat i UI39–43. |

Inga stubbar, positiva mockar eller godtyckligt bortfiltrerade svarsfält ligger till grund för detta PASS.

## Faktiska rapporter

Alla nedanstående rapporter är kompletta PASS. Rapporterna är exakt kopierade från runtimearbetskopian till huvudkopian; tabellen anger SHA256 för råa filbytes.

| Rapport i `work/pilot/results/` | Resultat | Rå SHA256 |
| --- | --- | --- |
| `phase5-40-search-details-rollback.json` | SQL271; kärna38/sökfall23; original93/18 runt båda definitionerna; parser27; full API15/247; rollback/cleanup/bevarande | `0e601c0758acc8cf10cae803c29481b86e58c7fb2a05a80f319fecfe9fef8613` |
| `phase5-40-search-details-apply.json` | Exakt helper/journal och före-/efterkontroller; lokal migrationsartefakt sparad | `3c38d92d686e4bf6b431db5eb548793d50799d98a8fc6a4deae187c37eac6d1d` |
| `phase5-40-search-details-final.json` | SQL271; kärna38/sökfall23; original93/18 runt båda definitionerna; HTTP19/204; 12 tider; full API15/247; cleanup/bevarande | `cc19183d5d996bb017a5590099025d04b0d5cfdc6a11901feb57d7410cd708c8` |
| `phase5-40-search-details-parser-api.json` | Oförändrad full API15/247 före apply | `f5fa66d927c708bfccf65150ccad3a5959eb2f136b8bec6863f75e1d94c5db1f` |
| `phase5-40-search-details-api-final.json` | Oförändrad full API15/247 efter apply | `b063ed7df08a734bceb622289cf029bd036467ff6e04f29b978204ec85455555` |

Samtliga sex TAP-strömmar i rollback/applied är fulla 271/93/93, exit0, utan SKIP/TODO, timeout, overflow eller signal. De dedikerade API-bevisen binds även genom `sha256(JSON.stringify(parsedReport))`: före apply `1b4488b67d4e8b42319f6042a99535385b3dc3c9ca8624bf9c7ac4ebb5a9aa45`, efter apply `12fed90b1e5e42f14409377c8f0c9199e0cb0f025929536b7928bb90362ad301`. Dessa kanoniska JSON-hashar skiljer sig avsiktligt från råfilshasharna.

## Källa, bygge och tillämpning

Faktisk källrevision är `43ab14cb88b277ce23516eee9b5345d3e8037db0`; ägd skyddad Worker3060 har byggrevision `0913d5a0527e2975ce3059b8672b2c139bf07997`. Alla 44 SEARCH-källhashar matchar den faktiska källrevisionens Git-bytes och huvudkopians granskade källor. Runtimeinventeringen är identisk mellan dessa revisioner: den senare ändringen gäller den egna SQL-provfixturen och dokumentation, vilket tillåter samma parserbygge. Båda parserfilerna binds separat till nya bytes. Ordinarie3012 ingår inte i detta bevis.

| Granskad produkt-/provkälla | SHA256 |
| --- | --- |
| Ny metadata-/sökmigration | `b566b7abcce22784b9fe5dc6e4fba691afb4b008b5251b570acc19fef6b3685c` |
| SEARCH-SQL-prov med explicit egen legacy470→skola30 | `e43ea34c40eba19fd700430ce93e638f5fbf1103284c6983cb95e8d9a507229f` |
| Strikt parser | `ecb70c3addd4b53561b76511f16d8954ad65725fa2186d473b8e8e8004616d6e` |
| Parserprov | `4c44fd0bf83f5fbfd44812bdb3a340fa2e82c35fab0daac1836acfe11ff4aa95` |
| Coordinator / dess prov | `c2838818a0e440b2d93b8bd98596df8ad92c56d28cdd6f27eb4b1900a824f578` / `4406a46660a6d62150dbae2380d82d2da9c8b327265db4ffcb168dd8df673159` |
| Ägd SEARCH-fixture / apply | `1e27792a69f6898c6900df6b2881063a8edd6e48165f71e8d6e84db9b90b224a` / `d246f2fc2dab7e0c197acbe32f62ca123f9430e9d8175b54b1e01edfe5eea6b9` |

Apply ändrar en definition av **198 public-funktioner**; övriga197 är identiska. Ägare, rå ACL, VOLATILE, SECURITY DEFINER och search_path består även för den ändrade funktionen. Tabell-/vy-/sekvens-ACL och RLS består. Endast en exakt journalpost för06123000 med exakt SQL-källa tillkommer efter den godkända06122000-grunden.

- Ursprunglig `pg_get_functiondef`-SHA: `78eb6d6f3352af3a26c9596e2f3381059fed38cc87f2c927d18b305e09c03339`.
- Tillämpad SEARCH-definitions-SHA: `9261d40f074c75bdbe5cd0119204ddfb13d4a3741d3cdf96b07f92200b9ebf21`.
- Full katalog före: `106b3f26f9872ad6fcdc938fed70b104c3608f8cace966ed38a8f25cc101dbe7`; efter: `6e4e60db0dcd6e091dc5049ad1f77d5a57681dff942be59387e3f9ec7835c756`.

Rollback återställer exakt förekatalogen. Apply-förekatalogen är samma och apply-efterkatalogen är applied-finalens oförändrade före-/efterkatalog. Fulla originalhashar för15 tabeller är identiska genom hela kedjan. Original-/retained-audit och identitetsankare bevaras som hela rader; främmande kundens kvarvarande ägda business-/sessionsrader är0 och alla6 retained-auditevents har verkliga ankare. Ägda auditfeltriggers/funktioner och övriga egna verksamhetsrader är bortstädade. `cleanupDeferred`, `setupUnknown` och `databaseRecoveryRequired` är false i fulla slutbevis.

## HTTP-prestanda efter tillämpning

| Faktisk läsning | Kompletta200-prover | Median, ms | Max, ms |
| --- | --- | --- | --- |
| Lista52, sida1/50 rader | 3 | 3576,091 | 4883,073 |
| Sökning, 1 träff | 3 | 2820,083 | 3062,717 |
| Lista52, sida2/2 rader | 3 | 3428,780 | 4115,306 |
| Översikt52 | 3 | 2752,438 | 2795,964 |

Alla12 är faktiska fullständiga200-svar med no-store, auditpar och oförändrad verksamhet. Medianerna är högst5s och varje prov under10s; den ursprungliga30s HTTP-gränsen består. Historiska prestandamätningar används som separat referens med annan ägd fixture. De styrker ingen kausal kostnad eller exakt före-/eftereffekt av denna metadatarättning.

## Historik och återhämtning

Historiska 05-38-final/performance-rollback/performance-final/API-final är kompletta PASS och binds till respektive egen Git-revision, inte till senare kontraktsbytes. Originalmigrationen och original93-provkällan är oförändrade. Alla24 report/SHA-referenser i aktuell performance-felhistorik matchar bevarade filer. SEARCH:s tidigare avvikelser är också bevarade:

| Bevarad händelse | Bedömning / rå SHA256 |
| --- | --- |
| Första preflight REFUSED | Eget runtime-workdir krävdes; ingen SQL/HTTP-fixture startade. `b36df4199c274bd283a584981694ac7eba77408be02a4a7df01f451f0b96fcdb` |
| Första fulla SQL FAIL | Sex misslyckade assertioner orsakades av saknad egen offering_units470→30 under replica-insert. Förväntade antal271/38/23 och produktmigrationen ändrades inte; färsk fullrollback krävs och finns. `1b13672f559b5562c6bba971ea6a37a01cdb148157aed6ac45445a98d5f49ac3` |
| Första apply-process FAIL | DB-commit följdes av misslyckad lokal artefaktkopiering till saknad ignorerad migrationskatalog; ingen apply-PASS-rapport skrevs. `34a76a4f4b9d8f6ccf5b1cd68ce98bdad2bb25479ccd431f7f0bbc8f7b25cde3` |
| Förtidigt applied-probe FAIL | Vägrade saknad apply-rapport före SQL/fixture. `352f5bbd348b49a55048a28feb065eaf0e867486a3d737460c00194b7d77600f` |
| Separat ägd återställning PASS | Återställde exakt performance-definition och tog bort exakt egen journalpost under lås; hela katalogen/15/råACL/audit-/identitetsankare blev exakta. Rapport `7ab831c1d3d8a7ebfc81527c428c23bcc44464f169fbffbdf206b6399df54e2a`; full sparad recovery-källa `d8a1d2d73ca138163b304b26a0f5e08c3b0e08fb52c31e5d968381c54bb75aef`. |

Efter återställningen skapades den egna ignorerade artefaktkatalogen. Oförändrad granskad apply kördes om och gav faktisk komplett PASS, följd av färsk fullapplied PASS. Återställningsrapporten ersätter inte apply-beviset; inga tidigare FAIL rekonstruerades till PASS.

## Kvarstående godkännanden

PLANERING-02/03/04 får stöd av denna avgränsade backendleverans men är inte fullständigt godkända här. UI39–43, exakta öppnings-/års-/skolflöden, dator/telefon och berörd handbok behöver sina separata faktiska bevis och användarprov. Full fas5, produktionsdrift och verklig kommun-/elevanslutning omfattas inte av detta lokala syntetiska PASS.
