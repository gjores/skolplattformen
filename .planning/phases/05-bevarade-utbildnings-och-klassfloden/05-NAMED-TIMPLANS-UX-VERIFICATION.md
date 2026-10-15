---
phase: 05-bevarade-utbildnings-och-klassfloden
package: NAMED-TIMPLANS-UX
status: actual_verification_pass_local_delivery_pending
---

# Samlad verifiering av namngivna timplaner

Detta avser det beställda gapet CLASS-COHORT-UX-01. Ingen full fasacceptans, mänsklig begriplighetsacceptans eller verklig SS 12000-anslutning följer automatiskt av resultaten.

## Kandidat och provgräns

Produktrevision `c8f3256fc869c0002c44fd1c181cd6a27d0df6ab`, skyddat bygge med204 filer, artefakt-SHA256 `9ef82e4d125e231082ec70e4ba2f1b3dd0df7a7d1dbed40a820a4eebc6871c2e`. Verifieringsverktygen binder aktuella produktkällor, fem migrationsfiler, AST-inventerade transitiva verifieringsberoenden och exakta byggbytes före/efter provet. Senare dokument-/verktygscommits är inte nya produktbyggen.

Tunga schema-, konkurrens-, API- och browserprov körs i separat tillfällig schema-only-kopia, enbart med syntetiska repositoryfixturer. Egen lokal GoTrue från samma installerade bild och tillfälliga egna Keycloak-identiteter ger riktig OIDC/MFA. Inga autentiseringssvar eller verksamhets-API-svar simuleras. Avbrutna svar injiceras först efter bekräftad verklig200; samma kommando provas sedan igen. Ingen liverad exporteras. Alla rapporter och eventuell privat autentiseringsjournal hålls utanför Git med privata filrättigheter.

## Verifierade delresultat

| Område | Resultat och avgränsning |
| --- | --- |
| SQL-paket och samtidighet11 |10 kontroller samt8 faktiskt överlappande tvåsessionsfall PASS;62 gamla tabellprojektioner, DDL/ACL och rollback kontrollerade. Se11-SQL-SUMMARY. |
| SQL-läsningar05 |25 kontroller PASS med verkliga SQL-/server-/klientprojektioner, flera serier, pagination och GR/IM-fixturer. |
| Kombinerade rena/serverprov |93/93 PASS, DB-/sessionsdubblar där respektive svit använder det. Logg `/private/tmp/named-combined-node.log`. |
| UI08 |36 syntetiska browserprov PASS; rena journalprov2/2. |
| UI09/10 |22 nya års-/navigationsfall,42 usabilityregressioner och32 klassköfall PASS på dator/telefon efter sista produktändringen. Navigationsprov35/35. Se10-SUMMARY. |
| Produktkontroller |`npx tsc --noEmit`, full `npx oxlint app lib`, `npm run build:protected` PASS. Oanvända testvariabler fick explicita utelämningsalias; ingen beteendeförändring. |
| Handbok |`npm run docs:build` PASS efter sista korrigeringen av pluralflöde, klassankare och beslutstext. |
| Leveransverktyg |55/55 rena negativa-/filbytesprov PASS; innefattar48 snäva JWT-prov mot verktygets egna helperbytes. Inga liveoperationer i dessa tester. |
| Faktisk API/browser |38/38 PASS:8 sammanhängande UI-kontroller per enhet (Chromium1440 och WebKit/iPhone390),22 API-/authkontroller. Alla tre egna cleanupsteg kompletta; bilder granskade. |

## Slutligt faktiskt resultat

`/private/tmp/named-actual-fifth.json` PASS38, SHA256 `e67340426e8116bb59af095108a52fadcfd50b5224739714f333ac50be568f8a`.13 faktiska normala/MFA-callbacks är bundna till observerade requests, session och audit. Båda browser-sidecarer PASS med6 bildbevis vardera och oförändrade slutliga källor/migrationer/artefakt. Root har läst alla bilder; bildhasharna binds i huvudrapporten efter granskningen. Fullsidesskärmbilder visar sticky-kontext vid aktuellt scrolläge; tabellens interna horisontella skroll är skild från sidöverströmning.1440/390-pixelgränserna passerar.

