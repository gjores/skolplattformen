# Tjänstefördelning — gemensamt kontrakt

**Ersatt 2026-10-19.** TJ1-01–10 är fördelade mellan fas 05.1 och repot `tjanstebedomning` enligt [beslutsdokumentet](../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md). Texten nedan är historik.

Datum: 2026-10-16. Status: planerat kontrakt; måste verifieras i implementation. Källor och rättsliga avgränsningar finns i [researchen](../../research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md). Kodläget finns i [DISCOVERY](05-TJANST-DISCOVERY.md). Senare verifierade specifikationer och avtal ska granskas före faktisk användning.

## Lokala acceptanskriterier

| ID | Observerbart resultat | Ursprung |
|---|---|---|
| TJ1-01 | Huvudmannen väljer flera centrala avtalsprofiler med version, giltighet och lokala tillägg; varje anställning har en spårbar tillämpning. | TID-08, TID-02 |
| TJ1-02 | Person, anställning, tjänstgöringsgrad och skoluppdrag är separata; flera skolor kan inte förbruka samma kapacitet. | TID-04, TID-07, TJANST-01 |
| TJ1-03 | Undervisningsbehov bygger på exakt klass–timplansversion, ämnesrad och termin; samläsning bevarar klassernas behov och räknar lärarens insats en gång. | TJANST-01/03 |
| TJ1-04 | Hela uppdragets budget syns per uppgift och tidsform; mentorskap och APL-arbete läggs in en gång, utan att elevtid blir lärartid. | TID-01/03/09, TJANST-02 |
| TJ1-05 | Rektor bedömer varje tjänst, dokumenterar underlag och skäl, ser korrekt individuell ram och PU-golv och måste ompröva ändrad grund. | TID-02/04/05 |
| TJ1-06 | Rektor fastställer och publicerar aktuell tjänsteversion; huvudmannen följer upp, läraren ser egen publicerad version och kan lämna kommentar/kvittens. | TJANST-04/05, TID-05/07 |
| TJ1-07 | Undantag har rätt paragrafgrund, skäl och giltighet. 11 § 1 kräver lärarens belagda initiativ; rektor kan inte skapa det i lärarens namn. | TID-06 |
| TJ1-08 | Kopiera år, flytta och massändra med förhandsvisning, atomär kontroll och nya utkast; källor och gamla beslut bevaras. | TJANST-06 |
| TJ1-09 | Servern skyddar varje läsning/skrivning och egenvy; återkallelse, fel skola, annan person, konkurrens och okänt skrivutfall hanteras säkert. | Befintliga ADMIN/IDENTITET/INTEGRITET-principer |
| TJ1-10 | Dator och telefon ger begriplig arbetsgång och handbok; schemaandel och utfall visas som saknat underlag, och SS 12000-mappning är dokumenterad utan integrationspåstående. | TID-01/10/11/12 förberedelse |

Alla kriterier är **ej implementerade/ej produktverifierade** vid planeringen. TID-10–12 är endast förberedda här; de fullständiga målen kräver T3/T4.

## Identitet, giltighet och källansvar

`StaffPerson` har stabilt UUID, huvudmannatillhörighet och externa ID:n med källa. Ingen matchning på namn/e-post och inget personnummer behövs i första etappen. `Employment` pekar på person och arbetsgivare; periodsegment anger tjänstgöringsgrad, ferie/semester och avtalstillämpning. `SchoolDuty` pekar på anställning, skola och giltighet med allokerad andel/minuter. Befintliga `assignments` är behörighetsuppdrag och ersätter inte dessa objekt.

En uttrycklig, auditerad `StaffIdentityBinding` binder personen till medlemskap/autentiserad identitet. Huvudmannen hanterar huvudmannens gemensamma person/anställningsgrund och avtalsutbud; rektor hanterar skoluppdrag inom egen skola och kan förbereda uppgift om ny personal för huvudmannens komplettering. Skoladministratören förbereder skolans tjänster. Alla rättigheter avgörs serverledes. Dubbelbindning, samma identitet till olika personer inom samma huvudman och byte under pågående skrivning ska avvisas eller kräva en uttrycklig, historikbevarande korrigering.

