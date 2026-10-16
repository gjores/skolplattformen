---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-08
status: complete
updated: 2026-10-16
---

# APL-08 – faktisk integration och förberedd lokal leverans

APL-08 är klar; 9 av 11 paketplaner är klara. Ingen aktiv APL-installation eller byte av 3012 är utfört. [Releaseunderlaget](05-APL-RELEASE.md) anger kandidat, migrationshashar, ansvar och gränser.

## Slutresultat 2026-10-16

Sjätte körningen passerar **34 faktiska kontroller**: sju browserkontroller per enhet och tjugo API-kontroller. Chromium på dator och WebKit på iPhone 13 passerar 2/2 utan retries eller skips. Samma skyddade kandidat `68cecb41e1d61ae8381951ee295758c4f764511c`, 209 filer, artefakt `e37a996c33ba301a86490512aff7ab4a65f3ccd32337ba91ac5cc713062ae9c6` används för båda enheterna och API. 386 produktkällor, 59 verifieringskällor och samtliga tre migrationer är oförändrade före/efter.

19 verifierade OIDC-callbacks; alla tre egna fixturer, tolv egna syntetiska IdP-konton, tillfälliga redirects, runtime och schemakopia är fullständigt städade. Aktiv 3012 och dess databas har inte installerats om eller bytt version. Ett märkt transportfel tappar endast ett faktiskt lyckat sparsvar; övriga verksamhets-/authsvar är verkliga.

Alla 14 skärmbilder har granskats. APL-rubriken är fri från den fasta planeringsrutan, även direkt efter den riktiga länken. Telefonens spargranskning är vertikalt rullbar och knapparna synliga. Bilderna täcker APL-sammanfattning och spargranskning, inte varje separat beslutspanel eller klassdialog; dessa kontrolleras genom faktiska UI-handlingar/assertioner. Den allmänna planeringsrutans täthet är inte ombyggd i detta paket. Mänsklig begriplighet kvarstår.

Läsande installationsförkontroll och leveransförberedelse passerar mot aktuell lokal miljö, inklusive befintlig rektorsidentitet/mandat/MFA, gammal 3012-process, exakta byggbytes och schemabaslinje. `committed=false`, `databaseUnchanged=true`, `runtimeUnchanged=true`. Befintlig app är fortsatt `a34dd199a96a1c24448c1c6ad8a688da4b91949a`.

Oberoende slutgranskning av installations-, leverans- och städningsvägar hittade inga nya blockerare. Kontrollera före installation att `class-cohort-run.lock` fortfarande är ledigt; det var ledigt vid denna förberedelse. De 69 verktygsproven och riktad slutlint passerar. Modell-/server91, full typ-/produktlint och handboksbygge redovisas i föregående paketplaner; ingen ny handbokstext behövdes för fokus-/scrollrättningarna.

| Privat bevis | SHA-256 |
| --- | --- |
| `/private/tmp/apl-actual-sixth.json` (orörd rårapport) | `ffa88c53c3fb236b6e13e7c8bfeebe4ec1842a23096ddd15ced75f74d28bcdaf` |
| `/private/tmp/apl-actual-sixth-reviewed.json` (separat bildgranskad kopia) | `5983f86b455647407efa3369073845a3ca22a89b10c79f5d3b40882de350aa2d` |
| `/private/tmp/apl-install-preflight.json` | `62339401c162e64e2912b47f5bee30af75fb3925b9304cc6e39ea44c37783161` |
| `/private/tmp/apl-delivery-prepared.json` | `0be3ad4cce7e7bce0383ff7e8496bef7e101d25f9f4d49e2c9fdb55478c4a355` |

## Genomfört