Datorn kopierar800 årstimmar och ökar matematikHT2027 med40 till840 i A; B behåller800. Telefonen kopierar den redan fastställda dator-A till två nya egna planer och ökar bara telefon-A med40 till880; telefon-B behåller840. Årsöverblicken verifierar rätt plan-ID, serie/version, timmar och klassantal samt öppnar exakt B med bevarad skola/läsår. Årstestets `index<2` gäller uttryckligen fixturens första läsår och första matematikterm; ändras fixturåret måste termprojektionen följas. Båda enheter återhämtar verkligt förlorat200-svar vid skapande och andra klasskopplingen, utan att skicka om första klassens kommando. Ursprungsplanens timmar, programplanens rader och redan befintliga syntetiska länkar bevaras.

API-proven omfattar fyra rollinloggningar, mandatmaskning, case-insensitiv namnkonflikt, CSRF, föråldrad sessionkontext, immutable replay, timmar/poäng, samtidiga fastställda v1, separata och gemensamma klasslänkar, namnbyte/A2 med bevarade andraårsband, utgången MFA med exakt verklig step-up, SQL/server/klientparitet, auditrollback och omedelbart nekad åtkomst efter spärrat medlemskap. Alla38 kontroller kördes i samma obrutna slutkörning mot samma204-filsartefakt.

## Bevarad felhistorik

- Authsmoke: första fixtureförsöket saknade personalbindning för skolmandat och gav403. Fixtures skapades därefter genom befintlig mandatfunktion. `/private/tmp/named-auth-smoke-second.json` PASS med faktisk normalcallback och MFA; detta använder ett äldre bygge och är endast authförberedelse.
- Första fullförsöket stannade före databas-/runtimearbete när en regex även tolkade en importsträng i verifieringskällans exempel. Inventeringen använder nu TypeScript-AST för verkliga import-/exportdeklarationer; dynamisk browsermodul är explicit inkluderad.
- `/private/tmp/named-actual-second.json`:20 faktiska HTTP-kontroller PASS före testets felaktiga503-förväntan. Etablerad `authz.ts` ger500 med `audit_unavailable`; förväntan rättades och specifik felkod kontrolleras. Ingen produktändring.
- `/private/tmp/named-actual-third.json`:21 HTTP-kontroller PASS inklusive auditrollback; egen revocationfixture saknade obligatoriskt `blocked_at`. Fixture rättad enligt befintlig DB-constraint, ingen produktändring.
- `/private/tmp/named-actual-fourth.json`:5 faktiska datorflöden PASS, inklusive kopia/avbrott/reload, separata v1, matematik, namnbyte och två faktiska fastställanden. Kötestet läste den journalförda okända mellanstatusen före avslutat första anrop och förväntade för tidigt två skickade kommandon. Väntar nu även på återaktiverad återhämtningsknapp och faktiskt injicerat andra svarsbortfall.
- Samtliga ovan påbörjade isolerade körningar har bekräftat full egen OIDC-, runtime- och snapshotcleanup. Inget misslyckat försök används som slutligtPASS.

## Byggkatalogavvikelse

Samordnarens kandidatbygge skrev av misstag till den katalog som den äldre3012-processen fortfarande använde. Sammanfattningens antagande om privat runtimekopia var fel. Tidigare leveransrapport bands till exakta process-ID:n/starttider och den bevarade201-filsartefakten `88145bc`, SHA256 `5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c`. Dessa filer och de borttagna privata konfigurationsfilerna återställdes till exakt tidigare hashvärden; manifestet var oförändrat. Health före/efter PASS, inga processer stoppades och ingen databas ändrades. Nykandidatens bytes bevarades separat. Privat rapport `/private/tmp/named-active-baseline-restored.json`. Leveransverktyget kräver nu en tidigare godkänd runtime-/artefaktrapport innan backup och byte; senare prov bygger från den bevarade privata kandidaten.

## Kvarvarande gränser

Lokal schemaapply med originalkolumnbevarande, exakt artefaktöverföring och läsande leveranskontroll återstår. Användarens begriplighetsprov är förberett men inte observerat. Historiska integritets-/prestandagränser och fasens övriga gap består. SS12000:2024/OpenAPI2.1.0 följer paketets mappning; timplansserie är intern planeringsmetadata och inget externt informationsutbyte har provats.
