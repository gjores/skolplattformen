---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "40"
status: passed
score: 3/3
verified: 2026-10-08
scope: local-synthetic-only
---

# 05-40 — oberoende verifiering

**Resultat: 3/3 sanningar verifierade inom planens avgränsning.** Produktkopplingarna finns och används av faktiska läs- och skrivflöden. Den färdiga matrisen L01–L18 passerar på både dator och telefon: 36/36, utan skip, flaky eller retry. Bedömningen bygger på källgranskning, sparade faktiska rapporter, samtliga städ-/geometribilagor och utvalda originalbilder. Granskaren har inte kört nya DB-, API-, browser-, bygg- eller testjobb.

## Mål bakåt till faktiska bevis

| Sanning i planen | Verifierad koppling och faktiskt beteende | Bevis | Status |
|---|---|---|---|
| Läsårsöverblicken visar nya och fortsättande kullar samt synliga saknade underlag. | Shellens whitelistade överblick använder samma års-/skolurval och POST `/api/planering/oversikt` med strikt svarskontroll. Kullrelationerna och underlagsluckorna visas separat. Unika programramspoäng blandas inte med skolans timmar, klassantal eller IM-veckotid. | L11/L12: hela52, gemensam programram för två skolor, 800 unika poäng och 540 skoltimmar; äldre GR-bindning används och nyare utkast utesluts. IM NULL visas som okänd veckotid med12 kända fördelade timmar, utan fabricerad totalsumma. L04 prövar års-/kullfilter. | PASS |
| Programplaner och gymnasietimplaner hittas i tabeller med sök/filter/sortering över hela urvalet. | Gemensam ProtectedPlanList använder POST `/api/planering/lista`, serverfilter/sortering och 50-raders pagination med selectionRevision. Fullt scope, avbrott och aktuell requestnyckel hindrar gamla svar från att ersätta nya urval. | L01–04/L08–10: 50+2, sökträff på senare sida, lokal kod, verifierade program-/inriktningskoder och katalognamn, gemener och literal `%`, `_`, apostrof; kombinerade filter, omvänd sort, Rensa filter och tomresultat. Verklig409 återläser sida1 med samma filter. Sena sök-/skolsvar och främmande URL ger inte gamla skolrader. | PASS |
| Öppna leder till exakt skola, plan och version; programram utan timplan visas som saknad timplan. | Årsradens unitId/planId/version och frysta source skickas till faktisk arbetsyteläsning. Full parent-read kontrollerar aktuellt setup, lifecycle, mandat och exakt version före URL-publicering. Saknad timplan/källa ger uttryckligt versionsval eller saknat underlag, utan autoskapande. | L05–07/L13/L15–18: två skolors egna timplaner och gemensamma frysta ram, saknad timplan/programplan, äldre program-/klassbunden timversion trots nyare utkast, Back med bevarade filter, Flow A→B samt radB→alla→NyA. Okänt skapandekvitto behåller spärr tills faktisk återläsning. L14 prövar stabil serververifierad skapanderätt, retry och401-clear. | PASS |

## Faktisk matris och käll-/byggbindning

- Slutrapport: `work/pilot/results/phase5-40-lists-actual-fifth-20261007.json`.
- RawSHA: `f44892df92a048a68a26592e430709786fcf4cab7ebcdb2c648345505cfb083a`; MAIN och runtime är byteidentiska.
- Source och skyddat runtimebygge: `1f3e6b2ebaa39ba84a8596b354e1d1a977860b41`; actualWorker=true och runtime-markörens byggtid `2026-10-07T21:50:36.257Z`. Äldre ignorerad MAIN-buildmarkör används inte.
- Start `2026-10-07T21:52:21.255Z`, duration1085638,048ms, cirka18,1min. Exakt18 namngivna fall × Chromium/dator och WebKit/telefon; workers1, maxFailures1, retries0, inga rapportfel.
- L-spec: `620e40be153ed41bc83f9544c033c4a6946a0fe7e79b73d33375f1aecfe0b5bc`.
- List-fixture: `cd4823f593c6ecc2347d63a35d9f858e3d9f57f451472cb326316b2441efd76f`.
- Konfiguration: `3af7aeb13ae2e3fb0372b6ab0ad42364022ba5c91dca26ab38e6e92e6f7b6d52`.
- Gemensam listkomponent: `229a5d0337598e8084583fb55b9f94890c831c2f76a258606eb1fe1d0bed0f65`; list-CSS `55f12de62aa1658accf4aef430d6f1b555cb635e7b0c0384d5195ab023a2a62a`.
- Programworkspace: `e1208bb06c1730448af88807c9088ff097f81835ac9123106e998eaf1d6758d8`; gemensam shell `214d577fe7c487605f1a010778277cb68588d917fc6d42720a1ca5e35c5d2c6e`.

