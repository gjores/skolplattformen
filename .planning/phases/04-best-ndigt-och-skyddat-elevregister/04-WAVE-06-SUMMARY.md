---
phase: 04
wave: 6
status: complete
completed_plans: [04-06, 04-12]
next_plans: [04-10, 04-14]
---

# Fas 4 — våg 6

Vågen bygger lokal rättelse mot simulerad källa (04-06) och elevlista med läsår och säkert urval (04-12). Genomförandet är lokalt och använder bara syntetiska uppgifter. Inga krav markeras slutverifierade här.

## Verifierat

- Modell-/serversvit: 372/372 PASS efter sista inloggningsrättningen. Logg `/tmp/wave6-node-auth-final.log`.
- Typkontroll och lint: PASS efter sista inloggningsrättningen. Riktade modell-/transportprov: 35/35 PASS.
- Skyddat appbygge: PASS. Slutligt byggmärke `d3b9ee6`, inklusive inloggningsrättningen. Logg `/tmp/wave6-build-auth-final.log`. Registerbrowserproven använder även tidigare byggen enligt nedan.
- Handboksbygge: PASS med uppdaterad användning, mandat, regler och säkerhetslogg. Logg `/tmp/wave6-docs-final.log`. Ingen publicering.
- Databas: den fullständigt bevarade registerfixturen 150/150 PASS och ny referensurvalsfixtur 20/20 PASS efter migrationerna 160–163, via målskyddad lokal Docker/psql.
- Bootstrap-/historikadapter: 13/13 PASS. RED→GREEN för saknad bootstrap, nullable systemaktör och slutet beslutskontrakt. Nekade roller, okända queryfält, felaktiga svar och loggfel lämnar inget innehåll.

- Källsimulatorn: PASS 3/3 med verkliga separata databasanslutningar och observerad låsväntan. Upprepad leverans ger ingen dubbel avvikelse/version; ett gammalt administratörsbeslut får versionskonflikt efter en ny källleverans. Egen fixtur städades och säkerhetsloggar bevarades. Commit `ba1812f`.

- Full SQL-regression: 16 filer, 607 passerade assertions; total FAIL på exakt sex kända äldre fas 3-fixturer (`boundaries`, `connections`, `mandates`, `matrix`, `policy`, `temporal`, samtliga `Case school scope denied`). Alla fas 4-filer passerar. Portning ägs av 04-14/15.

## Tillägg som behövdes för integrationen

List-API:t krävde skola/läsår men saknade starturval. Ny `GET /api/elever/urval` använder serverns levande mandat och referensdata, med obligatorisk transaktionslogg och `no-store`. Endast egna skolor, grupper/ärenden, supportmetadata och läsår lämnas; inget elevinnehåll. Läsårsvalen består av egna skolors registrerade år samt aktuellt/föregående/nästa enligt serverkalendern. Migration 161 öppnar endast den smala hjälpfunktionen för Worker; anon/authenticated nekas.

Källleveranser får `changedBy: null` i historiken och förfalskar ingen personalaktör. Besluten exponeras som den slutna unionen `resolution: local/source/null`. Samtidighetskonflikter anger Simulerad källa när senaste fälthändelsen är en systemleverans.

## Webbläsarverifiering

Elevlista: 13/13 unika fall PASS över riktade körningar, inte en samlad grön svit. Datorns första fem fall kördes på fcb4ab9 med startkontext/historikändringarna; datorns fallbackfall samt telefon 390 px sex fall och 320 px layout kördes efter WebKit-bygget c33fd5b. Dator och båda telefonbredderna är visuellt granskade.

Proven omfattar faktisk lokal OIDC/Worker/DB, obligatorisk beständig läslogg och no-store, sökning via POST utan lagring/URL, filter/bakåt/omladdning, sessionåterkontroll och utloggning mellan flikar, likadan återgång för okänd/främmande skola samt huvudmannens nekade registeråtkomst. Anonym rad provas separat med uttryckligt simulerad API-projektion; detta ersätter inte SQL-skyddsproven.

Lokala minimerade rapporter: `work/pilot/results/phase4-list-{desktop-run,desktop-fallback-pass,phone-layout-pass,phone-flows-pass,phone320-pass}.json`. Första desktoprapporten återgavs från observerad terminalutdata efter att Playwright skrivit över sin standardfil; den är inte ett ursprungligt fullständigt JSON-resultat. Tidigare avbruten telefonkörning p.g.a. lokal Worker som stannade är dokumenterad som blockerad, inte PASS. Bilder: `/tmp/skolplattform-wave6-desktop.png`, `/tmp/skolplattform-wave6-phone390.png`, `/tmp/skolplattform-wave6-phone320.png`.

Slutbygge d3b9ee6: inloggningsregression 2/2 GREEN (simulerad första session401), inklusive borttagning av oönskad query och gamla söknycklar. Verklig utloggning mellan flikar omprövad 1/1 PASS med logout200 och full rensning. Rapporter `work/pilot/results/phase4-auth-query-green.json` och `phase4-list-logout-final-pass.json`. Testcommit d18c2e8.

## Sista regressionsrättningar

Det verkliga WebKit-provet upptäckte en läsårsväljare under 44 px. Avgränsad CSS-rättning `c33fd5b` anger höjd och neutraliserar native appearance; telefonprovet passerar efter nytt bygge.

En oinloggad första sessionskontroll rensade även inbjudans returväg och IdP-felkod. Två isolerade browserprov med simulerad session401 visade RED. Rättning `d3b9ee6` bevarar endast `till=/inbjudan` och nekad inloggnings felkod i just denna startväg; verklig sessionförlust fortsätter rensa hela registerkontexten. GREEN 2/2 på slutbygget; verklig sessionsrensning omprövad PASS 1/1.

## Avgränsning

Elevkortets anslutning och ändringsdialoger kommer i 04-13. Namnen i listan är text tills kortet kopplas in; export-/personnummer-/skriv-API är fortsatt stängda enligt fasordningen. Markering innebär inte utförd export. Samlad UI-verifiering 04-19, full fasgrind och separat användar-/fasverifiering återstår. Sex äldre fas 3-fixturer behöver portning i 04-14/15; historisk fullgrind är inte grön. Inget verkligt register eller kommunanslutning är godkänt.

## Nästa steg

Våg 6 är genomförd: 04-06 och 04-12. Fas 4 har 11 av 22 genomförda planer. Nästa våg 7 är 04-10 (skyddade ändrings-, personnummer- och export-API:er) samt 04-14 (första delen av äldre SQL-regressionen). Kravstatus är oförändrad tills samlad fasverifiering.
