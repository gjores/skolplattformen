# Programplaner — begriplighetslucka i användarprovet

Datum: 2026-10-02. Status: konstaterad användbarhetslucka; rättning planerad i 05-13. ADMIN-02 och hela fas 5 är öppna.

## Användarfynd

Användaren svarade under det förberedda mänskliga provet: **”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.”** Det är ett underkänt begriplighetsprov, inte en rapport om godkänd programplansfunktion. Inga ytterligare frågor behövs för att börja rätta den uppenbara presentationen.

05-11:s automatiska 30 programplans- och 20 timplansbrowserprov på bygge c320041 bevisar mekanik och skyddsgränser. De bevisar inte att en rektor förstår arbetsflödet. Timplanshandledningens mänskliga bedömning och fas 4:s separata checkpoint hålls öppna. Tidigare previewavbrottsdiagnos kvarstår separat.

## Verifierade orsaker i aktuell vy

- `openEducation` öppnar utbildningen utan läst plan; användaren behöver först förstå och välja en version för att se sina sparade val.
- Versioner, revision och katalogunderlag står före ämnesinnehållet. Fasta programblock göms i en separat utvikbar del, medan tekniska ord och en omfattande begränsningstext möter användaren först.
- Vanliga handlingar kräver först ett katalogval på annan plats. En otillgänglig knapp förklarar inte tillräckligt vilket verksamhetssteg som återstår.
- Äldre gränssnitt i `organisation-workspace.tsx` visar ämne/nivå/poäng och fördjupningsval tydligare. Dess generella 2 500-poängsram, automatiska alternativ, beslut och direkta datalager får däremot inte kopieras till skyddat läge.

## Genomförandeval

1. En utbildning öppnar sitt verkliga utkast, annars sin senaste plan, genom serverns exakta ID. Äldre versioner finns under **Underlag och tidigare versioner**. Saknad plan får en tydlig början.
2. Huvudvyn visar utbildning/skola/kull, kort status och **Ämnen och nivåer**. **Ingår enligt underlaget** och **Dina sparade fördjupningsval** är olika delar. Tabell på dator och läsbara rader på telefon använder ämnesnamn, nivånamn och gymnasiepoäng. Referenskoder finns kvar men styr inte läsningen.
3. Huvudåtgärderna är **Skapa programplan**, **Ändra fördjupning** och **Skapa ny version**. Ett äldre utkast visar **Gör utkastet redo för ändring**, följt av guidad aktiv källa/start/bekräftelse. Teknisk bindning förklaras i Underlag.
4. Aktivt källval presenteras med programnamn, källa och hämtad datum. Även när exakt ett underlag finns krävs ett uttryckligt val; utbildningsstart fylls inte med dagens datum, kullår eller gissning. Bunden plan använder sin oförändrade källa/start.
5. Normal status är kort: **Utkast — kan inte fastställas här ännu**. Konkreta kvarstående alternativ eller saknade nivåuppgifter syns vid berörd rad. Fullständig begränsning och tekniska katalog-/program-/ämnesversioner, revision och SHA kan hittas under Underlag.

Ingen källalternativkombination, svenskämnesval, modernspråksnivå eller generell poängram får gissas. Referensblock blir inte sparade val; block med saknade nivåer blir inte uppfunna rader eller en falsk totalsumma. Endast fördjupningsändringar som redan stöds av servern får erbjudas. Ingen ny databasåtgärd, behörighet, utbildning, fastställande eller kull-/klasskoppling införs.

## Arbetsgräns

05-13 bevarar befintliga parser-, API-, revisions-, MFA-, mandat-, epoch-, osparat- och osäkert-svarsgränser. Fyra beständiga syntetiska användarprov lämnas orörda. Separat lokal OTP-hjälp samordnas av root; den är inget beroende för programplanskommandon och ger ingen UI-rätt att kringgå MFA. Automatiskt omprov och handbok gör den förbättrade vyn redo för ett nytt mänskligt begriplighetsprov, som först användaren kan godkänna.