Datummodellen ska vara konsekvent med befintliga inklusive giltighetsdatum. Beräkningar kan internt använda halvöppna intervall men ska bevisa gränskonverteringen. Byte av avtal, sysselsättningsgrad eller skola skapar segment; proportionera en gång mot en uttrycklig beräkningsperiod och bas, aldrig både årsram och varje rad utan samma bas. Okänd kalender eller avtalsgrund blockerar tal som beror på den.

## Avtal och regler

`AgreementProfile` är huvudmannens valbara profil med oföränderliga versioner: centralt avtal, källa/dokumenthash, giltighet, granskad status, ferie/semester, års-/veckobas och periodisering. Lokalt tillägg är en separat version med räckvidd, avtalsgrund och granskare. `AgreementApplication` anger exakt profil/tillägg och individens tillämpning. Aktivering kräver komplett, källbelagd och inbördes förenlig ram; en inaktiverad eller utgången version får läsas historiskt men inte automatiskt användas i nya perioder. Användaren väljer avtal; systemet avgör inte vilket avtal en arbetsgivare rättsligt tillhör.

Minst två skilda källgranskade profiler (HÖK och Almega) ska kunna beredas, testas och väljas. HÖK:s 1 767 timmar är ett kollektivt genomsnitt, inte ett universellt individuellt tak. Almegas grundmodell har annan bas. Fremia och Arbetsgivaralliansen kan registreras som egna mallar, men olöst skillnad i timmar eller ej granskad lokal tillämpning får inte aktiveras. HÖK25 löper enligt källan till 2027-03-31: ett prov för 2027/28 måste därför använda en tydligt syntetisk framtida avtalsversion eller senare faktiskt verifierad källa, aldrig tyst förlängning.

`LegalProfile` är separat från avtal och har regelversion, skolform, faktisk undervisningskategori, giltighet och källa. SFS 2026:1487 gäller från 2027-07-01. Gymnasiets intervall enligt 3 § är ram för rektors individuella undervisningstak, inte en undervisningsplikt. Faktisk undervisning avgör kategori; yrkesprogram som etikett räcker inte. Blandade eller okända tillämpningar får utkast och kompletteringslista, inte fabricerat medelvärde eller fastställt grönt besked.

Helårsprov: individuellt heltidsbedömt tak 500 h, planerad undervisning 520 h ger avvikelse även inom nationella intervallet. 500 h undervisning ger minst 600 h planering/uppföljning enligt gymnasiets grundregel. 60 procent av heltidsbedömt tak 500 ger 300 h; PU-golv på 300 faktisk planerad undervisning blir 360 h. Delårsfall använder dokumenterad periodiseringsgrund och ska testas separat från dessa helårsexempel. Vid heltalsminuter avrundas ett minimikrav uppåt; ett tak får inte avrundas uppåt. Decimal/rationell beräkning ska vara exakt och identisk i TS och SQL.

## Undervisningsbehov och tidsbokföring

`TeachingNeed` identifieras av skola + läsår/termin + klass-ID + klass–timplansbindningens revision + namngiven planserie/version + fryst ämnesrad/rowKey. Behovet räknas från klassens uttryckliga bindning, inte årsöversiktens totalsumma eller namn. Två klasser med samma plan ger två behov. Befintliga timplanstimmar är elevens planerade tid, aldrig automatisk lärartidsbudget.

`TeachingAllocation` binder behov till en tjänst/period och en uttrycklig lärarinsats. `JointTeaching` kopplar flera behov till en gemensam aktivitet med varje lärares faktiska budgeterade insats. En lärare i två samläsande klasser under 60 minuter ger 60 lärarminuter men lämnar varje klass undervisningsrätt synlig. Två lärare i samma pass ger 120 personminuter. Delvis samläsning kräver uppdelning; en bockruta får inte minska allt behov.

`WorkAllocation` har stabilt ID, tjänst/period, uppgift, tidsform och budgetminuter. Uppgift omfattar undervisning, planering/uppföljning, elevmentorskap, kollegamentorskap, utveckling, möten, APL-besök och övrigt. Tidsform är reglerad/förtroende/oklassificerad. Ett blandat möte på 60 min kan delas 30+30; kategorisummering får aldrig bli 120. Förtroendetid räknas inte automatiskt helt som PU. En uttryckligt granskad tillämpning måste ange vilken budget som avser PU; arbetsgivaren ska inte behandla förtroendetid som fritt schemaläggningsbar reglerad tid.

