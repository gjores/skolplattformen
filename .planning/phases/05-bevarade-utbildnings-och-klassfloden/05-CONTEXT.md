# Fas 5 — sammanhang

Datum: 2026-09-29. Status: planering inför genomförande, inga ADMIN-krav verifierade.

## Avsikt och redan beslutade gränser

Användaren har bett att fortsätta med nästa fas. ADMIN-01–04 och färdplanen godkändes 2026-09-11; inget nytt godkännande av dessa krav behövs. Fas 5 bevarar skoluppslag, gymnasieutbildning med kurs-/nivåtillägg och versionsbeslut, kopiering till senare elevkull samt beständig klass–timplanskoppling med korrekt läsårsunderlag. Grundskola och introduktionsprogram bevaras där modellerna stöder dem.

Fas 4 är ännu inte slutverifierad. De första tre användarproven och källavvikelseprovet är rapporterade klara; datumvisningen är anmärkt, och samtidiga ändringar, skyddsbehörighet och separat personnummervisning återstår enligt checkpointunderlaget. Fas 5 får planeras nu. Öppnande av skyddade driftvägar och slutverifiering förutsätter att fas 4:s verifieringsluckor har hanterats. En separat TODO gäller bred UI-genomgång; detta är inte dess genomförande.

## Genomförandeval inom godkänt scope

- Återanvänd organisation-, timplan-, läsår- och kullmodeller som regelkällor, men kontrollera och genomdriv deras regler i server/SQL. Klientroll är aldrig bevis.
- Skyddad arbetsyta använder aktuella access_assignments och levande mandatkedja. Äldre assignments kan endast vara kompatibilitetsdata, inte rektorsauktoritet.
- Skolverket är referenskälla. Skoluppslag bevisar inte huvudmannens mandat. Uppdatering får inte ersätta lokalt tillsatt rektor eller ändra mandat.
- Inga demoidentiteter, implicit exempeldata eller breda direkta Supabase-skrivningar öppnas i skyddad app.
- Spara ett verksamhetskommando i transaktion tillsammans med obligatorisk minimerad audit. Versionskonflikt blir begriplig 409, inte tyst överlagring. Loggbortfall lämnar data oförändrade.
- Kopiering skapar nya planutkast/version 1 med nya ID:n utan elever, klasser, tillstånd eller gamla beslutshändelser.
- Klasskoppling använder school_classes.id och exakt timplans-ID/läsår/kolumn. Ny fastställd version flyttar aldrig kopplingar automatiskt.
- Anpassa endast UI som behövs för dessa arbetsflöden; verksamhetsnamn, tydligt sparläge, kvarvarande utkast vid rättningsbart fel, desktop/telefon/tangentbord.

## Öppna frågor som ska lösas i första kontraktsplanen

Läsårsändringar följer rektors utkast/förslag och huvudmannens beslut enligt kodkontrollen i 05-01. Exakta SQL-funktionsnamn och implementationens levande mandatkontroll återstår; inget nytt administratörsmandat antas. Äldre klassnamnskopplingar behöver ID-avstämning: entydig skola/klass/läsår får mappas; tvetydighet blir rapporterad lucka, aldrig en gissning. Eventuell ändring av beslutsregler eller utvidgning av behörighet måste särskiljas från bevarande och motiveras innan implementation. Fysisk telefon och verklig register-/kommunanslutning är ännu inte verifierade.

## Krav och prov

ADMIN-01: registerimport och återuppdatering bevarar lokal rektor.
ADMIN-02: gymnasieutbildning, kurs/nivå, poäng-/timplaners lås och beslut består efter ny inloggning.
ADMIN-03: kullkopiering är atomär och isolerad.
ADMIN-04: stabil klassbindning ger korrekt läsårsunderlag även efter senare timplansbeslut.

Varje krav provas med positiva och negativa SQL/API-prov, kontrollerat browserflöde och handbok; slutgrinden bevarar fas 1–4:s säkerhetsbevis. Simulatorprov och verklig anslutning får aldrig blandas ihop.

## Framåtriktad modulgräns — användarinriktning 2026-10-01

Användaren har beställt [ett sammanhängande schemadelprojekt](../../research/SCHEMAMODUL-PROJEKT.md) med Rustprototyp, utvärdering av Jev eller liknande AI för möjlig användning i schemamodulen samt valbara interna/externa moduldelar. AI-införande är inte beslutat och en lösning utan AI är ett giltigt utfall. Programplan, timplan, individuell studieplan, grupper och kalender behöver gemensamma kontrakt och särskilda mandat. Detta behöver beaktas redan när återstående fas 5-planer utformas.

För varje berörd plan ska genomförandeunderlaget redovisa stabila ID:n och exakta katalog-/planversioner, koppling till kull/klass/läsår, enheter för undervisningstid, giltighet samt ägare för ändringar och konsekvenser för framtida schema. Poäng är inte automatiskt schemaminuter. Ny planversion får inte tyst ombinda äldre klasskopplingar. Tvetydig legacy-mappning ska rapporteras som lucka.

Fas 5 behåller ADMIN-01–04 och befintliga fastställanderegler. Denna kompatibilitetskontroll kräver inga nya schemagrants, generell studieplansåtkomst eller AI-rättigheter i nästa API-plan. Specificering av schemaläggaruppdrag, modulkontrakt och regelmodell hör till delprojektets S1; Rustprototyp, AI-utvärdering och schemaflöden får egna genomförandeplaner och prov; eventuell AI-integration kräver separat införandebeslut.
