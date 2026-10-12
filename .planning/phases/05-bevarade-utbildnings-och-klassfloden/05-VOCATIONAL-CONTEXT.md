# Yrkesprogram och tydlig återsändning — 2026-10-12

## Användarbeslut

Användaren beställer samma kompletta programplan–timplan–beslutskedja för yrkesprogram som för högskoleförberedande program, med tydliga uppgifter i varje roll. Förtydligandet gäller endast inskickade planer före fastställande: huvudmannen ska kommentera vad som behöver rättas och skicka tillbaka planen. Ingen återöppning av fastställda beslut ingår.

Programplaner under arbete får finnas utan timplan. Timplanslistan visar endast skapade timplaner. Nya timplaner skapas från Programplaner med explicit skola och programplansversion. Dessa tidigare beslut består.

## Färsk kodinventering

Codebasekartorna ARCHITECTURE och TESTING är lästa; de är daterade 2026-09-11 och beskriver delvis äldre demoflöden. Följande skyddade kod är därför verifierad direkt 2026-10-12:

- `web/lib/programplan-table.ts:programTotal` ger idag bara 2 500 för högskoleförberedande program och null för yrkesprogram. `programFrame` och `analyseProgramplan` kan därför inte kontrollera yrkesramen.
- `web/lib/server/gym-timplan.ts:projectSource` spärrar skapande från yrkesprogram genom samma null-ram. Funktionen kontrollerar den frysta katalogen, kanoniska rader och terminsfördelning.
- `web/lib/server/plan-decision.ts:projectPlanDecision` hårdkodar HE, 2 500 poäng och 2 180 timmar, utöver katalog-/datumkontroll.
- `phase5_gym_timplan_require_source` definieras i migration 20261005110000. `phase5_plan_decision_source_blockers` och `phase5_plan_decision_detail` i 20261012180000 hårdkodar HE-profil och minimitid. Installerade migrationer ska inte redigeras; använd framåtriktad migration.
- `phase5_plan_decision_detail` tillåter huvudmannens return endast i submitted. Kommandot kräver kommentar, exakta revisioner och basisHash. Programplanens granskningsstatus ligger separat från grundstatus; timplan använder forslag/atersand. Fastställda/ersatta versioner förblir låsta.
- `plan-decision-panel.tsx` har redan återsändningsknapp och historik men kommentaren ligger i utfälld historik. `plan-decision-context.tsx` visar rollens revise/review/waiting i global Att göra och Start. Förtydligandet behöver följa hela kedjan, inte bara ändra en knapp.
- Befintlig modell `timplan-model.ts` innehåller yrkestimtal. De är ingen verifiering av aktuell rättsregel eller det skyddade flödet.

## Avgränsning och regler

Utgångspunkt är nationella Gy25-yrkesprogram i befintlig versionsbunden katalog och samma mandat-/startgränser som nu. Programspecifik poängram, undervisningstid, APL och grundläggande behörighet måste verifieras mot aktuella primärkällor innan en profil öppnas. Okända program, fel kategori, datum utanför kataloggiltighet och ofullständiga planer får inte ärva en allmän yrkesfallback. Individuella bortval, lärlingsupplägg, Gy11, GR/IM och anpassade/särskilda utbildningar ska inte felaktigt beskrivas som automatiskt verifierade.

Återsändning återför den inskickade versionen till rättning med obligatorisk motivering och beständig historik. Återsändningen ändrar inte ett äldre fastställt beslut, frysta timplansunderlag eller klasskopplingar. Efter rättning krävs nytt inskickande och nytt beslut.

## Genomförande

Filägarskap: modellagenten äger profil/ram/server i VOCATIONAL-01, SQL-agenten äger migration och DB-/API-harness i VOCATIONAL-02 samt API-uppgiften i 04, root äger UI i 03 och dokumentation/leverans i 04. Denna planerare ändrar endast dessa nya plan-/kontextfiler.

Fyra begränsade planer: verifierad profil och server, SQL-paritet, rollernas UI, sedan faktisk integration och leverans. Profil/server och UI kan utföras med separat filägarskap; UI:s slutverifiering väntar på profil/SQL. Databas- och tyngre verifieringar körs i turordning för att undvika den nyligen observerade minnesbelastningen.

Status: planerad beställning, inte verifierad leverans. Historiska 88/100 planer, 3/8 verifierade faser och fulla ADMIN-02/04/fasacceptans ändras inte av planeringen.

## Profilprecisering från pågående primärkällsgranskning

Modellagentens verifierade kodlista: BF25, HT25 och VO25 använder 2 700 poäng och 2 625 timmar. BA25, EE25, FR25, FS25, FT25, IN25, NB25, RL25 och VF25 använder 2 800 poäng och 2 720 timmar. Samtliga kräver exakt katalogkategori VOCATIONAL_PROGRAM. Primärkällslänkar och giltighetsgräns registreras i researchfilen av modellagenten; programändring från 2028-07-02 ska inte automatiskt ärva denna profil.

Katalogen innehåller redan ENGE nivå 1/2 och svenska eller svenska som andraspråk nivå 1/2/3. Nivåsummering och alternativräkning ska bevaras så behörighetsnivåer varken försvinner eller dubbelräknas. Extra manuella kontroller för behörighet och APL ska vara identiska mellan SQL och server och tydliga i UI.

Kvitton sparar det ursprungliga beslutssvaret. Identisk återspelning av ett äldre kvitto ska fortsätta fungera även när dagens yrkesprofil har nya check-ID:n. Dagens färska inskickande/fastställande ska däremot kräva aktuell profil och aktuella kontroller. Testa denna skillnad genom verklig SQL och API; ändra inte gammal historik eller gamla kvitton.
