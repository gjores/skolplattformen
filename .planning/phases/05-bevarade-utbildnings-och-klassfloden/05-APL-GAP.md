---
phase: 05-bevarade-utbildnings-och-klassfloden
gap: APL-01
status: stage1_in_progress
date: 2026-10-16
implementation: stage1_in_progress
related_requirements: [ADMIN-02, ADMIN-04, PLANERING-01, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08]
---

# APL – planering, elevplatser och uppföljning

## Beställning och status

Användaren säger att rektorsflödet fungerar och beställer ordentlig research om hur timplanen och planeringsmodulen kan stödja rektor och huvudman i att planera och genomföra APL. [Researchen](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) är klar: aktuella primärkällor, färsk kodinventering, arbetsflöden, modellrisker och föreslagna verifieringsfall. Användaren svarade därefter ”låter som en bra lösning”. Riktningen med tre etapper och start i timplanen är därmed godkänd; etapp 1 konkretiseras i [kontext](05-APL-CONTEXT.md), [kontrakt](05-APL-CONTRACT.md) och [genomförandeplaner](05-APL-IMPLEMENTATION.md). Användaren beställde därefter genomförandet med ”top kör på nu”. APL-01 är modellverifierad och APL-02/03 SQL-verifierade i isolerade kopior. APL-03:s 33 kontroller och tre faktiska samtidighetsfall bevarar äldre beslut, kopieringsunderlag och klasslänkar. APL-04/04A API och versionsmedveten återhämtning är verifierade med 89 Node-prov och 28 faktiska PostgreSQL-Worker-/serverkontroller. APL-06:s beslutsvy/handbok är simulerat UI-verifierad med 26 dator-/telefonprov. APL-05 är klar med44 simulerade dator-/telefonprov. 10 av11 paketplaner är klara; APL-07 passerar65 kontroller och12 samtidighetsfall. APL-08:s faktiska HTTP/OIDC-/browser34, bildgranskning och läsande förberedelse PASS. APL-09 är installerad och lokalt verifierad efter exakt godkännande. Mänskligt prov iAPL-10 återstår.

Dagens skyddade timplan har generiska terminstimmar och ett manuellt APL-intygande. Den saknar strukturerad APL-plan, elevplatser och faktisk uppföljning. Kryssrutan är bevarad beslutshistorik, inte bevis på planerade perioder eller genomförd utbildning. Äldre APL-exempel i läsårsmodellen och produktdesignen är inte ett skyddat genomförandeflöde.

## Godkänd riktning

1. **APL i timplanen:** utbildningsform, perioder, ämnesnivåer/delar, läsår och total/varav APL. Visa om omfattning och timfördelning är granskade. Första etappen avgränsas till befintliga skolförlagda nationella Gy25-yrkesprogram. Lärling får inte passera med den vanliga 15-veckorsregeln.
2. **Platser och ansvar:** arbetsställen och kapacitet per period, elevplacering, handledare och lärare, förberedelser och åtgärder inför start. Rektor ser individluckor; huvudmannen ser kapacitetsproblem och åtgärdsbehov.
3. **Genomförande och kvalitet:** faktiska tillfällen, frånvaro och okänt utfall, avbrott, läraruppföljning, komplettering och utvecklingsåtgärder. Schema-/närvarokällor och extern handledaråtkomst får egna kontrakt och verifiering.

Etappernas riktning är godkänd; detaljkontraktet är en konkretisering och ingen beslutad tidplan. En enklare timplansförbättring ska kunna göras innan en full schemamodul finns.

## Bevarande och nödvändiga modellbeslut

- APL-vecka, faktisk arbetsplatstid och omräknad garanterad undervisningstid är olika mått. Delveckor och frånvaro saknar en tillräckligt verifierad generell beräkningsgrund i denna research och kräver fortsatt precisering före automatisk kontroll.
- Befintliga timmar kan redan innehålla APL. Bevara totaler och historik; ny APL-redovisning får inte adderas dubbelt eller märka gamla totalsummor som enbart skoltid.
- Bevara namngivna parallella timplaner och explicita klass–timplansversion–läsårskopplingar. Två klasser ska kunna ha olika APL-förläggning trots gemensam programplan.
- Rektors beslut om förläggning och huvudmannens fastställande av timplanen är separata ansvarshändelser. Ingen ny roll får godkännandemandat genom en APL-vy.
- Kopiera planeringsstruktur uttryckligt, aldrig gamla elevplatser, säkerhetsbesked eller personutfall som nya verifierade fakta. Planrevision och löpande utfallsrapportering behöver skiljas åt.
- Följ SS 12000:2024, utgåva 4, och publicerat OpenAPI 2.1.0. Person/Group/GroupMembership och Activity/CalendarEvent/Attendance är möjliga delprojektioner. APL-placering är ett eget domänobjekt, inte standardens förskole-/fritidshemsobjekt Placement. Arbetsmiljö, handledarrelation och beslut saknar full verifierad mappning. Detaljer, källhash och utbytesfall finns i researchens avsnitt 6 och 8; ingen extern anslutning är verifierad.

## Kravspårning och nästa GSD-steg

ADMIN-02, ADMIN-04 och PLANERING-01 är berörda bevarandegränser i fas 5, inte nya godkända APL-krav. SCHEMA-01/03/07/08 berör senare kalender, informationsutbyte och uppföljning i schemadelprojektets S1/S4. Researchen ger inga nya implementerings- eller runtimebevis för dessa krav och ändrar inte pilotens 42 krav eller fulla fasacceptans.

Etapp 1 är avgränsad i GSD-discuss/plan utifrån godkänd riktning. Elva planer i åtta vågor har passerat [oberoende plancheck](05-APL-PLAN-CHECK.md). [Planpaketet](05-APL-IMPLEMENTATION.md) preciserar datamodell och beräkning, granskning av äldre timmar, mandat, migrationsbevarande samt dator-/telefonprov och berörda handbokssidor med dokumentationsbygge. Researchens acceptansfall omfattar dubbelräkning, klassvarianter, individluckor, lärling, historik, säkerhet och SS 12000; de är föreslagna, ännu inte utförda.

Den befintliga [analys-/schema-/APL-punkten](../../todos/pending/2026-10-05-samordna-plananalys-schema-och-apl.md) behålls och uppdateras. Senast levererade produktrevision är a34dd199a96a1c24448c1c6ad8a688da4b91949a enligt rektorspaketets bevis; ingen app-/databasändring eller ny runtimekontroll görs i detta researchsteg.
