---
phase: 05-bevarade-utbildnings-och-klassfloden
reviewed: 2026-10-12
status: source_review_passed
scope: independent_source_review
---

# Oberoende granskning — yrkesprogram och återsändning

Mål: kompletta nationella yrkesprogram kan gå från programplan till skolans timplan och beslut, med tydliga rolluppgifter och återsändning med motivering före fastställande. Detta dokument är en oberoende källgranskning enligt GSD verifier, inte bevis för faktisk Worker-/DB-körning eller mänskligt begriplighetsgodkännande.

## Fynd under implementation

### P2 — olika kontrollpunkter vid ogiltigt startdatum

I första granskade SQL-versionen returnerar `phase5_plan_decision_profile` null när startdatum ligger utanför profilens/katalogens giltighet. `phase5_plan_decision_detail` lämnar då endast två baskontroller. `projectPlanDecision` väljer däremot yrkestyp utifrån kod/kategori och kräver fyra kontroller. Det ger `Invalid decision checks` och ett 500-svar i stället för en läsbar beslutsspärr för exempelvis BF25 med start före 2025-07-01. Rapport skickad till båda implementerarna och root. Rättat i efterföljande källversion: profilfunktionen väljer enbart kod/kategori, medan source_blockers kontrollerar datum. Därmed bevaras fyra check-ID:n även vid blockerad yrkesstart. Färskt negativt datumprov genom SQL och TS inväntas fortfarande; källfyndet är stängt, körbeviset återstår.

### Verifieringslucka — flera återsändningar

Initial UI-fixtur använde historik i stigande ordning och prövade bara en återsändning, medan verklig SQL returnerar senaste händelsen först. Root har efter fyndet ändrat till `unshift` och lagt till ytterligare returcykel med explicit kontroll att den nya kommentaren visas och den tidigare inte visas i återkopplingsrutan. Den nya tvåcykelfixturen är direkt källgranskad; slutligt testresultat inväntas. Produktens `history.find(return)` är korrekt kopplat till SQL:s fallande historik.

## Källgranskade länkar

| Länk | Resultat hittills |
| --- | --- |
| Verifierad kod/kategori → programram | `programplanProfile` innehåller exakt tolv yrkeskoder, med BF/HT/VO 2700/2625 och övriga nio 2800/2720. Okända koder/fel kategori har ingen fallback. Sex HE-koder behåller 2500/2180. |
| Programram → frysta nivåer | `programTotal` använder profilen. Befintlig nivåsummering/alternativräkning består. `vocationalEligibilityComplete` kräver ENGE 1–2 och båda alternativa svenska/SVA 1–3 med exakta nivåpoäng. |
| Fryst program → timplansskapande | `projectSource` verifierar hela kataloghashen, referensversion, kanoniska rader, terminsfördelning och programanalys. Den tidigare yrkesnullspärren ersätts av den explicita profilen. |
| Timvärden → beslut | `projectPlanDecision` kontrollerar rader, aktiva terminer, positiv tid per rad, korrekt totalpoäng och profilens minimitid. Yrkesstarter från 2028-07-02 spärras för beslut med konkret förklaring. |
| Returkommando → aktuell kommentar | Panelen skickar befintlig `return` med obligatorisk trimmad kommentar, läser färsk detalj efter lyckat kommando och uppdaterar inkorgen. Senaste returkommentar visas direkt endast vid returned. Historiken bevaras. |
| Roller → synlig uppgift | Befintlig scopebunden provider och serverns taskfält driver global Att göra och Start. revise får texten Läs återkoppling och rätta. Programplan anger rektor; timplan anger rektor eller skoladministratör. |
| Fastställd version → låst beslut | Parsern förbjuder actions för approved/replaced, panelen visar bara serverns actions. SQL:s befintliga return gäller submitted, inte godkända versioner. Inga nya actions införs. |

## Gränser

Verifieraren ändrar inte produktkod, databas eller Git och startar inga tyngre app-/DB-prov. Modell-, SQL-, Worker-, browser- och buildresultat ska bindas till slutliga källor av implementerarna/root i slutverifieringen. Ingen full ADMIN-02/ADMIN-04 eller fas 5 markeras färdig här; klasskopplingar och andra tidigare gränser kvarstår separat.

## Slutlig källbedömning

Inga öppna P1/P2-fynd i den granskade produktkällan efter datumrättningen. Implementationen finns, innehåller faktisk logik och är kopplad till befintliga skyddade endpoints och UI. SQL-migrationen ändrar profil, källkontroll, beslutsspärr och detaljprojektion framåtriktat. Den innehåller ingen uppdatering av verksamhetsrader, gamla snapshots, historia eller klasskopplingar. Den nya interna profilfunktionen får uttryckliga revokes för PUBLIC/anon/authenticated/service_role/Worker; befintliga entrypoints behåller sitt kontrakt och sina behörigheter. Beslutskommandot och dess installerade runtimefix ersätts inte.