- Faktisk Worker på egen port 3014, egen tom schemakopia och separata syntetiska kund-/skol-/planfixturer för dator, telefon och API. Verklig Keycloak → GoTrue → Worker, inklusive uppdragsval och MFA. Ingen demo-bootstrap eller verksamhetsmock används.
- Browserkedja för sparande/reload av tre femveckorsperioder/nio innehållskopplingar, 690 + 690 minuter, rektors bekräftelse, huvudmannens retur/fastställande, borttappat sparsvar och senare ändring, två namngivna varianter och exakta klass-/läsårs-/versionskopplingar. Ett särskilt märkt nätverksfel släpper svaret först efter verklig HTTP200; det simulerar transportbortfall.
- API-scenarier för faktisk behörighetsavgränsning, ursprung/context, staleCAS, okänd form/lärling/blandveckor, saknad totaltid, no-op/replay, obligatorisk Worker-audit och återkallat medlemskap.
- Installation och byte förbereds med exakta SQL-/API-/bild-/bygg-/källhashar. Överlappande källmanifest måste vara identiska. Läsande förberedelse kontrollerar också den befintliga leveransidentiteten och MFA-konfigurationen före permanent DDL. 69 verktygsprov PASS.

## Observerade avvikelser

1. Första kandidaten saknade genererade Tailwind-utilities i en källkopia under ignorerad katalog. Nytt separat bygge utanför ignoreträdet kontrollerar `.fixed`, `.z-50` och `.flex` samt oförändrad aktiv artefakt. Första kandidatens PASS avsåg kompilering och bytebevarande, inte fungerande UI; den levererades inte.
2. Testets obehandlade väntande HTTP-promise avbröt webbläsarens `finally`. Exakt journalförd återhämtning tog bort fyra egna syntetiska konton, egen tillfällig redirect och eget lås. Promisehanteringen rättades, och huvudrunnern kan återhämta den egna journalen efter avslutad worker. Inga befintliga IdP-konton eller verksamhetsrader berördes.
3. Riktig browser på båda enheterna visade att APL-länken tappade fokus genom navigering/remontering. `d294a27` håller ankaret inom monterad plan och flyttar fokus/scroll uttryckligen. Två riktade tangentbordsprov och TypeScript/full produktlint PASS. Tredje riktiga körningen passerade länken.
4. Tredje körningen stoppade därefter på testets exakta etikettmatchning av en förifylld textarea. Minimiprov visade att etikettens DOM-text inkluderade innehållet; korrekt tillgängligt textboxnamn matchar. Fältväljaren rättades. Båda OIDC-fixturerna, runtime och schemakopian städades fullständigt.

5. Fjärde körningen passerade förlorat sparsvar, bevarad senare ändring, ny rektorsbekräftelse och HM-fastställande. Testet använde därefter ett äldre namn på klassdialogen och klickade därför aldrig på dess bekräftelse. Väljaren är rättad mot aktuell komponent. Cleanup av den enda startade fixturen, runtime och schemakopia PASS. Telefonprovet startades inte efter datorfelet.

6. Femte körningen gav34 faktiska PASS (14 browserkontroller +20 API-kontroller),386 produktkällor/59 verifieringskällor oförändrade,19 verifierade callbacks och full cleanup av12 egna konton/runtime/schemakopia. Visuell mobilgranskning underkände rubrikens fria yta under fast planeringsruta. `68cecb4` rättar mobilens scrollmarginal; två riktade dator-/telefonprov PASS. Sjätte körningen mäter nu överlappning efter riktiga länken och vid bildfångst. Femte funktionella PASS är inte ett visuellt godkännande.

Privata första fel: `/private/tmp/apl-actual-first.json`, `/private/tmp/apl-actual-second.json`, `/private/tmp/apl-actual-third.json`, `/private/tmp/apl-actual-fourth.json`. Första körningens separat verifierade IdP-recovery: `/private/tmp/apl-actual-first-oidc-recovery.json`. Andra körningens övergripande cleanupfält räknade felaktigt den ej startade API-fixturen som saknad, trots kompletta två startade fixturer; räknaren är rättad. Rapporterna skrivs inte om till PASS.

## Återstår

Konkret installationsbeslut enligt APL-09 och därefter faktisk installation med bevarandekontroll och samma kandidat på3012. APL-10:s mänskliga begriplighetsprov och APL-etapp 2–3 kvarstår. Pilotens 42 krav, åtta faser och historiska 88/100 planer/3 verifierade faser ändras inte.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0: oförändrade skol-/organisations-/klassidentiteter, giltighet och ansvar; APL-underlaget är internt. Inget externt standardutbyte eller genomförd APL verifieras här.
