---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: COPY-ATOMIC
verified: 2026-10-14
status: passed-local-supported-copy
requirements: [ADMIN-03]
requirements_finally_verified: []
human_acceptance: awaiting_user
worker_build_revision: 2836908f810dd89c6135126b6cb766b32ac30783
---

# Atomär kullkopiering: avgränsad verifiering

Huvudmannens kopiering har en skyddad serverväg som sparar ny utbildning, version 1-utkast, ram, terminer och samtliga skolval i samma transaktion. Den klientstyrda kedjan av separata efterkommandon är borttagen. Inga elever, klasser, timplaner, tidigare beslut eller skolpaketsval kopieras. Originalet bevaras. Kvitto och läsande status binder samma fulla niofältsbegäran till aktuell verklig aktör och mandat.

## Färska resultat

| Kontroll | Faktiskt resultat och gräns |
| --- | --- |
| Modell/server | 41/41 relevanta Node-prov PASS, inklusive strikt response/request, HTTP-statusrundresa, mandat/MFA/origin/kontext och auditfel. |
| Verifieringsverktygens mål-/bevisgrindar | 8/8 offlineprov PASS. |
| SQL-rollback | 44/44 PASS. En/flera skolor, tom/fylld fördelning, ram, revisioner, start, käll-/requestkonflikt, aktuell mandatkontroll även vid replay, termins-/skol-/auditfel. Alla 60 publictabellers hela rader inklusive audit/identiteter samt DDL/ACL/journal återställda exakt. |
| Lokal foundation | Verify i rollback och därefter exakt apply PASS. Befintliga funktioner/grants och hela data bevarade; kopieentrypointen fortfarande stängd efter foundation. |
| Faktisk byggd Worker-preflight | 16/16 PASS på levererad produkts byggbytes; tillfälligt exakt execute återställt. SA25 v4 med två skolor, egna syntetiska sessioner. Två samtidiga identiska anrop skapar samma enda graf. Observerad källradslåsvänta med verkligt revisionsbyte ger HTTP 409. Worker-auditfel rullar tillbaka hela grafen. |
| Aktivering | Verify-rollback och apply PASS, endast den exakta kopieentrypointens execute till Worker plus avsedd journalpost. Klient-/audithjälpar-/tabellgrants är fortsatt stängda. |
| Faktisk Worker på vanlig 3012 | Slutlig 16/16 PASS mot aktiverat läge och slutliga versionshanterade provkällor. 58 hela verksamhetstabeller, äldre hela audit-/identitetsrader och full DDL/ACL/journal bevarade. Egen graf städad, inga okända/deferred anrop, DB stängd. |
| Isolerad UI | 18/18 PASS, nio dator och nio telefon, ingen retry/skip/flaky. Mockade API-svar. Förlust/okänd status, återförsök med samma UUID, revisionskonflikt, läsfel efter kvitto, formulär-/navigationsspärr och tangentfokus. |
| Faktisk browser/Worker/DB | F03 passerar 2/2 på dator och iPhone-viewport, ingen retry/skip/flaky. Ram, 2 500 terminsfördelade poäng, två skolor, separata paket, originalets hela rader/historik och exakt kopia efter omladdning. Syntetiska servermintade sessioner, ingen ny faktisk OIDC-inloggning. |
| Typ/lint/app/handbok | Färsk full TypeScript och app/lib-oxlint PASS efter statusrättningen. Separat protected appbygge PASS. Handbok byggd efter textändringen; ingen extern publicering. |
| Leverans | Samma slutbygge `2836908`, 192 bytekontrollerade filer på 3012. Föregående bygge bevarat privat, inget nytt bygge i huvudkopian. |

Root har granskat både isolerade och faktiska dator-/telefonbilder. Telefonens faktiska bild visar den fokuserade länken **Till innehållet** över en del av rubriken; detta är en tidigare noterad fokusdetalj, inte ett påstående om felfri telefon-UX. Tabellen rullar inom sin yta. Dator/telefon här är automatiserade viewports, ingen fysisk telefon eller mänsklig begriplighetsacceptans.

En oberoende GSD-verifierare granskade SQL-, route-, kvitto-, mandat- och återhämtningskopplingar och fann inga konkreta öppna P1/P2 i den avgränsade produkten. Den faktiska HTTP-körningen hittade därefter statusfältfelet nedan; root rättade det och verifierade det med rundreseprov och faktisk slutkedja.

## Första fel och rättningar