Budget, schema och utfall är skilda mått knutna till samma ID. Budget 100 h och 60 h framtida schemaläggning ger 40 h kvar att förlägga, inte 160 h belastning. Schema/utfall i denna etapp har `availability=unavailable|partial|complete`, `minutes=null` vid saknat underlag, källversion och period. En strukturellt tom tidtabell får inte låtsas ge komplett noll. Ingen manuell procentsiffra får ersätta saknad källa.

Framtida schemaandel ska ha tydlig täljare och nämnare: unika, icke inställda lärarminuter som faktiskt är förlagda i schemat / individens reglerade minuter för samma period. Visa separat undervisningens förläggningsgrad mot undervisningsbudget. Ange också eventuell explicit totalandel mot total arbetstidsram. Null/okänd/0-nämnare ger ingen kvot; delunderlag ger delstatus. Faktisk arbetstid kan inte härledas ur ett kalenderpass. T3/T4 implementerar dessa källor senare.

Ett överbelagt utkast får sparas som ofullständigt förslag, men får inte samtidigt räknas som giltig kapacitetsreservation eller fastställas. Kapacitetskontroll sker inom anställningens segment över samtliga skolor. Transaktionen låser person/anställning och berörda planer i bestämd ordning innan reservationer ändras. Samtidiga rektorer får inte båda ta sista kapaciteten. Andra skolors persondetaljer/bedömningsanteckningar läcks inte till rektor: endast nödvändig reserverad kapacitet, period och kompletteringsstatus. Flera avtal kräver separata delramar; olika nämnare summeras inte till vilseledande procenttal.

### Gemensam individuell ram över skolor

Total arbetskapacitet räcker inte som kontroll. `SharedAssessmentBasis` i bedömningsmodellen binder person/anställningsperiod, individuell undervisningsram och PU-behov till en gemensam version med uttryckliga delramar för skoluppdragen. Varje berörd rektor bekräftar sin del mot samma gemensamma grund; ingen rektor får bestämma en annan skolas tjänster och huvudmannen blir inte godkännare. Förslag och samordning kan göras innan båda bekräftat, men fastställande kräver komplett aktuell grund. Ändrad gemensam grund gör berörda bedömningar inaktuella. API:t visar nödvändiga gemensamma tal och status, inte andra skolors individanteckningar.

Skolornas undervisningsdelramar får tillsammans inte överstiga den individuellt bedömda gemensamma ramen; samma heltidsram får inte återanvändas per skola. PU-allokeringar har globalt unika ID:n och tydlig fördelning på skolornas insatser, även när en del ligger i förtroendetid. Ingen skola får tillgodoräkna sig samma PU-minuter en gång till. Obligatoriskt fall: gemensamt tak500h och undervisning300+300h ska blockera trots att total arbetstid ryms;300+200h kräver minst600h PU enligt gymnasiets grundregel för perioden, fördelat utan dubbla minuter. Tvåskoleprovet ska också visa hur en ändring eller återkallelse av den gemensamma grunden påverkar confirm under lås.

Första etappen samordnar uppdrag inom samma huvudman där källansvar och mandat finns. Uppdrag hos annan huvudman får inte antas vara noll eller läsas utan rätt; eventuell relevant extern omfattning anges som dokumenterat underlag/okänd täckning. Ett organisationsövergripande komplett efterlevnadsbesked får inte visas utan komplett grund.

### Kapacitet under revidering

För varje anställningssegment och skolans beslutade omfattning finns högst en gällande publicerad version och ett aktivt efterföljande arbetsutkast. Historiska versioner belastar inte kapaciteten. Den gemensamma reservationen för detta segment är **max(gällande publicerad budget, godkänd aktiv utkastreservation)**, inte summan. Beräkna max och återstående utrymme separat för varje begränsningsdimension: total tid, reglerad tid, förtroenderam och tilldelad undervisningsdelram; en oförändrad total får inte dölja en ökning i reglerad tid. PU-minimum kontrolleras separat och är inte en ytterligare additiv total. Testa total1000 med reglerad800→total1000 med reglerad900: ökningen100 i reglerad ram måste reserveras även om totalen är oförändrad. En minskning i ett utkast frigör alltså inte redan fastställd tid; en ökning reserverar endast ökningen om utrymmet finns. Ett överbelagt/ofullständigt förslag kan sparas, men dess högre begäran är oallokerad och räknas inte som giltigt reserverad. Alla vyer visar skillnaden mellan föreslagen belastning och faktiskt reserverat utrymme.

