# Elevkullar och klasskopplingar

Implementerat 8 september 2026 i arbetsversionen och Supabase-projektet `skolplattform-dev`.

## Prova grundskola

I huvudmannens eller rektorns arbetsyta finns **Visa grundskoleexempel**. Den öppnar en separat grundskola med årskurs 1–9, timplansversioner och läsår. Här kan man prova flöden med syntetiska uppgifter. Ändringarna stannar i exemplet och försvinner när man lämnar det. **Tillbaka till mina skolor** läser in de sparade skolorna igen.

## Kopiera till nästa elevkull

Som huvudman: öppna **Utbildningar**, välj utbildningen och klicka **Kopiera till ny elevkull**. Ange den nya kullens startår och skapa kopian.

- Program, inriktning, lokalt namn/kod och grundskolans årskurser följer med.
- Den senaste poängplan som inte är ersatt kopieras med sina valda nivåer. De nationella blocken kommer fortsatt från appens katalog.
- Den senaste timplan som inte är ersatt kopieras med sina timmar.
- Den nya utbildningen får status Planerad. Planerna börjar på version 1 som utkast och behöver egna beslut. För gymnasiet blir timplanen tillgänglig när den nya poängplanen fastställts.
- Tillstånd, beslut, klasser och elever kopieras inte. Den ursprungliga kullen ändras inte.
- Samma utbildningsnamn och slag vid samma skola får inte kopieras till samma kull igen. Startåret måste ligga efter källans.

Databasfunktionen `copy_offering_cohort` gör hela kopieringen i en transaktion. Vid fel skapas ingen halv kopia. Källans kull och planversion antecknas i historiken.

## Koppla en klass till timplanen

Öppna **Timplaner**, välj utbildning och en **fastställd version**. Länken **Klasser och läsår** leder till kopplingarna. Ange klassnamn, läsårets startår och årskursen/kolumnen i timplanen. Klassnamn från exempelregistret föreslås; det går även att ange ett namn manuellt.

En klass har en koppling per skolenhet och läsår. När samma kombination sparas igen ersätts dess koppling. En ny fastställd timplansversion flyttar inte automatiskt klassen: tidigare kopplingar fortsätter referera till sitt beslut. Kopplingen kan också tas bort uttryckligen.

Kopplingarna sparas i `class_timplans` och används i **Läsår & skoldagar** för klassens årskurs, utbildning och timplansberäkning. En manuellt angiven klass skapar inte elever eller medlemskap i elevregistret. Elevregistret är fortfarande sessionsbaserat.

## Kontroller

- 80 modelltester, inklusive nya tester för kopiering, oberoende kopior, dubbletter och klasskopplingar.
- Typkontroll, kodkontroll och produktionsbygge.
- `work/supabase/verify-cohorts.mjs` verifierar riktiga databasskrivningar och omläsningar, dubblettskydd, startår, beslut, kolumner, skolgränser och bevarade versionskopplingar. Testet använder egna tillfälliga skolor och tar bort dem efteråt.
- Webbläsartest av grundskoleexempel, klasskoppling, användning i läsårsvyn, ny kull och återgång till sparade skolor.

Även skolvalet efter sparning och skolregistrets utbildningsförslag har rättats i de berörda flödena. Tabellernas rullområden avgränsas så att låsta ämneskolumner inte gör hela mobilsidan bredare.
