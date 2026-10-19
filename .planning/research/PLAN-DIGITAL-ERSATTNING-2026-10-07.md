# Ersättning av Plan Digital — observationer, beslut och förslag

Datum: 2026-10-07. Status: användarbeslut och research. Inget här är implementerat eller verifierat, och kravformuleringarna är förslag tills omplaneringen har bekräftat dem.

Underlag: läsande genomgång av Plan Digital (LBS Kreativa Gymnasiet Stockholm Södra, läsår 26/27) i användarens webbläsare 2026-10-07, samt läsning av projektets planeringsfiler. Inget ändrades i Plan Digital. Personuppgifter (personnummer, namn, signaturer) har inte kopierats hit. Äldre observationer av läsårsmodellen finns i `docs/plan-digital-lasarsmodell.md`.

## Användarbeslut 2026-10-07

1. **Skolplattformen ska helt ersätta Plan Digital.** Det är inte en komplettering. Tjänstefördelningen är därmed inte valfri.
2. **LBS är första användare.** Kommunpiloten är inte bunden av avtal och får inte fördröja bytet. Pilotens 42 v1-krav och åtta faser är oförändrade tills omplaneringen beslutar annat.
3. **Schemat ska ligga i appen.** Exporterna till Skola24 Schema och Royal Schedule behövs därför inte. Plan Digitals exporter används i dag för BIA och för schemaläggning. BIA-exportens fält är inte kartlagda.
4. **Gy11 släpps helt.** Gy25 är enda läroplan i Skolplattformen. Se [todo om Gy11](../todos/pending/2026-10-07-slapp-gy11-i-skolplattformen.md).
5. **En timme är alltid en timme** (60 minuter).
6. **Appen ska kunna redovisa båda delarna av lärares undervisningsuppdrag** (undervisningstid, samt planering och uppföljning) och stödja rektor och huvudman i att följa förordningen. Förordningen kan ändras, så reglerna ska ligga som data. Se [förordningsunderlaget](LARARES-TID-SFS-2026-1487-2026-10-07.md).

Tidigare beslut som ligger kvar: rektor färdigmarkerar och huvudmannens representant godkänner ([todo 2026-10-06](../todos/pending/2026-10-06-rektor-fardigmarkerar-och-huvudmannen-godkanner-planarbete.md)).

## Vad Plan Digital gör (observerat)

| Område | Observation |
| --- | --- |
| Läsår | Väljare 15/16–30/31 styr alla vyer. 17 skolenheter väljs i en egen lista |
| Timplaner | 40 aktuella, 0 framtida, 50 arkiverade. T1–T6 följer terminerna. Tre trädnivåer (bas, inriktning, fördjupning). Timplanens status har åtta steg: administratörsarbete pågår, administratörskontroll krävs, arbetslagsledare arbetar, arbetslagsledare föreslår, rektor arbetar, rektor föreslår, i bruk, passerad |
| Program | Gy11 och Gy25 är separata program. IVAL26 innehåller dubbletter av kurser med olika koder (Gy11- och Gy25-koder) |
| Tjänstefördelning | Vyer per klass, kurs, program, ämne, lärare och specialuppdrag. Kolumner: schemalagd tid och arbetstid per termin, lärare, kommentar, samläsning, behörighetsmarkering. Summor per lärare, schematid per vecka (35,6 veckor) och varav elevtid |
| Arbetstid | För kursrader är arbetstid lika med schemalagd tid. Specialuppdrag (programansvarig, mentor, speciallärare) har egen arbetstid, ofta 0 schemalagd tid. Ingen formel observerad. Inställningsflikarna Tid och räknesätt gick inte att läsa |
| Analys | Tjänsteanalys: behörighetsgrad per klass (55–82 % i urvalet), obehöriga aktiviteter med alternativa lärare, oanvänd kompetens, nya och saknade lärare. Egen lista över personal utan tjänstefördelning |
| Rutiner | Förläng tjänstefördelning från förra året, flytta tjänst till annan person, massregistrering, skapa nytt läsår |
| Exporter | Skola24 Schema, Royal Schedule, SCB (pedagogisk personal), Skolinspektionen (undervisande personal), budgetunderlag, matriser |

## Luckor mot nuvarande planer