Kontrolluppsättningen är samma i SQL/server: structure/choices respektive teacher-led/choice-paths, kompletterat med eligibility/apl för exakt yrkesprofil. Fryst timunderlag läses med sin egen katalog/referens; den aktuella programversionens godkännande jämför innehåll genom befintlig source_content och skriver inte om snapshoten. HE-kvitton behåller samma två kontroll-ID:n och 2500/2180-profil; SQL:s kvittogren återlämnar sparat svar före färsk basisHashkontroll.

## Körbevis som måste följa före leverans

- SQL/TS negativ datumparitet för känd yrkeskod: läsbar blockerare och spärrat kommando, inte 500 från olika kontroll-ID:n.
- Gammalt HE-kvitto före migration ska efter migration återspelas identiskt och passera också TS-projektionen, inte bara SQL-jämförelsen.
- Verklig Worker-kedja för båda yrkesramarna samt faktiska inkorgar för HM/rektor/administratör vid submitted/returned; kontrollera rätt plan-ID, task, nästa roll och räknare. En parsning efter slutgodkännande bevisar inte detta.
- UI:s andra återsändning ska visa senaste kommentar direkt; äldre kommentar ska finnas kvar i historik. Dator/telefon och slutligt bygge återstår för root att binda till levererad version.

Dessa är verifieringsgränser, inte påståenden om att produkten har nya konstaterade fel. ADMIN-02 har här ett avgränsat yrkes-/beslutsdelbevis; ADMIN-04 stöds genom bevarade klasslänkar men ingen ny klasskopplingsfunktion är granskad eller levererad av detta arbete.

## Granskade produktbytes

- `web/lib/programplan-profile.ts`: `c61ec6a93ce45e3444c7ece14380b2ef2b894dbf131ad4c206b1d67a76a1e141`
- `web/lib/programplan-table.ts`: `6f6fd027f800346ea1b5389b4b858c4da5ce3d7be9bcc69215b81a092c286e1b`
- `web/lib/programplan-analysis.ts`: `85c7e8630c2195295aa4bebb623151aac6931a87dc0a01d4c30713bebb7f39fc`
- `web/lib/server/gym-timplan.ts`: `5038f79fc6553593d2c18ace04e4afcec3bc4ec272b385997cd79515d47bb3fb`
- `web/lib/server/plan-decision.ts`: `a8a78027a54f2aac8c19cde990b95fcbe10d8aa164f1741dd0e1d1ee7d671453`
- `web/app/plan-decision-panel.tsx`: `464a17a0e6d09b0d28c613a0739d282a59860110c1ffb30f3486c64ad5995231`
- `web/app/plan-decision-context.tsx`: `601246026dc772c31965096492a17668460d0acbbe001fdf98e5e86073cbf486`
- `web/app/plan-decision.css`: `0f8890b7b807fdc8c329cd3686428e40264d603d3ea7471c86412b9dc92d927f`
- `supabase/migrations/20261012200000_plan_decision_vocational.sql`: `f3a1f8a64f0fd91f16804f5394291d90589c28af002c221b5e71e85bf764404c`

## Förnyad granskning — huvudmannen väntar efter återsändning

Den senaste SQL-rättningen är källgranskad. Direkt approve för huvudmannen gäller nu endast vanligt draft; submitted behåller return/approve. returned ger inga huvudmannahandlingar. Befintlig nextActor-beräkning ger då rektor, och inkorgen klassar en i övrigt komplett återförd plan som waiting, utan att räkna den som ett nytt beslut för huvudmannen. Rektor behåller submit och revise; skoladministratör kan rätta timplan men inte programplan. SQL-kommandots aktuella actionskontroll spärrar försök att kringgå flödet med ett färskt approve-kommando.

Återspelning påverkas inte: kvittogrenen verifierar aktuell identitet/mandat och identisk request och returnerar sedan sparat svar före den nya actionskontrollen. Det ändrar inte äldre beslut eller skapar ett nytt godkännande. Panelens befintliga färska läsning efter lyckat kommando hindrar det gamla kvittots tidigare actions från att visas som aktuella.

SQL-harness har nu explicit 42501-prov för huvudmannens approve i returned och waiting/nextActor=rektor i inkorgen. Verklig API-harness har motsvarande 403-prov och prövar alla tre rollernas task/stage/nextActor samt räknare vid submitted och returned för båda plantyperna. Den tidigare efterfrågade HE-replayprojektionen genom TS och blockerade datumprojektionen finns nu i källan. Slutliga körresultat binds av root/SQLagent; äldre 96/96-resultat föregår denna returjustering och ska inte användas som bevis för den.

UI-följden är rättad och källgranskad: returned+waiting visar Inväntar rättning och draft+waiting visar Inväntar förberedelse. Ny rollinkorgsregression finns. En äldre återsänd version utan sparad kommentar visar nu uttryckligen att återkoppling saknas och hänvisar till huvudmannen, i stället för att hänvisa till en tom historik.