Båda projektens source-build-bilagor har granskats. Varje projekts18 explicita sourcehashar och två parserhashar stämmer med det godkända Gitträdet, MAIN och runtime. Även200 expanderade historiska proofpaths,316 webbkällfiler och åtta fixture-/helperkällor stämmer exakt. Dessa är läsande källjämförelser; antalet316 är en källinventering och påstår inte att varje fil är en separat runtimebygginput. Källinventorierna är samma mellan projekten, med browserName som projektskillnad.

Historiska dependencies är bundna till sina egna godkända rapporter och källrevisioner. Faktiska råhashar är performance-final `f0b4957345763ee0d37d3f9705434bbc4ca10a2a6bc8b09a134d4fe1261e938c` och SEARCH-final `cc19183d5d996bb017a5590099025d04b0d5cfdc6a11901feb57d7410cd708c8`. Historisk39 fullC16 förblir sitt eget verifierade bygge; det ersätter inte43:s prov av slutlig samlad produkt.

## Databevarande och avslut

Alla36 normala cleanup-bilagor har granskats. Varje fall har samma count/helradshash för de15 originaltabellerna före och efter, exakt lika godkänd SEARCH-final. Alla sex bevarandeflaggor är true. Originalaudit och originalidentiteter samt nytillkomna retained audit-/identitetsankare har oförändrade hela rader/hashar före och efter städning.

Ägd verksamhetsgraf, sessions, program-/timplaner, kvitton/events, klasslänkar/listklasser, offering_units och ägda audittriggers/-funktioner är0 efter städning. Även främmande verksamhetsgraf/sessions och SEARCH-injektioner är0. Inga deferred-, unknown-, recovery- eller failure-grenar finns i slutmatrisen. Samtliga afterEach inklusive `dialogs=[]` passerade. Cleanup-bilagorna redovisar tillsammans2506 bevarade egna auditposter och108 identitetsankare räknade per fall; detta är inte ett påstående om108 unika globala identiteter.

Positiva testvägar använder verkliga svar och strikt parsning. Hållna svar och avsiktliga transportfel kommer efter actual route.fetch; skyddad återläsning och korrelerade DB-/Worker-auditpar verifieras i fallen. Inga positiva mockresultat eller retry-PASS används. Skapanderättens parent tillämpar epoch/kund/uppdrag/år/skola/setup-enheter, aktuell requestnyckel och avbrott; retry behåller writers och401/403 tömmer scope. Ovisst skrivutfall förblir spärrat även vid Back, år-/skolbyte och barnavmontering.

## Geometri och bildgranskning

Alla36 geometribilagor visar innesluten dokumentbredd, uppmätta planeringskontroller minst44×44px och tabell inom viewport. Alla36 PNG-filer finns och matchar manifestets råhashar. Manifest: `/private/tmp/phase5-40-full-fifth-images-20261007.json`, SHA `be939020312bea690118b67d7616ad0cf7cd9dad84a00e422d35df430e748f86`.

Utvalda originalpixlar har lästs för L01 dator/telefon, L11 dator/telefon och telefonL05/L06/L07/L12/L14/L17/L18. Överblicken visar tydligt separata poäng/skoltimmar och okänd IM-veckotid. Saknade program-/timplaner visas utan fabricerad källa. L01 visar sida2/2 med51–52 av52 och verklig tangentbordsrullning inom den fokuserade rullytan. Äldre klassbunden GY-version visas som fastställd och skrivskyddad.