Vid fastställande ersätter den nya versionen både den gamla publicerade budgeten och sin utkastreservation atomärt. Vid avbrytande av utkast släpps enbart utkastets extra reservation; publicerad budget finns kvar. Utan tidigare publicerad version består reservationen av det aktiva utkastets accepterade del. Första etappen accepterar eller nekar hela den begärda extra reservationen, ingen tyst delreservation av en tjänst. Flytt mellan tjänster inom samma beslut kontrollerar netto och alla berörda segment i samma transaktion; separat beslutade skolor får inte tillgodoräkna sig en ännu obekräftad minskning. Ändrad avtals-/anställningsram får visa en verklig brist och omprövningsbehov men får inte tyst radera redan beslutad belastning.

Obligatoriska samtidighetsfall: publicerad100→utkast100 reserverar100; publicerad100→utkast80 reserverar100 tills fastställande och därefter80; publicerad100→utkast120 reserverar120 om20 finns, annars ligger100 kvar och förslaget är blockerat; avbrutet120-utkast återgår till100. En annan skolas konkurrerande20 får tas först efter att en minskning verkligen fastställts. Proven använder samma period och enhet och ska också omfatta flytt, profilbyte och avbrutet skrivsvar.

## Bedömning och fastställande

`ServiceAssessment` binder tjänst och innehållsversion till kategori, heltidsbas/individuell ram, gruppstorlek, antal unika elever, stödbehovets arbetsbelastning, andra uppgifter och skäl. Elevnamn, diagnoser och elevärenden ska inte skrivas i fritext. Skäl dokumenteras på tjänstenivå; strukturerade antal/omständigheter med källa och datum. Första etappen anger dessa underlag manuellt med källhänvisning; ingen obeställd läsning av skyddade elevärenden behövs.

Kanonisk beslutshash omfattar personal-/avtalssegment, lagprofil, källbindningar, tidsallokering, kategorier, bedömningsunderlag och eventuellt undantag. Sorteringsordning, visningsnamn och läskvittens ska inte ensamma ändra innehållshash. TS/SQL har gemensamma vektorer. Ändrad relevant källa markerar bedömningen `needs_review`; publicerad historik skrivs inte om.

Tillstånd: `draft → assessed → finalized/published`. Fastställande och publicering är en atomär rektorsåtgärd med tydlig bekräftelse av vilken version läraren får se. Revidering skapar ny version i utkast med föregående publicerade version synlig tills nytt beslut. Servern returnerar `actions`, `blockers`, `warnings` och räknar om under lås; klienten bestämmer inte beslutsrätt.

Fastställande kräver känt och aktuellt underlag, giltig granskad avtalsgrund, dokumenterad individuell bedömning, tillåten ram och finansierad kapacitet. Överbeläggning, okänd/blandad regeltillämpning och otillräckligt PU-utrymme blockerar tills rättad fördelning eller ett giltigt tillämpligt undantag finns. Systemet visar kontrollerad tillämpning med källor, inte ett generellt juridiskt godkännande. Före lagens ikraftträdande får framtidsberäkningen inte påstå gällande avvikelse.

`TeacherFeedback` skiljer kommentar och läskvittens från avtal/acceptans. `ExceptionCase` anger 11 § punkt 1, 2 eller 3, berörda regler, skäl, giltighet, prövning och omprövningsdatum. Punkt 1 kräver lärarinitierad händelse från egen verifierad identitet och rektors restriktiva prövning; rektor kan inte skapa/ändra initiativet. En ännu opublicerad tjänst kan lämnas till läraren som en uttryckligt delad dialogversion; den ger inte tillgång till andra utkast och är inte fastställd. Initiativet binder denna versions `initiativeBasisHash` enligt den separata hashregeln nedan. Punkt 2/3 får egen prövningsgrund, utan påhittat generellt krav på lärarinitiativ. Undantag från 9–10 §§ nekas och faktisk tidsmängd bevaras. Återkallat initiativ före fastställande blockerar; efteråt krävs omprövning utan att historiken raderas.

