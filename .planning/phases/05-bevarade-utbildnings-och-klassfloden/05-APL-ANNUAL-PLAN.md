---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL
status: proposed
scope: school-term-hours-and-annual-apl
implementation_started: false
---

# Skolförlagd tid per termin och APL per årskurs

## Beställning och avgränsning

Användarens senaste referens och kolumnrubriker anger **Skola HT, Skola VT och separat APL per årskurs**. Det är en ändrad verksamhetsmodell jämfört med nuvarande totaltimmar inklusive APL. Användaren vill kunna planera timmar per ämne och årskurs först och förlägga perioder senare. Den riktningen är beställd. Lagringsformat, övergångsmetod och leveranssteg nedan är tekniska rekommendationer, inte redan installerad eller verifierad funktion.

GUIDE-DATES är ett eget pågående leveranspaket med produktcommit `2b383dc`; dess handledning beskriver nuvarande app. Årsmodellen får inte smygas in i det paketet. Den nya modellen ändrar inte klasskopplingar, mandat eller programplanens ämnespoäng. Referensbildens eventuella APL-poäng införs inte. Faktisk närvaro, arbetsplatsplaceringar och elevuppföljning är fortsatt senare etapper.

Mål: rektor kan ange exempelvis **Skola HT 80 h, Skola VT 70 h, APL åk 1 115 h**, spara utan perioder och se **265 h totalt, varav APL 43,4 %**. När 60 APL-timmar förläggs i perioder är totalen fortfarande 265 h: 60 h är förlagda och 55 h återstår att förlägga. Detta är ett räkneexempel, ingen timregel för ett visst ämne.

## Verifierat nuläge och varför en ny representation behövs

Källkod läst 2026-10-16. `.planning/codebase/ARCHITECTURE.md` är äldre; dagens Worker/SQL-kontrakt i följande filer styr planen:

- `web/lib/gym-timplan.ts`: `hours` är sex heltalsceller, 0–2 000 timmar eller null; de avser total undervisningstid. `gymTimplanTotals` summerar dem.
- `web/app/protected-gym-timplan-hours.tsx`: radvis CAS-sparning använder `/api/timplaner/gym/rad`; kö, osäker sparstatus och återläsning finns redan.
- `supabase/migrations/20261016120000_apl_planning.sql`: `apl_time_allocations` kräver period, ämnesinnehåll och term_index. `phase5_apl_timplan_cells_guard` hindrar APL från att överstiga totaltimmar per termin.
- `supabase/migrations/20261016130000_apl_term_intent.sql`: preliminär terminsavsikt kan sparas utan datum; kommandon, frysta kvitton och innehållshash måste bevaras.
- `supabase/migrations/20261016121000_apl_plan_decisions.sql`: beslutsgrund summerar `timplan_cells.hours`, jämför med GUT och kräver aktuell APL-bekräftelse; kopiering bär periodminuter och granskningsproveniens.
- `web/lib/gym-timplan-distribution.ts`: fördelar totaltimmar med golv från periodernas APL-minuter. Den algoritmen får inte användas oförändrad när kolumnerna avser skolförlagd tid.

Dolda perioder, fördelning av års-APL mellan HT/VT utan användarval eller omdöpning av gamla `hours` till skoltimmar är inte giltiga genvägar.

## Rekommenderat kontrakt

### Två explicita tidsmodeller för en hel timplansversion

**Äldre modell:** `inclusive_terms_v1` är intern beteckning för dagens exakt oförändrade `hours`-svar, lagring, historiska hash och kvitton. Inget extra obligatoriskt fält skrivs in i gamla frysta svar. Ingen migrering av gamla timmar sker vid installation eller läsning.

**Ny modell:** `school_terms_annual_apl_v2`, uttrycklig diskriminator i ett nytt strikt wire-kontrakt. Tidsraden innehåller:

```ts
type TimeRowV2 = {
  schoolMinutes: [number|null, number|null, number|null, number|null, number|null, number|null];
  annualAplMinutes: [number|null, number|null, number|null];
};
```

Alla tal är heltalsminuter, inte flyttal. Skolceller högst 120 000 minuter och års-APL högst 240 000 minuter är tekniska gränser, inte rättsliga normalvärden. Summor beräknas med säkra heltal/SQL bigint. Null betyder inte planerat; noll är angiven noll. Inaktiva skolterminer är null. Års-APL kan bara anges när ämnesraden är aktiv någon termin det året. Summering har separata värden för känd summa och fullständighet.

För V2 finns **inte** ett fabricerat legacy-`hours` där års-APL delas mellan terminer. Strikta parsrar skiljer gammalt svar från nytt. Konsumenter som saknar V2-stöd ska neka/falla stängt, inte tolka skoltid som totaltid.

Additiv lagring rekommenderas:

- `timplan_time_models`: en rad endast för V2-planer, plan_id FK, versionerad modellbeteckning och oföränderligt ursprung. Saknad rad betyder äldre modell. Installationen fyller inte på gamla planrader.
- `timplan_time_cells_v2`: plan_id/row_key, sex skolförlagda minutvärden och tre års-APL-värden, med dimensioner/nullmasker validerade mot fryst källa. Ny tabell har RLS/FORCE, återkallade direkträttigheter och samma skyddade skrivväg/planlås som övriga timplanen.
- `timplan_time_commands`: requestbundet, oföränderligt kvitto för explicit övergång och V2-skrivningar; samma commandId får aldrig avse annan request, aktör, uppdrag eller plan. Inkludera fryst resultatsnapshot och läsbar status för osäkert nätutfall.

Äldre `timplan_cells` ligger kvar med sin gamla betydelse. För en övergången plan blir dessa endast bevarat övergångsunderlag; gamla radfunktioner får inte fortsätta skriva där. Inget nytt rättighetsmandat skapas.

### Summor, perioder och GUT

- Total per ämne/år = Skola HT + Skola VT + års-APL. Totalt för utbildningen = alla skolminuter + års-APL, en gång.
- Varav APL % = känd års-APL / känd total; visa preliminär andel när celler saknas, inget vilseledande komplett besked. Vid total 0 visas streck, inte NaN/0 % som kvalitetsbesked.
- Periodförlagd APL hämtas från befintliga periodallokeringar och summeras per rowKey och `floor(termIndex / 2)`. Den är en delmängd av års-APL. Kvar att förlägga = års-APL minus periodförlagd tid.
- Års-APL får sparas utan APL-plan, period, datum eller arbetsmoment. Det ska inte skapa någon period eller attest. En faktisk periodallokering får i V2 aldrig överstiga angiven års-APL; den begränsas inte av skolkolumnens minuter. Ämnets terminsaktivitet och periodens datum-/innehållskontroller består.
- Null års-APL är inte ett outtalat godkännande av noll; periodallokering kräver uttrycklig årsram. UI kan föreslå att höja ramen, men sparar aldrig en höjning dolt.
- V1:s validering fortsätter kräva period-APL inom de inkluderande terminstotalerna. V2:s validering kräver period-APL inom årsramen. Testa båda, inklusive skoltid 0 och års-APL > 0.
- En timbudget eller ett divisionstal timmar/23 bevisar inte 15 faktiskt planerade hela veckor. Spara och arbeta vidare utan perioder; befintligt rektorsbekräftande/fastställande kräver fortfarande komplett stödd förläggning. Inför bekräftelsen ska all års-APL vara periodförlagd och uppgifterna ha granskats. Huvudmannen godkänner fortsatt separat. **Att kunna fastställa timplanen före färdig periodförläggning är ett separat verksamhetsval som inte är godkänt av bildreferensen och inte ingår här.** Om den tidigare beslutsgrinden ska ändras behöver det först skiljas mellan beslut om timbudget och beslut om APL-förläggning, med synlig status och egna verifierade villkor; agenten ska inte anta det valet.
- GUT jämförs i minuter mot verifierad profil. Års-APL får inte adderas igen vid beslut, kopiering, översikter eller export. Någon export som inte förstår V2 får inte leverera gamla terminstotaler som ersättning.

### Explicit övergång utan dataförlust

Nya tomma timplaner för de redan stödda gymnasiala yrkesprogrammen använder V2 när hela stödet är levererat. Övriga program/skolformer behåller nuvarande modell och får inga nya APL- eller beslutsantaganden; representationen kan utökas senare efter eget verifierat profilkontrakt. Kopiering/nästa version från V1 bevarar först källans modell; användaren får sedan en konkret helplansövergång. Kopior från V2 bevarar V2. V1 fastställd/ersatt version ändras aldrig; skapa en ny utkastversion före övergång.

En övergång av utkast/återsänd V1-plan görs atomärt med aktuell revision och granskad basisHash. Servern räknar om förslaget från läst data:

```
skola(term) = gammal totaltid(term) × 60 − registrerad period-APL(term)
års-APL(år) = summa registrerad period-APL i årets två terminer
```

Null totaltid behålls null; helt inaktiva ämnesår behåller null års-APL. Föreslagen0 gäller endast aktiva år och blir ett uttryckligt värde först vid granskad övergång. Befintliga APL-allokeringar, period-ID:n, datum och minutvärden behålls exakt. Frånvaro av registrerad APL är inte bevis för att den gamla timplanen saknar APL. Övergångens granskning visar därför vad som har dragits av, vad som föreslås som skoltid och att ännu oidentifierad APL måste granskas. Nollårsramar får föreslås och sparas först genom detta uttryckliga helplansbeslut; ingen bakgrundskonvertering eller automatisk klassificering som färdiggranskad.

Exempel: gammal total 80 h och period-APL 30 min ger **79 h 30 min skola + 30 min års-APL**, fortfarande 80 h totalt. Ingen avrundning till 79 eller 80 h. V2-inmatningen måste kunna visa/redigera dessa minuter; använd hela timmar eller `h:mm`, aldrig runda bort ett gammalt minutrestvärde.

