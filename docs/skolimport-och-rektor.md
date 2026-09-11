# Skolimport och rektorsuppdrag

Uppdaterat 8 september 2026.

Under **Skolenheter → Lägg till skolenhet** väljer huvudmannen först:

- **Organisationsnummer:** hämtar huvudmannens skolor från Skolverkets API, varefter en skola väljs.
- **Skolenhetskod:** hämtar den valda skolenheten direkt.

Besöksadress väljs i första hand, därefter postadress om besöksadress saknas. Gatadress, postnummer och ort visas före skapandet och lagras i Supabase. Skoltyper och program hämtas automatiskt från skolenhetens registerpost. Saknade adressuppgifter markeras som saknade; ingen adress konstrueras.

Huvudmannen kan välja en befintlig rektor, lägga till ett nytt rektorsnamn eller välja att utse rektor senare. Registrets rektorsnamn visas endast som källinformation och skapar inget uppdrag. Den sparade skolans rektor visas utifrån huvudmannens uppdrag och kan ändras med **Utse rektor**. Ett byte ersätter rektorsuppdraget vid den skolan och behåller personernas uppdrag vid andra skolor.

Registeruppdatering ändrar adress och skoluppgifter, men skriver inte över huvudmannens rektorsval. Äldre skolposter får adressen när de uppdateras från registret. Läraruppdrag tilldelas och avslutas av rektor. Huvudmannen har en läsvy för lärartilldelningen och utser fortsatt rektor. Uppdragen är verksamhetsuppgifter; de skapar inte ett inloggningskonto och skickar inga uppgifter till Skolverket.

Skola, skoltyper, registerunderlag och eventuell rektorsutnämning sparas i samma databastransaktion genom `import_school_unit`. `appoint_school_principal` hanterar byte av rektor. Migration: `20260908150000_school_import.sql`.

Verifierat med 84 modelltester, typ- och kodkontroll, produktionsbygge och webbläsartest på dator/mobil. Webbläsartestet gjorde riktiga API-uppslag i en isolerad exempelvy. `work/supabase/verify-school-import.mjs` provade adresslagring, automatiska skoltyper, rektorsval, återställning vid ogiltigt uppdrag och att registeruppdatering bevarar det lokala uppdraget. Testets tillfälliga skola och uppdrag togs bort efteråt.

API-adressformatet verifierades mot [Skolverkets registerpost](https://api.skolverket.se/skolenhetsregistret/v2/school-units/19207279), där adresser skiljs åt med exempelvis `BESOKSADRESS` och `POSTADRESS`.

## Ansvar för läraruppdrag

Rättat efter återkoppling 8 september: gränssnittet och verksamhetsmodellen tillåter endast rollen rektor att ändra lärartilldelningar. Migrationen `20260908170000_principal_teacher_assignments.sql` ger databasrollen rektor rätt att lägga till och ta bort kopplingar för lärare inom den egna huvudmannen, utan rätt att ändra rektorsuppdrag. Befintlig administrativ huvudmannapolicy finns kvar för skoladministration och den gemensamma demoinloggningen; det är inte en ombyggnad av demoinloggningen till personliga behörigheter.
