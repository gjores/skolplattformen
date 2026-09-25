---
title: Exempelläget
---

Exempelläget visar hela planeringsarbetet med fiktiva skolor och elever. Det kräver ingen inloggning och har ingen databasanslutning: allt du ändrar ligger i webbläsarens minne och försvinner när du laddar om sidan. Sidhuvudet skriver ut **Provmiljö** och texten *Fiktiva skolor och elever*.

**Status:** Verifierat. Flödena nedan prövades på dator och telefon i september 2026.

## Välja skola och roll

Skolväljaren i sidhuvudet växlar mellan de två exempelskolorna — en grundskola och ett gymnasium. Valet följer med till elev- och klasslistorna, så att du alltid ser den valda skolans innehåll.

Rollväxlaren i sidfoten (*Prova som*) byter arbetsyta mellan huvudman, rektor, administratör och lärare. I exempelläget är detta en visning av olika arbetsflöden, inte en behörighetskontroll. Riktiga mandat prövas på servern i den [skyddade provmiljön](mandat.md).

## Huvudmannens och rektorns vyer

**Skolenheter.** Huvudmannens skolor med skolform och registeruppgifter. Nya skolenheter hämtas ur Skolverkets skolenhetsregister via organisationsnummer, kommun eller skolenhetskod. Registrets skolformer och program blir förslag till planerade utbildningar. Rektorns e-post och telefon förs aldrig vidare från registret.

**Utbildningar.** Skolenhetens studievägar med lokalt namn, kull och status. Tillstånd registreras per utbildning med utfärdare, diarienummer, beslutsdatum och giltighet. En utbildning kan kopieras till nästa elevkull: kopian är fristående, får status *Planerad* och kräver ett nytt beslut. Kopieringen flyttar inte elever.

**Poängplaner.** Nationella block läses ur Skolverkets katalog och är låsta. Programfördjupningen väljs ur den föreskrivna listan med kontroll av poängsumma, dubbletter och nivåföljd. Rektor och huvudman utformar utkast; huvudmannen fastställer. En fastställd version ersätter den förra och redigeras inte i efterhand.

**Timplaner.** Fördelningen av undervisningstid per utbildning. Rektorn redigerar utkast och skickar förslag; huvudmannen fastställer med dokumenterat beslut eller återsänder med skäl. Historiken behålls och skillnaden mot gällande version visas cell för cell. En fastställd timplan kan kopplas till en klass; kopplingen följer inte automatiskt med till en ny version.

**Läsår och skoldagar.** Årskalender där varje dag sätts till skoldag, lovdag eller studiedag. Ett förslag räknas fram ur helgdagar och vanliga lov. Kontrollen prövar gränserna i skolförordningen och gymnasieförordningen och varnar för ojämn fördelning över veckodagarna. Helger, allmänna helgdagar och dagarna mellan terminerna kan inte göras till skoldagar. Avvikande lärotider kan läggas per årskurs och klass med angiven orsak.

## Administrationens vyer

**Elever** visar elevens utbildning, grupper och planering samlat, med sökning, filter, urval och export. **Studieplaner** visar utbildningsvägen från innehåll till undervisning och kontrolleras mot katalogen. **Grupper** visar medlemskap, kapacitet och schemapass med förhandsgranskning av gruppbyten. **Schema och resurser** visar en återkommande exempelvecka med krockkontroll.

## Lärarens vyer

**Min dag** samlar dagens lektioner med ingångar till undervisning och uppföljning. **Undervisning** visar arbetsområden och planering. **Återkoppling** kopplar respons till rätt version av elevens arbete. **Schema** visar veckan med navigation. **Ärenden** visar uppföljningsuppgifter, kommunikationsstatus och kontrollerat avslut.

## Vad exempelläget inte är

Exempelläget har ingen inloggning, ingen behörighetskontroll och ingen lagring. Det får aldrig användas med verkliga elevuppgifter. Ändringar gäller tills sidan laddas om — det är avsiktligt, så att provmiljön alltid börjar om från ett känt läge.