### Två hashvärden utan cirkelberoende

`initiativeBasisHash` identifierar det oföränderliga dialogunderlag som läraren tar initiativ till: tjänstens källor, avtal/period, faktiska tidsförslag, bedömningsfakta och de föreslagna undantagsvillkoren. Den utesluter själva initiativhändelsen, lärarens komplettering/kvittens och rektors senare undantagsbeslut. `decisionHash` omfattar denna grund plus den slutliga bedömningen, undantagsprövningen och referensen till giltigt initiativ när det krävs. Varje hash har en versionsmärkt kanonisk payload och TS/SQL-testvektorer. De två får inte ersättas av samma rekursiva hash.

Initiativ→rektors prövningshändelse→fastställande ska kunna lyckas utan att initiativet självt gör sin grund inaktuell. Ändras däremot tjänstens tidsförslag, avtalsgrund eller föreslagna undantagsvillkor krävs nytt delat underlag och nytt/uttryckligt förnyat initiativ. Återkallat initiativ prövas som separat aktuell behörighets-/giltighetsförutsättning under lås. Ett gammalt initiativ följer inte automatiskt med ett nytt innehåll.

## Mandat och API

Huvudman: avtalsval/gemensam personalgrund och uppföljning inom egen huvudman. Rektor: skoluppdrag, fördelning, bedömning och fastställande inom egna skolor. Skoladministratör: förberedelse av fördelning men inte fastställande/undantagsbeslut. Lärare: egen publicerad eller uttryckligt delad dialogversion, egen återkoppling och eget initiativ. Huvudmannen får inte en dold fastställanderätt genom en allmän administratörsväg.

Inför `scopeKind=self` för läraruppdrag när ingen grupp finns. Det har minst en aktuell skolenhet och tomma grupp-/elev-/ärendelistor, med samma giltiga huvudman→rektor→lärarkedja och explicit person–medlemskapsbindning. `self` ger inga elev-, klasslistnings- eller planeringsrättigheter. Befintliga lärargruppmandat kan också läsa egen tjänst när identitetsbindningen stämmer. Direkt SQL-anrop till elevlistning, urval, projektion och scope-probe ska neka self; bara filtrering av elevrader räcker inte eftersom klass-/utbildningsval annars kan läcka.

Session och valt sammanhang förmedlar serverläst `scopeKind`; rollväljaren är inget bevis. Läraren startar i Min tjänst, med Elever enbart där befintligt gruppmandat medger det. Person-ID skickas inte som självauktorisering. Egen-API härleder person från låst session/medlemskap; requestförsök att läsa annan person nekas.

API-familjerna är POST `/api/tjanst/{personal,avtal,plan,bedomning,egen}/{lasa,kommando,status}`. Databasen exponerar exakt `tjanst_personal_*`, `tjanst_avtal_*`, `tjanst_plan_*`, `tjanst_assessment_*`, `tjanst_self_*`, där `* = read|command|status` och varje signatur är `(jsonb)`. Dessa 15 funktioner får minsta nödvändiga Worker-EXECUTE, inga tabellgrants. Läsa via POST håller person-ID och filter ur URL. Adaptrar ska följa befintlig serverväg för låst aktuell session, audit och svarskontroll. Inget demoanrop och ingen klientvald skola utan serverprövning.

Mutationer har commandId, expectedRevision och exakt kanoniskt payloadhash. Idempotens/status binds till aktör, mandat, mål och payload. Nytt payload med återanvänt ID avvisas. Okänt skrivutfall efter avbrott/MFA återhämtas med samma statuskvitto, inte blind ny skrivning. Audit måste lyckas eller hela ändringen rullas tillbaka. Felaktiga/extra fält och ofullständiga svar nekas. Detaljerade elev- eller bedömningsanteckningar lagras inte i generell audit/logg.

### Separat statuskontrakt för avbrutna skrivningar

