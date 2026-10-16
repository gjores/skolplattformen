---
title: APL – från timplan till genomförande och kvalitetsuppföljning
date: 2026-10-16
status: research_complete_direction_accepted_not_implemented
phase: 05
related_requirements: [ADMIN-02, ADMIN-04, PLANERING-01, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08]
code_revision: 39e69e81841470a597129420c98ef2e8d3b0867a
---

# APL – från timplan till genomförande och kvalitetsuppföljning

## Rekommendation

**Gör APL till ett sammanhängande planerings- och uppföljningsflöde med timplanen som ingång.** Rektor behöver kunna visa vad eleverna ska lära sig, när och var det ska ske och vem som följer upp. Huvudmannen behöver se om det finns tillräckliga och lämpliga platser, vilka elever som riskerar att inte få sin utbildning och vilka åtgärder som faktiskt hjälper.

Första etappen bör ge synliga APL-perioder och en begriplig tidsredovisning i timplanen. Därefter behövs individuell placering och genomförande. En förbättrad summering kan inte ensam visa att APL har ägt rum eller hållit god kvalitet.

Användaren beställde denna research 2026-10-16 efter att ha godkänt rektors skapande-/kopieringsflöde med ”Funkar!”. **Researchen är genomförd.** Efter redovisningen svarade användaren ”låter som en bra lösning”: riktningen och start med etapp 1 är godkända. Detaljerade funktioner nedan är fortsatt designförslag; [etappens kontext](../phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md) och [planpaket](../phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md) preciserar genomförandet. Inga produkt- eller databasändringar har gjorts. Fokus är det befintliga skyddade Gy25-flödet. Andra utbildningsformer beskrivs för att undvika felaktiga gemensamma regler.

## 1. Vad som är belagt

### Regler och ansvar

| Fråga | Verifierad huvudregel |
| --- | --- |
| Skolförlagda yrkesprogram | Minst 15 veckors APL. |
| Tidsredovisning | En arbetsplatsvecka motsvarar 23 timmar garanterad undervisningstid, GUT. |
| Gymnasial lärling | Mer än hälften av utbildningen, räknat från läsåret då lärlingsutbildningen börjar. Behörighetsnivåer som får väljas bort undantas från beräkningsbasen. |
| Förläggning | Rektor beslutar vilka ämnesnivåer/delar som arbetsplatsförläggs och fördelningen över läsåren. |
| Platser | Huvudmannen ansvarar för anskaffning och att utbildningskraven uppfylls. En lämplig, kunnig handledare ska utses. |
| Skolförlagd ersättning | Planerade platser bortfaller av omständigheter utanför huvudmannens kontroll, eller säkerhetsskäl. Huvudmannabeslut och samråd med lokalt programråd krävs; inte en generell dispensknapp. |
| Redovisningsansvar | Huvudmannen beslutar tidsfördelningen och redovisar hur eleven fått sin GUT. |

