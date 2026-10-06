---
phase: 05-bevarade-utbildnings-och-klassfloden
topic: planning-year
created: 2026-10-06
status: decisions_captured
implementation_status: not_started
requirements: [PLANERING-01, PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
---

# Läsåret som sammanhang för planeringen

Användaren beställde under röstsessionen 2026-10-06 en GSD-plan för att få ihop utbildningar, programplaner och timplaner kring ett valt läsår. Samma princip ska senare användas för individuella studieplaner, grupper, tjänstefördelning och schemaläggning. Beställningen gäller **planering av genomförandet**; dessa nya funktioner är inte implementerade av denna kontextfil.

## Beslut från samtalet

1. Planering har ett gemensamt valt läsår och skola inom aktuellt uppdrag. Det följer med mellan planeringsvyerna och kan flyttas framåt och bakåt.
2. Elevregister och löpande administration behåller sitt eget läsår. Att planera 2027–28 får inte ställa elevregistret i 2027–28. Vid första öppning används registrets aktuella läsår; ett separat uttryckligt registerval respekteras.
3. Vid återgång till planeringen ska det valda planeringsåret finnas kvar. Valet binds till session/uppdrag och återställs vid byte av identitet, kund eller uppdrag. Inget gammalt sparat urval är ett behörighetsbevis.
4. Ett läsår omfattar både nya utbildningar/kullar och dem som fortsätter. För normal treårig gymnasiekull i 2027–28 visas start 2027 som åk 1, start 2026 som åk 2 och start 2025 som åk 3.
5. Grundskolan behöver också överblick över relevanta årskurser, exempelvis åk 8 och 9. Den ska bygga på verklig årskurs-/klass-/timplanskoppling eller tydligt märkt prognos, inte en gissning från klassnamn.
6. Programplanernas och timplanernas nuvarande fungerande innehåll och terminsinmatning ska bestå. Översikt och navigation organiseras kring årets del av dessa planer.
7. Timplansöversikten ska vara en tabell som programplansöversikten. Båda ska stödja sökning, filter och valbar sortering, även när urvalet är större än en sida.

Användaren sade ”Så gör vi” om de separata urvalen och bad därefter om en GSD-plan. Samma beslut ska inte återfrågas vid genomförandet. Detaljerna nedan är implementeringsval utifrån detta beslut, inte ett nytt krav på godkännande av pilotens redan beslutade 42 krav.

## Föreslagen utformning att genomföra och prova

Navigationen skiljer **Planering** från löpande administrationsfunktioner. I planeringsområdet visas en enda lugn kontextrad: `Planering · Skola · ‹ Läsår 2027–28 ›`. Året går att välja direkt och flytta med föregående/nästa. Aktuellt läsår märks, och det finns en enkel återgång dit. Urvalet behöver inte en stor informationsruta eller en ny övergripande statusmaskin.

Första leveransen har en läsårsöversikt samt programplans- och timplansöversikter. Befintliga behöriga vyer återanvänds. Individuella studieplaner, grupper, tjänstefördelning och schema får gemensamma integrationspunkter; obefintliga skyddade funktioner får inga låtsasflikar eller fungerande skenknappar.

Exempel, **illustration av det avsedda beteendet och inga verkliga skolsummor**:

| Utbildning/kull | Årskurs 2027–28 | Programplan | Skolans timplan | Handling |
| --- | --- | --- | --- | --- |
| SA, start HT 2027 | 1 | Version och status | Utifrån exakt underlag, eller Saknas | Öppna årets del |
| SA, start HT 2026 | 2 | Version och status | Version och status | Öppna årets del |
| SA, start HT 2025 | 3 | Version och status | Version och status | Öppna årets del |

Tabellen får också visa årets poäng och timmar där underlaget räcker. Saknat startår, plan, timfördelning eller kalender visas som en konkret lucka. Ingen tom cell ska presenteras som sparat nollvärde. Olika skolors timmar följer deras egna timversioner även när programramen är gemensam.

Öppning från 2027–28 framhäver rätt del: exempelvis HT 2027/VT 2028 i åk 2 för kullen som började HT 2026. Det ska gå att se och redigera hela matrisen där mandat och planstatus tillåter det. Ett årsurval flyttar inte timmar mellan terminsindex. Dator och telefon ska visa samma begripligt märkta år, källa och sparstatus.

## Datamässiga gränser

- Härled gymnasiets startläsår från faktiskt versionsbundet startdatum när det finns. Januari–juni tillhör enligt befintlig läsårsgräns föregående startår. Ett kalenderår i `offerings.start_year` och ett akademiskt startår är inte alltid samma sak. Saknat/tvetydigt underlag ger okänt årssnitt; fritexten `cohort` är visningstext.
- För en befintlig gymtimplan gäller dess frysta källa och startdatum. För en årsbunden klasskoppling gäller den explicit kopplade timplansversionen. Senaste utkast är inte automatiskt en historiskt använd plan. En vald plan utan tillämpningsbevis märks som planeringsunderlag.
- Grundskolans `class_timplans.start_year` är den dokumenterade läsårsnyckeln; `column_id` anger årskursen i den kopplade versionen. Det bevisar inte vilken position årskursen hade i de sparade timcellerna. Dagens läsväg bygger kolumner från föränderliga `offerings.grades`; originalkolumnkartan behöver därför en verifierbar källa. Samma antal kolumner räcker inte om exempelvis `[7,8,9]` har blivit `[8,7,9]`. Om äldre positioner inte kan bevisas visas plan och årsbindning, men årstimmarna markeras okända och osäker cellsparning spärras. `school_classes.start_year` ensam anger inte att klassen gick i åk 1. Äldre namnnycklar resolveras kontrollerat mot verkligt klass-ID; inga nya integrationsrelationer byggs på klassnamn.
- Saknas en framtida klasskoppling får en möjlig progression högst vara en uttrycklig prognos med källa och osäkerhet. Årsbytet skapar inga klasser, elever, placeringar eller timplanskopplingar. IM får ingen påhittad treårsmodell.
- Planeringsåret kan väljas även om det ännu inte finns en kalender i `school_years`. Saknad kalender blockerar kalenderberoende beräkning, inte valet att planera. Inga fiktiva register-/kalenderposter skapas för att få fram en översikt.
- En planerad timfördelning är inte personaltimmar, genomförd undervisning eller schema. Utan grupper, samläsning och resursunderlag får flera kullars timmar inte påstås vara en färdig tjänstefördelning.
- Status och skrivrätt kontrolleras fortfarande mot dagens session, mandat och planregler. Valt historiskt eller framtida läsår flyttar inte serverns datum, återupplivar uppdrag eller öppnar låsta utkast.

## Första leverans och senare arbete

Första leveransen är separata kontexter, korrekt års-/kullprojektion, serveravgränsat urval, sökbara tabellöversikter och rätt år i nuvarande planvyer. Den omfattar automatisk syntetisk verifiering, handbok och en konkret mänsklig provbeskrivning efter leverans. Hela ADMIN-02/03/04 och fas 5 slutgodkänns inte av detta.

Senare moduler ska konsumera en uttrycklig kontext med kund, skola, läsår, period, stabila käll-ID:n, exakta versioner/revisioner och operationsmandat. Ändrade källor behöver konsekvenshantering. Det hör ihop med schemadelprojektets S1/S3, STUDY-01, GROUP-01 och SCHEMA-01/07. Varken Rustmotor, nya studieplansskrivningar, nya roller, automatisk elevuppflyttning eller schema-/tjänstepublicering ingår här.

## Tidigare underlag som behöver rättas

Den äldre [läsårslins-todon](../../todos/pending/2026-09-12-l-s-rslins-st-lla-sig-i-ett-l-s-r-som-i-plan-digital.md) beskriver dåvarande läge och förslag. Dess globala år, automatiska klasskoppling och stora gemensamma statusflöde ersätts av besluten ovan. Den beställda [tabellöversikten](../../todos/pending/2026-10-06-tabelloversikter-med-sokning-filter-och-sortering-for-planer.md) genomförs inom samma paket, inte genom en konkurrerande lista.

Äldre 05-25–35 har redan `replan_required`. Årsöversiktens tabellarbete ersätter motsvarande öppnings-/tabell-/filterarbete i den gamla 05-30-planen. Formella beslut, garantikontroll, 05-17:s yrkesram, full 05-23/E, nya klasskommandon och mänsklig begriplighetsbedömning kvarstår separat. Bygg inte den redan levererade programplan–timplan-övergången eller radvisa timsparningen igen.

Underlag: [färsk kodinventering](05-PLANNING-YEAR-DISCOVERY.md), [genomförandesteg](05-PLANNING-YEAR-IMPLEMENTATION.md), [schemadelprojekt](../../research/SCHEMAMODUL-PROJEKT.md).