- Första komponentprov saknade syntetisk listrespons. Den rättades i fixturen. Senare läs-/kvittoprov hittade kvarvarande kopieringsform efter sparad kopia; produktens exakt bundna copied-återhämtningsankare rättades. Första FAIL/trace och slutliga 18 PASS hålls isär.
- API-preflight1 stoppade på PostgreSQL-resultatets listprototyp; tomma paketval krävs fortfarande, jämförelsen normaliseras till vanlig lista.
- Preflight2/3 hittade ett faktiskt statusfel: shared helper tillförde replayed i serverns statusresponse, som klientens strikta fyra-fältsparser nekade. `2836908` tar bort skapandefältet ur statusresponse. Server→klient-rundresa och slutliga HTTP-prov passerar.
- Preflight4: alla 15 verksamhetskontroller passerade, slutgrinden fann äldre saknade auditankare. Läsande inventering bekräftade 1 827 händelser 2026-09-30–2026-10-05. Äldre rader ändrades inte. Femte preflight och slutprov bevarar uppmätt historisk baslinje och kräver noll nya saknade ankare. [Historisk uppföljning](../../todos/pending/2026-10-14-utreda-historiska-loggankare.md) är öppen.
- Första tre faktiska F03-omgångar stoppade på äldre testantaganden om skola/läsår, texten Klar för beslut och knappetiketten Öppna. Proven väljer nu uttryckligt rätt skola/läsår, skiljer utkaststatus från verifierad pps-ready och öppnar samma exakta kopia via aktuell Granska och besluta-etikett. Produktbeteendet ändrades inte för dessa anpassningar. Alla ursprungliga innehålls-/original-/paketinvariants består. Fjärde omgången PASS 2/2.

Första privata API-filer `atomic-copy-api-preflight-20261014-first/second/third/fourth.json` och browserfiler `atomic-copy-real-browser-20261014.json` samt `-second/-third.json` behåller FAIL. De ersätts inte med gröna etiketter. Lokala komponentfel finns separat under web/test-results/.

## Bevisfiler

Privata råfiler innehåller inga utskrivna inloggningshemligheter i denna redovisning. Hashar gäller fulla rapportbytes; de är körbevis, inte påståenden om en ny faktisk kommunanslutning.

| Bevis | Lokal fil | SHA-256 |
| --- | --- | --- |
| SQL44 | /private/tmp/atomic-copy-rollback-20261014-first.json | `4438c9fd17426f761f4100bcdf87698748aff17c261d7c79a53589ac4d66ae22` |
| Foundation verify | /private/tmp/atomic-copy-foundation-verify-20261014.json | `fd3ff291e4eba6d8a5e2ca4e5285ff8b558735d7e0f7844268a24825f9a22513` |
| Foundation apply | /private/tmp/atomic-copy-foundation-apply-20261014.json | `b8bb7d81076b0ff9397d28ee8b726f8ad94d01568308b2e804bb639c48cf9a81` |
| API preflight16 | /private/tmp/atomic-copy-api-preflight-20261014-fifth.json | `142b32d4d068030b21363e73b97ca27b3d06f80620e23fd8c5156c88a13bd206` |
| Activation verify | /private/tmp/atomic-copy-activation-verify-20261014.json | `d4045ef07814dea796fc0c57786219437c134c7536870288d13add7955f469fd` |
| Activation apply | /private/tmp/atomic-copy-activation-apply-20261014.json | `ca49d1cd8152411ce0285c4b3d1dbdf856659ba7a7c07efd393f329370da3d94` |
| API slut16 | /private/tmp/atomic-copy-api-delivered-final-20261014.json | `f907f493f84e94dba8ed23373a9963385534b28757759e83cc6ab1f1707586db` |
| Browser faktisk2 | /private/tmp/atomic-copy-real-browser-20261014-fourth.json | `7963c98afdd2f3d1ff6aa10afdba1c29d53a52af181b82de0e8d7e15fd20b7af` |
| Browser mock18 | /Users/petter.gjores/dev/skolplattform/web/test-results/programplan-copy.json | `3ea93ed2a4d79a6dc4f44b5c00c88fb8690ed88be9c425dfc040c89b55528d55` |
| Byggöverföring192 | /private/tmp/atomic-copy-artifact-delivery-20261014.json | `2b671108da68d839a59f685b064b3c56f31677934b0aac84eea5a244458b4c6e` |

## Kvarstående gränser

Positiv faktisk HTTP/browser gäller SA25 v4, med verklig Worker/PostgreSQL och syntetiska testdata. SQL-grunden och befintliga uppgraderingsfunktioner är provade enligt matrisen; en positiv faktisk kopia av ett gammalt bundet v1-underlag har inte genomförts här. Ingen generell Gy11-/särprofilsacceptans följer. Aktuell login-/OIDC-kod ändrades inte; tidigare identitetsbevis redovisas som historik, inte nytt OIDC-prov.

ADMIN-03 får färska tekniska delbevis; [mänskligt kopie-/klassprov](05-COPY-CLASS-USER-TRIAL.md) är awaiting_user. Fulla ADMIN-01–04/PLANERING-krav och fas 5 är inte slutgodkända. ADMIN-01:s skyddade huvudmannaväg, 05-22:s historiska tidsstämplar och den inventerade historiska loggluckan behåller egna uppföljningar. Inga gamla metadata/identiteter gissas eller skrivs tillbaka. [Samlad kravgenomgång](05-CURRENT-AUDIT-20261014.md) anger nästa avgränsning.