Källor: [gymnasieförordningen 3 kap. 3 § och 4 kap. 12–14, 22 §§](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/) och [autentiska SFS 2023:654](https://svenskforfattningssamling.se/sites/default/files/sfs/2023-11/SFS2023-654.pdf). Kontroll 2026-10-16. Gy25-lydelsen tillämpas på utbildning som påbörjas efter 2025-06-30; äldre kullar ska behålla sina tillämpliga kursregler. Vid bortfall av platser utanför huvudmannens kontroll kräver 4 kap. 13 § också åtgärder för återgång till arbetsplats snarast; den uttryckliga återgångsskyldigheten där gäller denna första undantagsgrund.

**APL är en förläggning av utbildning, inget eget betygsämne.** Undervisande lärare bedömer kunskaperna. Handledaren bidrar med underlag och är medbedömare i de arbeten där reglerna föreskriver det. En APL-räknare är inte en självständig examensregel. Gymnasial lärlingsutbildning har dessutom ett särskilt utbildningskontrakt per elev och arbetsplats; det ska inte beskrivas som ett identiskt generellt lagkrav för all APL. [Skolverkets regelvägledning](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/arbetsplatsforlagt-larande-apl), [skollagen 16 kap. 11 a §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/).

### Timmar som inte får blandas ihop

Skolverkets exempel för 15 hela APL-veckor vid en arbetsplats med 40-timmarsvecka ger **600 timmar på arbetsplatsen men 345 timmar i GUT-redovisningen**. Det är inte ett generellt krav på 40 timmar för varje elev. Arbetsplatsens arbetstid, rektors eventuella individuella beslut och minderårigregler måste hållas isär. [APL-lathunden 2025, s. 6](https://www.skolverket.se/download/18.7fd821f719b2bf51c07c0b4/1766142876633/pdf13363.pdf).

**Eget modellförslag:** skilj fyra mått: planerat utbildningserbjudande, faktiskt tillhandahållen utbildning, elevens närvaro och lärarens underlag om lärandet. En inställd plats, en sjukdag och en dag utan rapport är olika händelser. Ingen av dem ska automatiskt skriva över de andra måtten.

De granskade nationella källorna gav inte en tillräckligt säker generell algoritm för delveckor, röda dagar, blandade skol-/APL-veckor och individuellt kortare arbetstid. Detta är en uttrycklig kvarstående tolkningsfråga inför automatisk kontroll. **Inför varken faktisk tid/40 som allmän veckoregel eller automatiskt GUT-avdrag lika stort som elevfrånvaron.** Delveckor kan planeras och visas, men en obestyrkt beräkningsgrund ska ge ”Behöver bedömas”. Ingen kontakt med Skolverket eller juridisk rådgivare har tagits inom researchen.

### Skolformer behöver skilda regelprofiler

| Utbildning | Avgränsning för en framtida regelmodell |
| --- | --- |
| Gymnasiets nationella yrkesprogram | Ovanstående grundprofil; lärlingsform och startläsår kräver egna uppgifter. |
| Högskoleförberedande program | Huvudmannen beslutar om APL ska finnas och dess omfattning. |
| Anpassade gymnasiets nationella program | Skolförlagd utbildning: minst 22 veckor och 25 GUT-timmar per arbetsplatsvecka. Lärlingsutbildning: mer än hälften, enligt dess särskilda beräkningsbas. |
| Introduktionsprogram | Programinriktat val mot yrkesprogram har APL; yrkesintroduktion APL eller praktik. Ingen generell 15-veckorsgräns för IM. |
| Fjärde tekniskt år | Minst 10 veckor APL; separat profil. |
| Komvux, sammanhållen yrkesutbildning | Minst 15 procent av utbildningen, eller av den del som återstår efter validering. Undantag kräver elevens begäran och rektors individuella beslut. |
| Regional lärlingsutbildning inom komvux | Statsbidrag: minst 70 procent på gymnasial nivå; inom anpassad utbildning övervägande del. Separat regelspår, inte en generell gymnasieregel. |

Källor: [Skolverkets APL-regler](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/arbetsplatsforlagt-larande-apl), [vuxenutbildningsförordningen 2 kap. 26–30 §§](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-20111108-om-vuxenutbildning_sfs-2011-1108/), [organisera APL](https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/organisera-arbetsplatsforlagt-larande-apl). Dessa former är inte därmed implementerade i den skyddade appen.

### Kvalitet är mer än en korrekt veckosumma

Skolverkets kartläggning från april 2026 beskriver brist på platser, avbruten APL, behov av anpassningar och svårigheten att få plats med återstående skolundervisning, särskilt för lärlingar. Rapporten skiljer planering från faktiskt genomförd undervisning. Intervjusvar och enkätresultat är verksamhetsunderlag, inte nya rättsregler. [Garanterad undervisningstid på gymnasieskolans nationella program, s. 50–54](https://www.skolverket.se/download/18.7c07b08019d24db18e32ed89/1775649242024/pdf13399.pdf).

Skolinspektionens granskning 2024 fann otydlig/inkonsekvent APL-planering och uppföljning på åtta av de 30 granskade skolorna. Det är inte en nationell andel. [Undervisningens kvalitet i gymnasieskolans yrkesämnen, rapport 2024:6](https://skolinspektionen.se/globalassets/02-beslut-rapporter-stat/granskningsrapporter/tkg/2024/yrkesamnen/undervisningens-kvalitet-i-gymnasieskolans-yrkesamnen.pdf).

Skolverkets kvalitetsstöd 2026 betonar dialog, lärarkontakt, gemensam utvärdering och elevens erfarenheter. Enskilda uppfyllda indikatorer bevisar inte utbildningens kvalitet. [Kvalitet i yrkesutbildning, fjärde upplagan, s. 4, 6, 9](https://www.skolverket.se/download/18.7912dfca19d724c2309457b/1775823750667/pdf13402.pdf).

## 2. Vad systemet faktiskt gör idag

Färsk källgranskning av den skyddade appen på revision `39e69e8`, inte ett nytt runtimeprov:

| Belägg | Konsekvens |
| --- | --- |
| [gym-timplan.ts](../../web/lib/gym-timplan.ts), rad 7, 26–30, 216–224: generiska timmar i sex terminsfält. | Inga APL-veckor, perioder, placeringar eller separata APL-timmar. |
| [named_timplan_decisions.sql](../../supabase/migrations/20261015202000_named_timplan_decisions.sql), rad 68–89: summering mot timprofil och manuell `apl`-bekräftelse. | Systemet bevarar ett intygande; det kontrollerar inte registrerade APL-perioder eller utfall. |
| [plan-decision.ts, server](../../web/lib/server/plan-decision.ts), rad 48–64: samma tim-/checklistekontroll. | APL-delen grundas på ett manuellt intygande; registrerade perioder och utfall saknas som automatiskt kontrollunderlag. Övriga beslutsvillkor gäller fortsatt. |
| [protected-gym-timplan-hours.tsx](../../web/app/protected-gym-timplan-hours.tsx), rad 153–188. | ”Timmar planerade” och ”alla aktiva terminer ifyllda” är ingen uppgift om genomförd APL. |
| [programplan-analysis.ts](../../web/lib/programplan-analysis.ts), rad 72–74. | APL visas som information om manuell kontroll. |
| [class-timplan.ts](../../web/lib/class-timplan.ts), rad 6–17, och [class-cohort.ts](../../web/lib/class-cohort.ts), rad 7–12. | Stabil klassidentitet och exakt planversion/läsår finns som användbar grund. |
| [lasar-model.ts](../../web/lib/lasar-model.ts), rad 204–211, 375–385. | Äldre modell har APL som gruppavvikelse; det är inget implementerat skyddat APL-flöde. |

Produktunderlaget har redan ett relevant förslag för före/under/efter APL: [designunderlag §11.12 och S13](../../docs/produktunderlag/07-projektbeskrivning-och-design.md). Det ska återanvändas som designunderlag, inte räknas som levererad funktion. Handbokens [nuvarande begränsning](../../docs/handbok/timplaner.md) är korrekt.

**Avgörande migrationsrisk:** gamla timplanstimmar kan redan innehålla tillgodoräknad APL eftersom dagens checklista anger att den ska ingå en gång. De får inte automatiskt döpas om till ”Skoltid”. En ny APL-summa får heller inte adderas ovanpå dessa timmar. Bevara gamla totalsummor och visa att fördelningen behöver kontrolleras.

## 3. Föreslagen upplevelse i timplanen

Följande är produktförslag, inte regler eller befintligt beteende.

Överst visas en tydlig ruta **APL för denna utbildning**, med samma skola, elevkull, namngivna timplan och läsår som övrig planering. Visa vald utbildningsform och tillämplig omfattning. Huvudåtgärden är **Planera APL** eller **Visa vad som saknas**, beroende på läget. Detaljer om version/källa ligger bakom **Visa underlag**.

Exempel med syntetiska uppgifter för en skolförlagd yrkesutbildning:

| Uppgift | Visning |
| --- | --- |
| Planerad omfattning | 15 veckor: 5 i år 1, 5 i år 2, 5 i år 3 |
| Motsvarande undervisningstid | 345 timmar, inräknade en gång i timplanens total |
| Period som snart börjar | 24 elever, 20 bekräftade platser, 4 behöver plats |
| Genomförande | 5 veckor rapporterade för 22 elever; underlag saknas för 2 |
| Pedagogisk uppföljning | 3 elever behöver kompletterande undervisning |

De tre sista raderna blir meningsfulla först när individuell placerings-/utfallsdata finns. Innan dess visas **Underlag saknas**, inte noll eller en grön procentsats. Avsikt, platsbokning och utfall har olika nämnare och får inte blandas i en enda progressbar.

### Timplanens innehåll och timmar

Visa **Total undervisningstid**, **varav skolförlagd** och **varav APL, omräknad undervisningstid**. För en plan där fördelningen är verifierad gäller total = skolförlagd + APL-tillgodoräknad tid. Ospecificerad äldre tid visas separat tills ansvarig har granskat den. Faktisk arbetsplatstid redovisas med en egen etikett och enhet.

APL ska fördelas på befintliga ämnesnivåer/delar och terminer. Skapa inte ett låtsasämne med nya gymnasiepoäng. Samma arbetsmoment kan bidra till flera ämnen utan att hela periodens tid räknas en gång per ämne. Innehållskopplingar och timfördelning behöver därför skilda relationer, med kontrollerad totalsumma.

En granskningsvy före sparande visar **före/efter**, totalen, APL-andelen och eventuellt oklassificerad tid. **Spara APL-plan** ska ge ett tydligt sparbesked och nästa steg. Rektors förläggningsbeslut och huvudmannens fastställande av timplanen visas som två ansvarshändelser. De får inte ersätta varandra.

### Perioder och kalender

Visa perioderna på utbildningens tidslinje, med datum, omfattning, innehåll och berörda klasser. Två klasser med samma programplan ska kunna ha olika förläggning och olika namngivna timplaner. Kalendern behöver kunna visa växling mellan APL och skolundervisning, olika grupper och individuell avvikelse.

En kalendervecka är inte automatiskt en full APL-vecka. Faktiska arbetstider, delveckor, arbetsfria dagar och kvarvarande skolundervisning måste framgå. En generell ”normalvecka × antal veckor” från äldre exempelmodeller får inte bli beräkningsgrund.

## 4. Stöd före, under och efter APL

Skolverkets stöd förbereder elev, handledare och lärare tillsammans och kopplar uppföljning till utbildningens innehåll. Inget verifierat nationellt fast antal lärarbesök hittades. Lokal uppföljningsrutin och elevens behov måste därför vara synliga som sådana. [Planera och följa upp elevens tid på APL](https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/elevens-tid-pa-apl).

| Steg | Föreslaget stöd | Vad rektor/huvudman kan agera på |
| --- | --- | --- |
| Planera kapacitet | Elever och behov per period mot arbetsplatsens aktuella kapacitet och lärandemöjligheter. | Platser saknas, fel innehåll erbjuds, för många samtidiga placeringar. |
| Förbereda elevplats | Arbetsställe, datum, handledare, ansvarig lärare, lärandeplan, kontaktväg och introduktion. | Ofullständig förberedelse före start; ansvarig och datum för nästa åtgärd. |
| Följa genomförande | Faktiskt erbjudna tillfällen, elevnärvaro, uteblivna rapporter, ändrad arbetsuppgift och uppföljningskontakt. | Skilj inställt, frånvaro, saknat underlag och lärande som inte erbjuds. |
| Följa lärandet | Lärarens uppföljning mot planerade moment; handledarobservationer och elevens erfarenheter. | Ändra uppgifter/plats, ordna kompletterande skolundervisning, ge stöd. |
| Avsluta perioden | Avstämning av tid och underlag samt kvarstående behov med ansvarig. | En avslutad period får ha öppna uppföljningar. |
| Utveckla verksamheten | Återkommande orsaker, platsutvärdering och effekt av åtgärder över flera perioder. | Förbättra samverkan, kapacitet, handledarstöd och lärarresurser. |

### Säkerhet, stöd och ansvar

Aktuell grund är **AFS 2023:2 kap. 8**, inte den upphävda AFS 2012:3. Riskbedömningen ska beakta minderårigas förutsättningar och omprövas vid ändrade risker. Rådet till §4 säger att paragrafen inte kräver individuell riskbedömning. Arbetsmiljöverkets praktiska vägledning skiljer samtidigt skolans bedömning av elevens lämplighet från praktikgivarens ansvar på platsen. [AFS 2023:2](https://www.av.se/arbetsmiljoarbete-och-inspektioner/publikationer/foreskrifter/afs-20232/), [praktik för minderåriga, uppdaterad 2026-10-12](https://www.av.se/arbetsmiljoarbete-och-inspektioner/arbetsgivarens-ansvar-for-arbetsmiljon/minderariga-arbetstagare/praktik-for-minderariga/).

**Produktförslag:** håll arbetsplatsens/arbetsuppgiftens riskunderlag, elevens lämplighet/anpassningar och beredskap för incidenter åtskilda. Visa ansvarig, senaste granskning och vad som ändrats. Ett företagsnamn och en kryssruta ska inte i sig göra varje arbetsställe och arbetsuppgift säkra. Begränsa översikten till status och nödvändig åtgärd; känsliga stöd- eller incidentuppgifter hör till behörigt ärendeflöde. Praktikgivaren ska meddela skolan vid olycka eller tillbud; enligt Arbetsmiljöverkets vägledning ansvarar skolhuvudmannen för anmälan av allvarliga händelser till myndigheten.

Handledarens lämplighet, introduktion och genomförda handledarutbildning bör vara skilda uppgifter. Utbildning är ett kvalitetsstöd; särskilda bidragsvillkor ska inte framställas som samma generella lagkrav för alla APL-platser. [Skolverket om organisering](https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/organisera-arbetsplatsforlagt-larande-apl), [handledarbidrag 2026](https://www.skolverket.se/styrning-och-ansvar/statsbidrag/hitta-statsbidrag/statsbidrag-for-gymnasial-larlingsutbildning-2026).

Frånvaro kopplas till skolans ordinarie process. Nationell exakt tröskel för upprepad/längre frånvaro ska inte hittas på. Utebliven APL-plats är inte elevens ogiltiga frånvaro. [Skolverket om frånvaro](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/franvaro-i-skolan). Lärarens resursplan behöver samtidigt avsätta tid för kontakt, besök, resor, uppföljning och bedömning; elevens GUT-omräkning är ingen lärartidsnorm.

## 5. Två ledningsvyer med olika uppgifter

**Rektors vy: nästa åtgärd för den egna skolan.** Börja med kommande period och konkreta listor: elever utan plats, saknad handledare/lärandeplan, säkerhetsfråga som behöver lösas, sen uppföljning och bristande lärandemöjlighet. Varje rad har ansvarig, sista datum, underlag och möjlig åtgärd. Lägg pedagogiska brister bredvid tidsavvikelser, så full närvaro inte döljer saknat innehåll.

**Huvudmannens vy: kapacitet, likvärdighet och åtgärdernas effekt.** Visa skola/program/kull och planerad, bekräftad respektive avstämd omfattning. Följ elever utan plats, avbrott, ersättningsbeslut, återkommande brister, saknade rapporter och försenade åtgärder. Redovisa när uppgifterna senast uppdaterades och hur stor del som har underlag. Varje sammanställning ska kunna spåras till källa, period och behörigt ärende.

Undvik en enda grön ”APL 100 %”. Förslaget använder separata besked som **Planerad omfattning uppnådd**, **4 elever saknar plats**, **Genomförande inte avstämt** och **3 uppföljningar återstår**. Allvarliga individavvikelser får inte försvinna bakom ett gott skolgenomsnitt. Personnivå öppnas bara med faktiskt mandat; aggregering är förstahandsvy.

Kvalitetsuppföljningen bör fråga både om resultat och om organisationens förutsättningar. Nationellt kvalitetsarbete omfattar planering, uppföljning, orsaksanalys och utvecklingsinsatser. Exakt ovanstående dashboard är vårt förslag. [Skolverket om systematiskt kvalitetsarbete](https://www.skolverket.se/styrning-och-ansvar/styrning-och-kvalitetsarbete/systematiskt-kvalitetsarbete).

## 6. Modell, historik och SS 12000

Föreslagen uppdelning: **APL-planeringsunderlag** → **APL-period** → **elevens APL-placering** → **tillfälle och utfall** → **lärandeunderlag/åtgärd**. Arbetsställe, kapacitet och handledaruppdrag är egna relationer. Bevara källsystem, rapportör och rättelser. Interna UUID och externa käll-ID:n är olika identiteter.

Planeringsunderlaget binds till kund, skola, utbildning, timplansserie/version, programinnehåll och tillämpningsår. Klass-ID och giltiga medlemskap styr vilka elever ramen gäller vid en viss tid. Dagens klasslista får inte skriva om historik. Operativ rapportering behöver egen revision: ny närvarorapport ska inte automatiskt kräva nytt timplansbeslut. Ändrad planerad omfattning/innehåll kräver däremot uttrycklig konsekvensgranskning mot det beslutade underlaget.

Kopiering till nästa kull kan föreslå en tidigare planeringsstruktur först efter uttryckligt val. Bekräftade elevplatser, säkerhetsbedömningar som inte längre gäller, närvaro, gamla beslut och genomförande får aldrig följa med som nya verifierade fakta.

**Avstämd standard:** SS 12000:2024, utgåva 4; publicerat OpenAPI-dokument 2.1.0 (format OpenAPI 3.0.2). [SIS samlingssida](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/) och [officiell YAML](https://www.sis.se/globalassets/standardutveckling/tksidor/tk-450/openapi_ss12000_version2_1_0.yaml), hämtad 2026-10-16, SHA-256 `aee9a95a4c5bd25cebaf357d266592f94e9388ae785ee9ac3b58e1992acccd28`. YAML-beskrivningens äldre årsangivelse ska inte förväxlas med standardutgåvan.

| Begrepp | Möjligt stöd och begränsning |
| --- | --- |
| Elev, klass, medlemskap | `Person`, `Group`, `GroupMembership`; bevara identiteter och giltighet. |
| Undervisning, tillfällen, närvaro | `Activity`, `CalendarEvent`, `Attendance`; kalenderpost bevisar inte genomförande och närvarominuter är inte GUT-schablon. |
| Lärare | `Duty`/aktivitetsanknytning. En extern handledare får inte konstrueras som lärartjänst. |
| Arbetsställe | `Organisation`/`Room` kan möjligen bära delar efter utbyteskontrakt; saknar ett komplett APL-objekt. |
| Elevens APL-placering | Eget domänobjekt. Standardens `Placement` avser förskola/fritidshem, inte APL. `AttendanceSchedule` är inte en genväg. |
| Säkerhet, lärande, handledarrelation, beslut | Ingen full uttrycklig mappning verifierad. Bevara internt och precisera eventuell utbytesprojektion. |

Detta är schemaanalys och avsedd kompatibilitet. Ingen motpart eller extern anslutning har verifierats. Bestäm källägare per uppgift innan import/synk; schema och APL-system ska inte båda få skriva samma närvaro oreglerat. Extern handledares tidsbegränsade åtkomst måste provas separat från standardmappningen.

## 7. Rekommenderad leveransordning

| Etapp – förslag | Konkret nytta | Gräns för vad som kan verifieras |
| --- | --- | --- |
| **1. Synlig och korrekt APL-plan i timplanen** | Utbildningsform, regelprofil, perioder, innehåll, läsår, total/varav APL, rektors underlag, synliga luckor och planeringsanalys. | Kan visa planerad omfattning och granskad timfördelning. Kan inte bevisa elevplacering eller genomförande. |
| **2. Säkrade platser och ansvar** | Arbetsställen, kapacitet per period, elevkoppling, handledare/lärare, förberedelser och åtgärdslista för rektor/HM. | Kan visa bekräftad genomförbarhet utifrån registrerat underlag. Inte automatiskt faktisk närvaro eller lärande. |
| **3. Genomförande och kvalitetsuppföljning** | Faktisk kalender, rapportering, avbrott/komplettering, läraruppföljning, resurskoppling och ledningsanalys. | Verifieras mot verkliga registreringsflöden; externa integrationer kräver egna kontraktsprov. |

Rekommenderad första omfattning: befintliga skolförlagda nationella Gy25-yrkesprogram. Lärling identifieras tydligt, men automatisk andelskontroll införs först när start, nämnare och avdrag har ett verifierat kontrakt. Andra skolformer får egna planer. Full handledarportal och externa integrationer behöver egna mandat-/säkerhets- och verksamhetsprov.

Etappernas riktning är därefter godkänd, men är inte en tidplan eller en utökning av pilotens 42 krav. Gapet ska planeras tillsammans med den befintliga sammanhållna analysen och schemadelprojektets S1/S4, utan att låta första timplansförbättringen invänta en full schemamodul.

## 8. Acceptansfall inför planering

1. **Mått:** 15 hela veckor visar 345 GUT-timmar. Ett uttryckligt 40h-exempel visar separat 600 arbetsplatstimmar, inte som universell norm.
2. **Dubbelräkning:** samma period kopplad till tre ämnesnivåer ger en tidsomfattning; alla ämneskopplingar bevaras.
3. **Historiska planer:** ingen automatisk omklassning av gamla timmar; ospecificerad fördelning förblir synlig och tidigare total/historik oförändrad.
4. **Klassvarianter:** samma programplan, två namngivna timplaner och olika APL-perioder för A/B fungerar utan sammanblandning.
5. **Individ:** klassramen har 15 veckor men en elev saknar plats. Individavvikelsen och huvudmannens åtgärdsbehov består.
6. **Utfall:** inställd plats, giltig frånvaro och orapporterad dag skiljs åt. Korrigering bevarar ursprung och rapportör.
7. **Lärande:** full tid men saknat planerat moment lämnar en pedagogisk åtgärd; ingen automatisk betygs-/examensspärr från räknaren.
8. **Regler:** 50 procent räcker inte för mer-än-hälften. Saknad lärlingsstart/nämnare eller osäker delveckeregel ger granskningsbehov.
9. **Kapacitet:** platser är knutna till period och relevant innehåll, inte bara ett företags årsantal. Överbeläggning visas.
10. **Kalender/resurs:** blandad APL-/skolvecka och läraruppföljning ryms i korrekt kalender, utan att APL-schablon blir lärartimmar.
11. **Beslut:** rektors förläggning och huvudmannens timbeslut är spårbara; senare planändring får synlig konsekvens, utfallsrapport ändrar inte beslutad historik.
12. **Särskild ersättning:** skilj platsbortfall utanför huvudmannens kontroll från säkerhetsskäl. Beslut och samråd dokumenteras; lagens uttryckliga återgångsåtgärd knyts till första grunden. Skolförlagd ersättning blir inte arbetsplatsnärvaro.
13. **Mandat:** återkallat skol-/handledaruppdrag stoppar direkt API-/DB-åtkomst och gamla länkar. Kopiering tar inte med bekräftade platser eller personutfall.
14. **Utbyte:** ingen APL-placering skickas som SS 12000 `Placement`; orapporterat, korrigering, stabila ID:n och källansvar bevaras.

15. **Säkerhet:** ändrat arbetsställe, nya arbetsuppgifter eller ändrade risker ger behov av omprövning; tidigare klarstatus gäller inte automatiskt den nya situationen.

Detta är föreslagna verifieringsfall. De har inte genomförts eftersom APL-funktionerna ännu inte finns.

## 9. Beslut och osäkerheter som nästa plan behöver hantera

- Fastställ beräkningsgrund för delveckor, blandade veckor, individuell arbetstid och utfall vid frånvaro före automatiskt uppfyllelsebesked. En tydlig manuell granskning är bättre än en påhittad algoritm.
- Bestäm vem som utför placering och uppföljning: rektor, lärare med uppdrag eller APL-samordnare. Ansvar och praktisk utförare är skilda saker.
- Bestäm om appen blir källa för närvaro/placering eller sammanför ett befintligt system. Ingen extern tjänst antas finnas.
- Precisera vilka planändringar kräver omprövning och vad som är löpande genomförandedata.
- Bestäm etapp 1:s arbetssätt för redan fastställda planer med okänd APL-andel; ingen automatisk omräkning.
- Bevara nuvarande spärrar för otillräckligt stödda program-/startprofiler, inklusive kommande yrkesprov. Ny APL-visning tar inte bort dessa.

## Källkritik och verifieringsgräns

Alla webbkällor ovan kontrollerades 2026-10-16. Utkastets regler, kodreferenser respektive arbetsmiljö/kvalitet/SS 12000 har granskats i tre separata läsande genomgångar; funna preciseringar är införda. Primärkällor används: författningar, Skolverket, Skolinspektionen, Arbetsmiljöverket och SIS. Normativa regler skiljs från myndighetsstöd, empiriska observationer och egna produktförslag. Konsoliderade lagtexter kan innehålla framtida lydelser; relevant Gy25-ändringsförfattning har därför kontrollerats separat. 2025 års APL-lathund har äldre AFS-hänvisningar i referenslistan och används inte som aktuell arbetsmiljörätt.

Ingen generell nationell regel om två lärarbesök, automatisk närvaroprocent för betyg eller en universell delveckeschablon har verifierats. Äldre promemorieförslag om fasta lärlingsveckotal används inte som gällande regel. Den aktuella kodinventeringen är källgranskning; föregående rektorspakets passerade runtimeprov är inget nytt APL-bevis.

Nästa GSD-steg: [följ det granskade planpaketet för etapp 1](../phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md), med start i APL-01. Tidigare [analys-/schema-/APL-todo](../todos/pending/2026-10-05-samordna-plananalys-schema-och-apl.md) uppdateras med denna research; den ersätts inte av en parallell dubblett.
