# Fas 5 — kontrakt för bevarade planeringsflöden

Datum 2026-09-29. Status: lokalt kodhärledd genomförandegrund, inte implementerade skyddade operationer. Krav ADMIN-01–04 redan godkända; fas 4:s slutverifiering återstår.

## Åtkomst och kommandon

Ansvarsfördelningen i `05-CURRENT-EVIDENCE.md` gäller: huvudman importerar skola, definierar utbildning, kopierar kull och fattar planbeslut; rektor ändrar/föreslår inom sina aktuella skolor. Poängplansutkast och klasskoppling får även hanteras av huvudman enligt befintliga regler. Läsår följer samma rektor/förslag och huvudman/beslut som timplan. Ingen ny skrivrätt för skoladministratör, lärare, support, IT eller kundadministratör härleds ur tillgång till arbetsytan.

Varje skyddat kommando tar ett avgränsat verksamhetsobjekt, relevant objekt-ID och förväntad revision. Servern härleder kund, aktör, huvudman, skolmandat och tid från giltig session; klienten får inte bestämma dessa. Aktuella access_assignments och levande mandatkedjor är auktoritet; äldre assignments/assignment_units får bara användas som kompatibilitetsdata. SQL kontrollerar samma relationer och aktuella mandat inom transaktionen. Läsning måste avgränsa både objekt och metadata till tillåtet uppdrag. Exakt läsbehörighetsmatris för övriga roller förblir stängd tills respektive genomförandeplan har specificerat den; äldre listvisning är inte ett nytt mandat.

## Oföränderliga samband

- Skoluppdatering får uppdatera registerfält men bevarar lokala rektorsmandat. Registeruppslag bevisar inte företrädarrätt.
- Utbildning, plan, klass och läsår måste tillhöra tillåten skola och kund. Klassbyte är inte automatiskt utbildningsbyte.
- Poängplanens katalogval, timplansramar, versionslås och beslutsregler återanvänds från modellerna och verifieras på servern. Klientkontroll räcker inte.
- Kullkopiering kopierar utbildningsupplägg och innehåll till egna nya planutkast med nya ID:n/version 1 och explicit start_year för den nya kullen. Elever, klasser, gamla beslut och tillstånd kopieras inte. Dubblettkopiering låses och nekas även vid samtidiga anrop.
- Klasskoppling anger beständigt klass-ID, timplans-ID, läsår och kolumn. Vid ny koppling krävs fastställd version och giltig skola/kolumn. En senare ersatt version behålls i äldre explicita kopplingar; ny fastställelse flyttar inget automatiskt.

## Sparning, konflikter och loggning

Ett sammanhängande verksamhetskommando skriver innehåll, status och obligatorisk säkerhetslogg atomärt. Misslyckad audit eller delskrivning återställer hela kommandot. Audit innehåller sessionens faktiska aktör och mandat samt minimerad operation/objektidentitet, inga råa källpayloads eller onödiga personvärden.

Förväntad revision och radlås hindrar inaktuella skrivningar från att vinna. Konflikt svarar 409 med tillräckligt avgränsat underlag för omläsning och uttrycklig rättning. Klienten behåller rättningsbara utkast och visar sparningens verkliga status. Vid snabb lokal inmatning ordnas kommandon per objekt; gamla svar får inte ersätta senare avsikt. Nytt objekt får serverns ID före följande skrivning. Kontextbyte avbryter eller ignorerar föregående kontexts svar och rensar skyddat innehåll.

De två röda sparproven i startunderlaget måste bli gröna utan försvagade förväntningar. Den nya skyddade lagringsvägen får inte anses bevisad bara för att äldre transportstub passerar; motsvarande ordning, skapande-ID, konflikt och återställning ska provas även via verkligt lokalt API/SQL.

## ID-avstämning och migrering

Äldre class_timplans använder skola, klassnamn och startår. Endast exakt entydig matchning till school_classes får fylla beständigt klass-ID. Saknad eller flerfaldig match lämnas som rapporterad migreringslucka och hindrar öppnande av berört flöde; gissa aldrig elevklass ur namn. Inga elever kopieras eller omplaceras för att skapa en match.

Inventera tabellägare, policies, FK, grants och befintliga versioner i det assertTarget-skyddade lokala målet före ny migration. Bevara utbildnings-ID som fas 4:s placeringar refererar till. Lägg nya migrationer; ändra inga redan tillämpade. Återgång stänger den nya operationen utan att återöppna demo eller gamla breda grants.

## Stopp före öppnande

Skyddad navigation för utbildning/timplan/läsår/klass öppnas först när dess SQL/API-mandat, obligatoriska loggning, konflikter och bevarandeprov är gröna. Fas 5:s slutverifiering kräver fas 4:s avslutade användarprov och separata fasverifiering. UI- och datumanmärkningar från fas 4 kvarstår tills de åtgärdats och omprövats; den bredare UI-todon ersätter inte detta.

## Återstående implementeringsbeslut

Feature-specifika rutter/SQL-signaturer, revisionskolumner och datumstämplade migrationsnamn fastställs i följande genomförandeplaner efter lokal schema/grant-inventering. Dessa är ännu inte skrivna eller verifierade. Ändring av ovanstående befintliga beslutsroller ska behandlas som ändrad omfattning, inte rutinmässig portning.
