---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "39"
status: complete
completed: 2026-10-07
requirements-addressed: [PLANERING-01, PLANERING-02]
requirements-finally-verified: []
source_commit: 07737baee91a32307e07a703be9b6befae91c20a
worker_build_revision: 07737baee91a32307e07a703be9b6befae91c20a
---

# 05-39 — Separat planeringsområde och årskontext

**Avgränsat PASS:** Skola och planeringsläsår följer programplaner och gymnasietimplaner vid navigation, retur, Back och omladdning. Elevregistret behåller sitt eget år och filter. Uppdragsbyte och faktisk sessionsutgång rensar tidigare innehåll även med sent svar eller blockerad skrivning.

Full färsk [C01–C08 × dator/telefon](../../../work/pilot/results/phase5-39-context-actual-ninth-20261007.json), raw SHA256 `18c51291b70a3c0308ead8e38e6183f0afe3e27ef5c09309eb2e2cc7ae7d8345`, ger16/16 PASS på samma source/build07737ba. Körningen tog6,3min med workers1/maxFailures1/retries0; inga skips, flaky, globala fel eller positiva mockar. Båda source-bilagornas nio explicita hashvärden samt49 expanderade produkt-/hjälparfiler stämmer med Git, runtime och byggrevision. Slutlig Cspec är `8cf4d94a979758da4734f47fd4d0059e23efdd54509f38523b617438e61fe807`.

| Fall på båda enheterna | Faktiskt resultat |
| --- | --- |
| C01/C02 | Separata register-/planeringsår, två registerfilter, retur/Back/reload och normaliserat främmande års-/skolurval; HM utan elevscope gör inga elevanrop |
| C03 | Gammalt verkligt setup200 efter uppdragsbyte får inte återföra tidigare skola; nytt faktiskt mandat och auditpar verifierade |
| C04 | Pågående verklig timskrivning stoppar år/skola/vy/Back/uppdrag/utloggning utan generell dialog; en skrivning, riktig återläsning och oförändrad programkälla/annan skola |
| C05/C06 | Accepterad skrivning med transport-/läsfel behåller spärr efter avmonterad child tills faktisk parent-/sparstatusläsning |
| C07 | Aktivt/okänt skapande behåller spärr; verklig parentåterläsning bevisar exakt en skapad plan |
| C08 | Verklig sessionsutgång ger401, rensar writer/kontextrad/URL; ny rektorssession läser aktuellt setup och full strikt parsad lista200/no-store med eget auditpar |

Alla16 cleanup-bilagor bevarar samma15 kompletta originaltabeller med hash/count, ursprunglig och retained audit samt identitetsankare. Endast egna syntetiska affärs-/sessionsrader är städade; inga deferred/unknown/failure. Alla dialogbilagor är tomma. Samtliga16 geometrier håller dokumentet inom1440px respektive390px och synliga kontextkontroller är minst44px. Faktiska PNG-bilagor finns kvar i rapportens runtime-output; kontroll av skol-/årsrad och återhämtningsvyer skiljs från användarens begriplighetsprov.

75 riktade rena location-/planeringskontrakts-/registermodellprov, full typkontroll utan incremental, app/lib-lint och skyddat bygge PASS. Efter den avgränsade CSS-rättningen gjordes ett nytt isolerat produktbygge och [C08×2](../../../work/pilot/results/phase5-39-context-bounded-session-ninth-20261007.json), rawSHA `3662d9383ee94b886eeb4d26660823224c7281079b270710b76f3214e0baf0e9`, före fullmatrisen. Ordinarie3012:s bygge/private miljö/äldre klientassets är bevarade och ligger fortsatt på5dd7baf.

## Första fel och avgränsade rättningar

Alla första FAIL och recoveries är separat bevarade. Registerformat, faktisk navigation efter uppdragsbyte, nästlad årskursetikett och awaitad appåterställd Back-URL rättades enbart i egen spec. Dess routepassthrough bevisar hela faktiska fetch/body-jobbet och stänger page/context före cleanup; stage-seen/pending/unknown ger fortsatt deferred, aldrig fabricerad avslutskvittens.

Sjätte C04 fann en generell confirm trots godkänd body/cleanup. Produktens delade dirty-/spärrregistrering sker nu i layoutcommit med samma ID/cleanup. Åttonde C08 klarade body/cleanup på telefon men selectfält var23px; endast befintlig planning-select kompletterades med explicit height44px. Nativepil och övrig layout består. Nya faktiska omprov styrker båda produkträttningarna.

Fyra egna recoverykedjor städade endast deras tidigare syntetiska graf efter stoppad ägd3060 och separat förkontroll. Senaste [förkontroll](../../../work/pilot/results/phase5-39-fourth-context-recovery-preflight-20261007.json) `dbaf8a55` och [städning](../../../work/pilot/results/phase5-39-fourth-context-recovery-20261007.json) `dfa255db` använder fryst `98924ca8`,14 låsta egna sessioner och full bevaring före/efter/postcommit av15 originaltabeller/katalog/råACL/ALLaktuell audit/ALLäldre identiteter/tre tidigare mandatgrafer/retained egna ankare. Äldre fullhashkrav sänktes inte. Tredje preflightens alias-sorteringsfel stoppade före mutation och finns kvar som FAIL; v2:s separata bevis ersätter det inte.

## Leveransgräns och nästa steg

[Oberoende verifiering](05-39-VERIFICATION.md) följer planens tre observerbara mål. Fulla PLANERING-01/02 och fas5 är fortsatt Pending tills samlat05-43-prov; detta är lokal syntetisk verifiering, ingen verklig kommunanslutning eller pilotdrift. Sökbara tabeller/årsöverblick följer05-40, årskursknappar/projektion05-41 och GR/IM05-42. Handbok och konkret mänskligt prov ligger i05-43.

C01/C04 fångar kontextraden direkt efter årsbyte medan barnets lista laddar; bilderna styrker därför inte färdig årslista/matris. C04:s föregående spärrnotiser kan vara kvar efter tillåtet årbyte, en visuell begränsning som samlad UI-granskning ska hantera. År-/skolbyte fungerar ändå efter faktisk kvittens. Formell rektorsfärdigmarkering och huvudmannens godkännande är fortfarande ett eget öppet verksamhetsgap.
