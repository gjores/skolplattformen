# Fas 3 — lokal research, 2026-09-21

Planeringsunderlag, inte körbevis. Ingen extern integration, rättslig klassning eller ny leverantör bedöms här. `.planning/codebase/ARCHITECTURE.md` och `CONCERNS.md` är historik; aktuell kod nedan går före.

## Belagd utgångspunkt

- `web/lib/access-rules.ts`: sex funktioner; elevhälsa, IT och support saknas. Datumstyrda uppdrag finns.
- `supabase/migrations/20260913200000_phase2_access_model.sql`: `access_assignments` knyter medlemskap, kund, huvudman, skola och giltighet. Separata relationer och supporttider behövs. Utvidga med migrationer; skriv inte om historiska migrationer.
- `web/lib/server/authz.ts`: `protectedRoute` arbetar via aktuell session och transaktion. Händelse krävs bara för mutation; en elevläsning måste också kräva händelse före respons.
- `web/lib/server/events.ts`: serveraktör, begränsade detaljnycklar och separat nekandelogg finns. `logDenied` undertrycker efter 20/minut; den 21:a ger markör, senare försök saknar enskild händelse. Detta behöver ändras för godkänd loggpolicy. Fri text under tillåtna nycklar är inte bevis på innehållsminimering.
- `web/app/api/kund/rektor/route.ts`, `inbjudan/route.ts`, `uppdrag/avsluta/route.ts` är befintliga ingångar; alla tilldelningsvägar måste omfattas, inte bara nya formulär.
- `work/pilot/verify-target.mjs`, `run-sql-tests.mjs`, `verify-access.mjs` och `web/scripts/verify-phase2.mjs` ger mönster för isolering, negativa prov och färsk evidens. Inga sådana prov kördes under denna planering.
- Karantänen och Worker-rättigheter måste omprövas tillsammans: direkt nekad PostgREST/Storage/SQL är inte automatiskt en registrerad säkerhetshändelse. Bevis måste komma från den faktiska nekande komponenten, inte testklientens påstående.

## Föreslagna syntetiska standarder — inte användarbeslut

Använd en versionerad provprofil `synthetic-v1`, endast i verifierat lokalt mål. Verklig profil saknas tills kundens beslut registrerats; inga syntetiska standarder får aktivera verklig elevåtkomst.

| Fråga | Konkret provförslag | Kvarvarande beslut |
|---|---|---|
| Elevhälsoansvarig | Förseedat separat mandat med explicit skolmängd; ingen publik utnämningsväg och ingen självutökning | Vem utser funktionen och vilka skolor den får delegera över |
| Elevhälsans professioner | Uppdragskategori elevhälsa med profession som metadata; endast syntetiskt elev-ID, visningsnamn, skola och grupp. Ingen medicinsk eller annan anteckning | Professionernas verkliga åtgärder och fält |
| Omfattning | Explicit skolomfattning eller elev-/ärendetilldelning; ett ärende ger endast angiven elev och angivna fält, inte alla elevens ärenden | Eventuell ytterligare delegation |
| Support | Läsning av explicit syntetisk elev inom en skola, syfteskod och rektorsgodkännande; högst 60 minuter, ingen export/skrivning/delegering | Verkliga åtgärder och maxtid |
| Lagringstid | 30 dygn i syntetisk miljö; konfigurerad gallring med provad gränstid | Kundbeslut före verklig drift |
| Åtgärdsmatris | Lärare: läsa egna undervisnings-/mentorselever; skoladmin: läsa och exportera tilldelad skolas syntetiska basfält; rektor: läsa skolans syntetiska basfält och tilldela personal; huvudman: organisationsöversikt och rektorsutnämning; IT: anslutningsstatus utan elevdata; granskare: minimerad säkerhetslogg | Fält och åtgärder i verklig pilot |

Alla okända åtgärder nekas. Kundadmin ger inte elevinsyn eller fri rolltilldelning. Ingen roll får utöka det egna mandatet. Uppdrag får inte löpa utanför tilldelarens skolor eller giltighet; kontrollera också om överordnat mandat senare avslutas. IT-statusprovet är lokalt och innebär ingen registeranslutning. Exportprovet bevisar säkerhetskedjan, inte fas 4:s kompletta exportflöde.

## Arkitekturval för planerna

Behåll Worker/session/transaktion/Postgres. Gör en ren, testbar beslutsmodell och motsvarande SQL-gränser; verifiera samma matris mot båda. Separera syntetiska elev-/ärenderelationer från framtida elevregister. Bygg inte journalsystem eller komplett ärendesystem. Direktvägar förblir stängda; någon dataväg utan verifierbar obligatorisk loggning får inte öppnas. Om den lokala stacken inte kan belägga nekandeloggning markeras AUDIT-02 blockerad, inte godkänd.