| Lucka | Status i planerna |
| --- | --- |
| Tjänstefördelning med arbetstid, specialuppdrag och behörighetsmarkering | GROUP-01 i v2 och bakom SCHEMA-01–08. Ingen modell för tidsslag eller specialuppdrag |
| Statusmodell för läsår och plan | Rektors färdigmarkering och huvudmannens godkännande är tvåstegs. Läsårsstatus med lås finns i `docs/plan-digital-lasarsmodell.md` men inte som krav |
| Samläsning och blandgrupper | Ingår i GROUP-01, ingen egen relation |
| Årsrutiner (förläng, flytta tjänst, massregistrering) | Inte planerade |
| Analys och tvärskolevy för huvudmannen | LLEG-03 täcker behörighetsmatchning men inte analysvyn |
| Lärares tid enligt SFS 2026:1487 | Saknas. Se förordningsunderlaget |
| Export till BIA, SCB och Skolinspektionen | Saknas. Fält ej kartlagda |
| Migrering från Plan Digital | Saknas |

Poängsummor i Plan Digitals träd kan överstiga programmets poäng (till exempel ES26 1 936 + undertimplaner = 2 836). Programplanens valblock med poängtak ska säkerställa att en sådan summa aldrig visas som en giltig plan; detta ska verifieras.

Där Skolplattformen redan är före: programplan skild från timplan med valblock och terminer, kullkopiering utan elever, skolmandat, revisionsspår och exakt källversion. Plan Digital väljer en skolenhet i taget; en samlad vy över alla LBS-skolor sågs inte.

## Föreslagen ordning

1. Gemensam statusmodell för läsår och plan, med rektors färdigmarkering och huvudmannens godkännande som steg i samma kedja.
2. Samläsning som egen relation i datamodellen, före tjänsteraderna.
3. Tjänstefördelning, första versionen: rad per kurs × klass × lärare × timmar per termin ur timplanens årskolumn, samt specialuppdrag.
4. Lärares tid enligt förordningen (regelprofil, redovisning, avvikelser). Se förordningsunderlaget.
5. Lärarregistret (LLEG L1–L2), eftersom behörighetsmarkeringarna hänger på Skolverkets underlag.
6. Schemamodulen (SCHEMA-01–08), eftersom schemat ska ligga i appen och schemalagd tid då kommer ur schemat.
7. Analys- och tvärskolevy för huvudmannen, samt exporter (BIA, SCB, Skolinspektionen).

Förslag till placering: en ny fas efter fas 5 (till exempel 5.1 Tjänstefördelning och lärares tid, 5.2 Schema i appen). Tjänstefördelningen behöver skola, klass, kull, timplan, lärare och mandat, men inte elevregister, registerimport (fas 6) eller kommunanslutning (fas 7). Det gemensamma identitets- och periodkontraktet (SCHEMA-01, PLANERING-05) bör skrivas före tjänsteraderna. Slutlig placering beslutas vid omplaneringen.

## Övergång

1. Medan Plan Digital är källsystem läser Skolplattformen dess exporter för analys och som migreringsunderlag. Använd signatur som nyckel, inte personnummer.
2. Nästa läsår (27/28) planeras i Skolplattformen. Pågående läsår (26/27) ligger kvar i Plan Digital. 2024-kullen är den som läser Gy11 under 26/27 och är klar i juni 2027 (slutsats ur kurskoderna, inte kontrollerad mot Skolverket).
3. Plan Digital stängs när exporterna och schemat i appen fungerar.

Förordningen om lärares undervisningsuppdrag börjar gälla 2027-07-01, första dagen på 27/28, så regelstödet måste finnas från början i det läsåret.

## Öppna frågor

- Vem i AcadeMedia beslutar om Plan Digital, berör ett byte fler enheter än LBS, och när går avtalet ut?
- Vilka fält behöver BIA-exporten, och används SCB- och Skolinspektionsrapporterna?
- Ska historik (arkiverade timplaner och tidigare års tjänstefördelning) migreras eller arkiveras som export?
- Vilka roller får föreslå, godkänna och publicera tjänstefördelningen? Förslag: utkast (administratör, utvecklingsledare/arbetslagsledare), rektor granskar, godkänd (huvudmannens representant), publicerad (läraren ser sin tjänst).
- Hur ska samverkan med fackliga parter synas i flödet innan steget publicerad låses? Kontrollera med HR eller juridik.
- Vilket underlag ger Plan Digitals inställningar Tid och räknesätt? Är veckotalet 35,6 en konstant eller räknat ur läsårets kalender?
- Personal- och behörighetsuppgifter i migreringen kräver rättslig grund och skydd. Rådgör med dataskyddsombud före import.
