---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-07
status: actual_http_oidc_verified
updated: 2026-10-15
remaining: []
---

# Skyddade API-kontrakt — verifierad förberedelse

Två skyddade POST-vägar förbereds för separat namngiven timplan och namnbyte. Befintlig versionsväg behåller sitt kontrakt. Plan07 är ännu inte slutverifierad: faktisk paritet med03–05 och HTTP/OIDC återstår. Workergrants är separat SQL-verifierade enligt04. Ingen permanent migration eller lokal runtimeleverans har gjorts.


**Slutverifiering2026-10-16:**05:s faktiska SQL-/TypeScript-paritet och11:s sammanhängande38-kontrollers HTTP/OIDC/browserprov passerar. Se [samlad verifiering](05-NAMED-TIMPLANS-UX-VERIFICATION.md). Ovanstående förberedelsestatus är historik; lokal leverans och mänsklig acceptans hanteras separat i12.

## Genomförande

- `/api/timplaner/gym/planer/skapa` och `/namn` använder befintlig sessions-/uppdragskontroll, rektor/skoladministratör, MFA, same-origin och obligatorisk audit. SQL får exakt validerad JSON, aldrig klientens påstådda mandat.
- Nya kvittoparsers binder skapa till granskad källa/skola/namn och namnbyte till plan/serie/namn/förväntad namnrevision. Ny serie börjar på version1/revision0. Ett nytt skapandekvitto är oföränderligt även efter senare namnbyte eller timredigering; återläsningens plan får då ha nyare metadata. Gamla versionsendpointens kvittosemantik består.
- Gymadaptern kontrollerar hela frysta katalogen, poängramen och återförda rader före commit. Planens stabila serie och namn vid skapandet binds till kvittot. Godtyckliga eller saknade SQL-fält avbryter transaktionen.
- Aktiverade gym-, klass-, besluts- och årsadaptrar kräver den nya serieformen. Pureparsers uttryckliga legacygren kan inte dölja saknade nya läsfält. Äldre beslutshistorik får behålla sin gamla form när SQL additivt kompletterar ett äldre kvittos saknade serieuppgift; lagrat kvitto och hash ändras inte.
- Namnkonflikten ger ett minimerat svenskt besked. SQL-permissionsfel ger fortsatt generellt behörighetsfel och avslöjar inget namn i annan skola. Audit innehåller ingen timmatris eller fritt plannamn.
- En separat grantmigration förbereder endast de två nya entrypointsen. Den får inte appliceras separat från paketet.04:s isolerade slutprov verifierar exakt två nya grants, oförändrade tabell-ACL och verklig Workerroll som skapar och byter namn; detta är inte ett HTTP-prov.

## Kontroller

`node --test lib/named-timplan.test.mjs lib/server/named-timplan.test.mjs lib/server/gym-timplan.test.mjs lib/server/class-timplan.test.mjs lib/server/plan-decision.test.mjs lib/server/planning-year.test.mjs`: **77/77 PASS** med transaktionella DB-/sessionsdubblar. Verklig Worker/SQL/MFA verifieras separat i11.

Logg: `/private/tmp/named07-77.log`, SHA256 `45ee26d0d8b2d35c9fe0a8c73a8af4f888c3eb9acaa74c596959d071c8f9dfb8`.

Slutlig `npx --no-install tsc --noEmit` och riktad oxlint över samtliga ändrade07-produktfiler/tester passerade. En tidigare bred lint under parallellt09-arbete såg dess pågående React-/testfel; det resultatet är inte ett godkänt paketprov. Första nya serverprovet hade en alltför snäv testförväntan på auditdetaljer: korrekt MFA-bevis ingår utöver rollen. Förväntan rättades utan att ta bort säkerhetsbevis. Typkontrollen fångade först saknad deklaration av nya felkoden; ErrorCode och dess säkra audit-/meddelandemappning kompletterades.

Testerna omfattar skolroller, MFA, CSRF, föråldrad kontext, strikt request, kopiepar, byte av SQL-identitet/källa/serie/namn/revision, katalogmanipulation, oförändrat kvitto vid replay, senare tim-/namnändring, felaktigt historiskt kvitto och obligatorisk auditrollback. Ingen verklig anslutning eller bevarandekontroll över användarens rader påstås av dessa prov.

## Förhållande till övriga planer

06 kompletteras här med kvittotyper och rename-revisionens SQL-gräns2147483646 för att lämna plats för nästa revision. Serverns felkodstyp, svenska meddelande och auditlista behövde ändras utöver07:s ursprungliga filförteckning. Det är nödvändig lokal integration, inga nya rättigheter.

SS12000-avstämningen följer paketets dokumenterade2024/2.1.0-mappning: stabil klass-/organisationsidentitet består, timplansserie är intern metadata. Ingen elev-, medlemskaps- eller extern-ID-information ändras. Gapet och plan07 kvarstår öppna tills beroenden, verklig paritet och sammanhängande leverans är verifierade.