Om gamla data inte går att kontrollera, eller period-APL överstiger registrerad total, stoppas övergången med konkreta rättningspunkter. Avbryt lämnar allt orört. Avbrutet HTTP-svar återhämtas från samma requestbundna kvitto; inga dubbla övergångar. Alla gamla kvitton och rektors-/huvudmannahändelser förblir byte-/betydelsemässigt oförändrade. Ny tidsmodell får en ny innehållshash och kräver nytt aktuellt rektorsunderlag, även om totalen är lika.

### Autofördelning

Dialogens total avser **hela undervisningstiden inklusive angiven års-APL**. Den visar års-APL som reserverad summa och fördelar `önskad total − angiven års-APL` på skolceller enligt programmets aktiva terminsvikter. Års-APL, perioder och placeringar ändras inte. Lägre total än reserverad APL + bevarad skoltid nekas. Fyll tomma bevarar uttryckliga nollor och skolminuter; fördela om ändrar endast skolmatrisen. Räkna och avrunda i heltalsminuter så totalsumman blir exakt även efter en övergång med minutrester. Visa tydligt om APL-fält ännu är obesvarade; ett exakt förslag ska inte markera planen komplett.

## Acceptanskriterier och spårning

| ID | Observerbart resultat | Primärt bevis |
|---|---|---|
| ANNUAL-01 | Skola HT/VT + APL per årskurs sparas utan perioder | 01 modell/SQL, 04 faktisk UI/API |
| ANNUAL-02 | Total, APL-andel och GUT räknar varje minut en gång | 01 paritet, 02 beslut/distribution, 04 |
| ANNUAL-03 | Förlagd/kvar att förlägga stämmer och perioder ryms inom årsram | 01–02, 04 |
| ANNUAL-04 | V1 bevaras; uttrycklig övergång är exakt och återhämtningsbar | 01–02, 04 |
| ANNUAL-05 | Nya planer, kopior, nästa version och gamla kvitton har rätt modell | 02, 04 |
| ANNUAL-06 | Rätt skolmandat, MFA, CAS, audit och låsta planer gäller alla vägar | 01–02, 04 |
| ANNUAL-07 | Verksamhetsord, handledning och mobilflöde är begripliga | 03, 04 samt efterföljande användarprov |

Lokala paketkriterier, inte nya pilotkrav eller full fasacceptans. Stödjer befintliga PLANERING-/ADMIN-krav; root kopplar slutresultat till befintlig kravmatris när bevis finns.

## Fyra kontrollerbara delsteg

| Steg / våg | Plan | Leverans | Beroende |
|---|---|---|---|
| 1 | [APL-ANNUAL-01](05-APL-ANNUAL-01-PLAN.md) | Minutkontrakt, additiv lagring, atomisk övergång och skydd | inget nytt |
| 2 | [APL-ANNUAL-02](05-APL-ANNUAL-02-PLAN.md) | Skyddade API-vägar, alla summor, period/beslut/kopiering och autofördelning | 01 |
| 3 | [APL-ANNUAL-03](05-APL-ANNUAL-03-PLAN.md) | Timplanstabell, granskningsdialog, enkel APL-arbetsgång och handbok | 02 |
| 4 | [APL-ANNUAL-04](05-APL-ANNUAL-04-PLAN.md) | Faktiskt isolerat prov, granskad installation och exakt kandidatleverans | 03 |

Sekventiellt eftersom tidsbetydelsen korsar samma kontrakt och beslutsfunktioner. Oberoende provförberedelser kan göras parallellt; inga produktfiler ska ha samtidiga ägare. Varje steg ger granskbar commit och push enligt projektregeln. Ingen installation görs utifrån en ofärdig delmängd.

## SS 12000 och begränsningar

Utgångspunkt är projektets dokumenterade avstämning mot SS 12000:2024 utgåva 4/OpenAPI 2.1.0. Skol-/APL-minuter och årsramar är interna planeringsvärden; de ska inte mappas till faktisk Attendance, CalendarEvent eller Placement. Befintliga stabila ID:n, skola, utbildning, klass–timplansrelation och giltigheter ändras inte. Årskurs är relativt utbildningens befintliga kalenderindelning, inte ett nytt externt organisationsobjekt. Om utbyte senare behöver dessa värden krävs separat explicit mappning och verifierat motpartskontrakt. Ingen standardefterlevnad eller extern anslutning påstås av denna modell.

## Villkor före leverans

Modellbeslutet är klart nog för genomförande, men implementation och verifiering återstår. Blockera inte vanlig utveckling på ett nytt godkännande av användarens redan valda kolumner. Om permanent databasinstallation behöver ett nytt uttryckligt beslut ska användaren få det konkreta testade migrationspaketet och bevarandebevisen först, inte en abstrakt fråga nu.

Nuvarande code-only GUIDE-DATES-verktyg kan inte användas som migrationsbevis: det kräver oförändrad schemafingerprint. Ny installation kräver egen prövad före/efter-kedja. Återställning till gammal app är bara säker före nya V2-skrivningar; efter sådana skrivningar får man inte återställa till en klient som saknar V2-lässtöd. Ha en kompatibel återställningskandidat eller stoppa med tydlig återhämtningsstatus. Ingen aktiv dist byggs om, ingen databas återställs och inga gamla verksamhetsrader tas bort.
