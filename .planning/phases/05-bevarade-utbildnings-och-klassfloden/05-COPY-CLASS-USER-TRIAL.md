---
phase: 05-bevarade-utbildnings-och-klassfloden
scope: kullkopiering-och-klassens-lasars-version
status: partially_user_verified
human_result: version_switch_user_reported_pass
prepared: 2026-10-14
worker_build_revision: 2836908f810dd89c6135126b6cb766b32ac30783
requirements: [ADMIN-03, ADMIN-04, PLANERING-04]
---

# Prova kopiering och klasskoppling

## Rapporterat resultat

Användaren svarade ”ok funkar bra!” efter förtydligandet av steg 4: skapa och fastställa version 2, behålla tidigare klasskopplingar och sedan uttryckligen byta endast 2027/28 till version 2 medan 2028/29 ligger kvar på version 1. Detta registreras som användarrapporterat godkänt för det beskrivna versionsbytet. Exakta planobjekt, roller, enheter och enskilda delkontroller särredovisades inte. Svaret ger inget separat godkännande av kullkopieringens steg 1 eller mobilprovet; de delarna är fortsatt utan uttryckligt resultat. Den rapporterade långsamma inläsningen ligger kvar i backloggen.

Öppna [appen](http://127.0.0.1:3012/?vy=programplaner) och ladda om sidan för den nya versionen. Använd dina befintliga syntetiska huvudmanna- och rektorsuppdrag. Välj **Syntetisk skola 11** och **2027/28**. Exemplet **SAM_TEST** finns kvar; originalet har inte ändrats vid leverans. Dess programplan har 2 500 fördelade poäng och skolans timutkast har 2 230 timmar, 25 rader och inga tomma aktiva terminsfält. Båda är utkast, vilket gör huvudmannens granskning till ett synligt förberedelsesteg för klassprovet.

## 1. Kopiera som huvudman

Öppna SAM_TEST:s programplan och välj **Kopiera**. Ange exempelvis namn **SAM_TEST – provkopia**, elevkull **2028–2031** och startdatum **2028-08-01**, sedan **Spara kopia**.

Kontrollera att det är en ny utbildning, version 1 och utkast. Ram, ämnen/nivåer, sex terminers poäng och skolval ska motsvara originalet. Den nya starten ska ge rätt årskurs för 2028/29. Elever, klasser, skolans timplaner, paketval och gamla beslut ska inte följa med. Ladda om, välj 2028/29 och öppna kopian igen; kontrollera att allt finns kvar. Återgå till originalet på 2027/28 och kontrollera att det är oförändrat.

## 2. Förbered klassprovet med originalets planer

Återvänd till originalet SAM_TEST. Som huvudman: granska programplanens kontrollpunkter och fastställ den om den fortfarande är utkast. Öppna originalets skolvisa timplan. Skicka den för granskning som rektor, granska och fastställ som huvudman. Appen ska visa eventuella verkliga hinder; rapportera dem om något blockerar och är oklart. Hoppa inte över en obligatorisk kontroll för att komma vidare.

Detta använder den tidigare godkända beslutskedjan för att få en fastställd timplan till klassprovet. Inga fastställanden har gjorts automatiskt åt dig och den nya provkopians planer behöver inte fastställas.

## 3. Koppla en klass som rektor

I originalets fastställda gymnasietimplan: välj **Koppla klass**, läsår **2027/28**, skriv ett nytt syntetiskt klassnamn (exempelvis **Testklass – klasskoppling**) och välj **Skapa klass**. Klassen skapas utan elever. Välj **Koppla vald klass**, granska skola, läsår, årskurs 1 och exakt timplansversion och bekräfta.

Läs om och kontrollera att kopplingen finns kvar. Välj också **2028/29** och koppla samma klass till samma version för årskurs 2. Kontrollera att första årets koppling består.

## 4. Byt version uttryckligt

Välj **Skapa ny version** för originalets timplan, granska det nya utkastet och använd rektorns/huvudmannens beslutskedja för fastställande. De tidigare klasskopplingarna ska fortfarande gälla den gamla timplansversionen.

I nya versionen: byt klassens koppling uttryckligt för **2027/28** och bekräfta. Kontrollera att endast det valda året bytte version och att **2028/29** fortfarande visar den tidigare versionen.

Prova gärna urval och kopieringsform även i mobilstorlek. Bedöm framför allt om original/kopia, utkast/beslut, klassens läsår/årskurs och gamla/nya timplansversionen är lätta att skilja. Svara med vad som fungerade eller vilket steg som blev oklart.

## Intern avgränsning

Mänskligt resultat för versionsbytet är registrerat ovan; övriga delar saknar separat bekräftelse. Leverans och tekniska delbevis finns i [COPY-ATOMIC-verifieringen](05-COPY-ATOMIC-VERIFICATION.md) och [OPERATIONAL-verifieringen](05-OPERATIONAL-VERIFICATION.md). Läsande inventering av befintliga exempel förbereddes utan nya affärsdata. Inget nytt fullfas-, logghistorik- eller kommunanslutningsgodkännande följer av detta avgränsade användarresultat.
