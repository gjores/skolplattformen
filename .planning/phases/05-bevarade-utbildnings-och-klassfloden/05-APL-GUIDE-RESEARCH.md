# GUIDE-01 – verifierat regelunderlag

Kontrollerat 2026-10-16 mot aktuella primärkällor. Detta är avgränsad uppdatering för vägledning, ingen utökning av regler eller datamodell. Teknisk kontroll av implementerat stöd gjord mot `web/lib/apl-plan.ts`, `web/app/protected-apl-plan.tsx` och tidigare verifierad beslutsgång.

| Påstående | Källa och precisering | Användning |
| --- | --- | --- |
| Nationella yrkesprogram minst 15 veckor; vecka på arbetsplats motsvarar 23 GUT-timmar | [Gymnasieförordningen (2010:2039), 4 kap. 12 §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/) | Guide och handbok skiljer lagens veckokrav från appens stöd för hela granskade veckor. 5 × 23 = 115 är eget räkneexempel; 23 är inte arbetsschema. |
| Rektors beslut om ämnesnivåer/fördelning och huvudmannens ansvar för platser/utbildningskrav | Samma 4 kap. 12 § | Praktisk arbetsgång och ansvar; befintlig appbekräftelse och huvudmannens fastställande hålls isär. |
| Handledare med rätt erfarenhet och lämplighet | Samma 4 kap. 14 § | Handledare registreras inte i denna vy; användaren måste ordna och följa upp detta utanför appen. |
| Lärling mer än hälften från startläsåret för lärlingsutbildningen; särskild regelgrund | Samma 1 kap. 3 § och 4 kap. 12 § | Ingen förenklad 15-veckorsattest för lärling. Ingen automatisk godkännandefunktion för delveckor. |
| Skolförlagd ersättning för utebliven APL bara under särskilda förutsättningar | Samma 4 kap. 13 § | Ingen användare ska tolka saknad plats som ett fritt byte av APL mot skoltid. Appen saknar undantagsbeslut. |
| Lärar-/elev-/handledarkontakt och rutiner för bedömning | [Skolverket: Organisera arbetsplatsförlagt lärande](https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/organisera-arbetsplatsforlagt-larande-apl) | Kort sammanfattning, ingen ordagrann återgivning. Handledning rekommenderar konkret kontakt- och uppföljningsplan. |
| Minderårigas arbetsmiljö, risker, introduktion, tillsyn och arbetstider | [Arbetsmiljöverket: Praktik för minderåriga](https://www.av.se/arbetsmiljoarbete-och-inspektioner/arbetsgivarens-ansvar-for-arbetsmiljon/minderariga-arbetstagare/praktik-for-minderariga/) och [AFS 2023:2, 8 kap.](https://www.av.se/arbetsmiljoarbete-och-inspektioner/publikationer/foreskrifter/afs-20232/) | Aktuella föreskrifter, inte äldre AFS 2012:3. Skolhuvudmäns direkta ansvar enligt 8 kap. 2 § skiljer sig från praktikgivarens; guiden säger kontrollera tillämpliga arbetstider, inte att alla paragrafer gäller huvudmannen identiskt. |

## Kontroller som guiden beskriver

`projectAplPlan` kontrollerar känd/stödd utbildningsform och programkälla; fullständig klassificering; kopieringspunkter; förekomst av perioder och totaltimmar; APL-minuter mot terminscell; periodernas namn, datum, läsår och innehåll; granskade hela veckor; kalenderkapacitet; överlappningar; utbildningsstart och sex terminsintervall; preciserade ämnesnivåer och arbetsmoment; tidsfördelning inom periodens terminer; exakt 23 × 60-minuterssumma och minimiomfattning. Årskurs-/terminval är förberedande och ersätter inte dessa kontroller. Rektors innehållsbundna bekräftelse och huvudmannens fastställande är befintlig serverkontrollerad beslutsgång.

Guiden gör inga anspråk på kontroller av faktiska platser, handledare, riskbedömning, individuella placeringar, närvaro, genomförda timmar eller betygsunderlag. Den nya kalenderns ISO-vecka är datumhjälp och kan inte automatiskt bestämma granskad omfattning. Befintliga kalenderkapacitetskontroller är ett övre rimlighetsvillkor, inte bevis på fulla veckor.

## Avgränsningar och SS 12000

Stödda skolförlagda Gy25-yrkesprofiler enligt befintlig källa/årskullsvalidering. Lärling, blandveckor, komvux, IM och anpassad gymnasieskola behandlas inte som samma regelprofil. Befintlig spärr för yrkeskullar från 2028-07-02 behålls. Inga nya materiella lagtolkningar byggs in i valideringen.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 enligt huvudplanens avstämning: guide och datumfält ändrar inga identifierare, relationer, giltighetstider eller utbytesobjekt. Kalenderdatum förblir YYYY-MM-DD. Inget stöd för Attendance/Placement eller verklig anslutning härleds ur en plan eller bekräftelse.

## Verifiering

Handbokssidan `apl-planering` finns i Docusaurus sidebar och länkas från `timplaner`. Docusaurusbygget passerade 2026-10-16. APL-komponentprovet utökas med läsning via tangentbord i låst plan, hela arbetsgången, källor, skärmstorlekar och noll skrivbegäranden. Faktiskt skyddat användarprov och slutlig leverans redovisas separat av huvudplanen.