Status använder `{commandId, requestHash, operation, targetRef}` och aktuell låst session/aktör/mandat; originalets fritext eller hela mutationspayload krävs inte för statusläsning. Servern jämför den kanoniska requestHash mot det lagrade kvittot och nekar främmande mål/aktör. `targetRef` är en ogenomskinlig intern referens som inte i sig ger läsrätt. Statussvaret innehåller utfall och revisionsreferens, ingen spegling av känslig originaltext; aktuellt innehåll läses separat genom behörig läsväg.

UI får bevara endast denna minimala scopebundna referens i sessionStorage för återhämtning efter omladdning/MFA, aldrig bedömnings-/initiativtext eller hela personpayload. Hashversion och normalisering fryses i respektive modell. Återspelning av själva mutationen kräver däremot identiskt originalpayload. Efter reload utan originalpayload används status och behörig omläsning; inget automatiskt nytt kommando. Om servern svarar inte mottagen lämnas den oskickade texten som ej återställbar i detta fall och användaren får börja ett nytt uttryckligt utkast, utan påstående att det sparats. Testa borttappat svar efter commit→raderad minnespayload→reload→status→exakt omläsning och före commit→status inte mottagen utan blind replay.

## Kopiering och massarbete

Förhandsvisning låser valda källrevisioner och visar ny period, avtalsgiltighet, vakanta rader, saknade klassbindningar och ny kapacitet. Nytt år ger nya arbetsallokerings-ID:n, uttrycklig källreferens och utkast; inga fastställanden, lärarinitiativ, läskvittenser eller gamla undantag kopieras som giltiga. Flytt och massändring är atomära inom visad omfattning; delvis resultat får inte rapporteras som klart. Stale underlag nekar hela operationen med begriplig åtgärd. Plan15B/15C inför överföringsfamiljen POST /api/tjanst/overforing/{lasa,kommando,status} och exakt tjanst_transfer_read(jsonb), tjanst_transfer_command(jsonb), tjanst_transfer_status(jsonb) för förhandsvisning/kommando/status; de tre läggs till paketets15 verifierade grundrättigheter. Ingen generell wildcard-grant tillåts.

## SS 12000

Avstämning: **SS 12000:2024 utgåva 4**, officiell [OpenAPI 2.1.0](https://www.sis.se/globalassets/standardutveckling/tksidor/tk-450/openapi_ss12000_version2_1_0.yaml), OpenAPI-format 3.0.2, hämtad 2026-10-16, SHA-256 `aee9a95a4c5bd25cebaf357d266592f94e9388ae785ee9ac3b58e1992acccd28`. Detta är schemaanalys, inte fullständigt standard- eller anslutningsprov.

| Internt begrepp | Standardankare / avgränsning | Verifiering i paketet |
|---|---|---|
| Personal och extern identitet | Person / externalIdentifiers; intern identitybinding är separat | stabila ID:n, källnamespace, ingen namnmatchning |
| Huvudman/skolenhet | Organisation | korrekt organisationsrelation och giltighet |
| Anställning/skoluppdrag | Duty: person, dutyAt, dutyPercent, hoursPerYear, startDate/endDate | ingen dubblettperson eller dubblerad årsram; bevarad enhet och procentbas |
| Undervisning/samläsning | Activity.minutesPlanned och teachers[].minutesPlanned via DutyAssignment | elevminuter och respektive lärares minuter skilda |
| Mentorskap | Duty.assignmentRole Mentor mot grupp med datum när det faktiskt motsvarar uppdraget | inte etikett på alla lokala mentoruppgifter; ingen automatisk elevåtkomst |
| Framtida schema | CalendarEvent start/end, teachingLengthTeacher/student, cancelled, teacherExceptions | gränssnitt reserverat; faktisk tid får inte härledas ur bokning |
| Avtalsprofil/individuell bedömning/undantag | Saknar direkt motsvarighet i dessa schemaobjekt | interna versionerade objekt; inga påhittade standardfält |

En intern läraraktivitet kan inte exporteras som Activity utan dess obligatoriska verkliga gruppankare. Egen tjänst utan grupper ska därför inte uppfinna en grupp. Käll- och skrivansvar måste avtalas inför framtida utbyte. Informationsutbyte, anslutning till motpart och komplett standardefterlevnad ligger utanför detta paket.