Bildbegränsningar: L14:s Flow och L18:s programboard laddar fortfarande vid capture; deras bilder styrker kontext/mål, medan full läsning/behörighet/recovery styrks av faktiska assertions. L05:s slutbild visar de två skolraderna, inte alla mellanliggande öppningar. Fokusvisad ”Till innehållet” överlappar delar av filter/rubrik i vissa telefonbilder. Detta är en kvarvarande presentationsnit för43, inte bevis för en felfri samlad UI. Granskningen påstår inte att alla36 bilder har pixelgranskats av denna verifierare.

## Bevarad fel- och rättningshistorik

| Oförändrad rapport | RawSHA | Observerat resultat och avgränsad rättning |
|---|---|---|
| `phase5-40-lists-actual-first-20261007.json` | `77084c83e83342c3281730cb962e040120f7768f997d4f037d24b0e509f4bc6a` | 3 PASS/L04 FAIL/32 skip; fyra normala cleanup. Endast två nested-labelmatchare byttes till exakt namngivna comboboxroller; värdeassertionerna består. |
| `phase5-40-lists-actual-second-20261007.json` | `50f69b198c7f74bcb06d6f6aef25e7f3c9a7c324ebd2dca3d1db37e92323aff3` | 12 PASS/L13 FAIL/23 skip;13 normala cleanup. Samma exakta gamla plan-ID väntas med befintlig25s poll efter faktisk full parent-read. |
| `phase5-40-lists-bounded-later-third-20261007.json` | `3a56f4f5eb925d046e1ed6651c164f5924e577ab8aab76cce1f9d1b5f80d43fc` | 5 PASS/L18 body PASS men confirm-dialog gav FAIL; sex normala cleanup. Workspace väntar med initialtarget tills föregående Flow:s osparat-/spärrregistry är tömt. Ingen force-/discard-genväg eller försvagad unknown-spärr. |
| `phase5-40-lists-bounded-created-fourth-20261007.json` | `7ed6be409564bce7220f9ee59525d9d4f33e5a12f1ff41a56ed6fb0925fa4f3a` | L18×2 PASS efter nytt skyddat3c3d011-bygge; två normala cleanup. |
| `phase5-40-lists-actual-fourth-20261007.json` | `1dc13a5e2c2e4bd9c6828094d0b5907a0dccc138ce0d1466bba838d6809b6b33` | 18 dator-PASS/telefonL01 FAIL/17 skip;19 normala cleanup. Plain ArrowLeft/Right hanteras endast av själva fokuserade rullytan med±80px; barnkontroller/modifierare ignoreras. Testassertionerna består. |
| `phase5-40-lists-bounded-keyboard-fifth-20261007.json` | `166ef3b85739e62190470d828134da17da0dad4f24817b8348279acd866b6fef` | L01×2 PASS på nytt skyddat1f3e6b2-bygge; två normala cleanup. |

Alla dessa råfiler har återlästs med oförändrade hashvärden. De fyra FAIL-rapporterna förblir FAIL. Boundedresultaten ersatte inte fullmatrisen; den separata färska slutrapporten f44892… ger36/36 PASS. Ingen återhämtning behövdes för40:s misslyckade försök eftersom respektive cleanup avslutades normalt.

## Avgränsning och återstående arbete

Inga konkreta blockerare återstår för05-40:s tre sanningar. PASS gäller lokala syntetiska data och denna program-/gymtimplanelista, överblick och exakta öppningskoppling. PLANERING02/03/04 får stöd inom denna avgränsning; hela beställningen och fasens samlade kravstatus är inte därmed godkända.

05-41:s relativa år, mobilårsknappar och projektion/full6 samt05-42:s öppnade GR/IM-matriser är separata. Senaste samlade produktens C16, handbok, dokumentationsbygge och mänsklig begriplighet/slutligt användarprov återstår i05-43. Ingen verklig kommunanslutning, pilotdriftsättning eller verkliga elevuppgifter omfattas av beviset.
