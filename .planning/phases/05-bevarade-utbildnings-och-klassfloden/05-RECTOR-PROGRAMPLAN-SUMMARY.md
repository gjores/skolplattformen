---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: RECTOR-PROGRAMPLAN
status: complete_local_verified
date: 2026-10-16
product_revision: a34dd199a96a1c24448c1c6ad8a688da4b91949a
---

# Rektors skapande och kullkopiering — leveransresultat

Användarens beställning är implementerad och levererad till den lokala skyddade appen på 3012. Rektor kan skapa utbildning med första programplansutkast och kopiera till nästa elevkull på vald egen skola. Det fungerar även när källan delas med andra skolor och har en annan ursprungsskola. Rektors kopia tillhör endast målskolan. Huvudmannen behåller sitt befintliga skolval vid kopiering och ensam rätt att godkänna/fastställa. Original, elever, klasser och timplanskopplingar bevaras.

Alla tre delsteg i [planen](05-RECTOR-PROGRAMPLAN-PLAN.md) är genomförda. Användarens ”kör på!” bekräftar genomförandet; det är inte ett nytt användarprov eller full fasacceptans.

## Verifiering

| Nivå | Resultat och avgränsning |
| --- | --- |
| Databas | 45 kontroller PASS med faktisk Workerroll i schema-only-kopia och syntetiska data. Skapande, status/replay, gemensam källa, egen målskola, huvudmannens flerskolekopia, nekat mandat, datum/CAS, auditrollback och beslutsgräns. Full schema-/raddataåterställning, ACL/grants och cleanup verifierade. |
| API-kontrakt | 19 prov PASS; simulerad databas/session i dessa prov. |
| UI | 24 kopieprov och 62 klass-/skapandeflödesprov PASS på dator/telefon med simulerade API-svar. |
| Faktiskt slutprov | 23 kontroller PASS: riktig lokal OIDC/MFA, Worker/API och dator/telefon. Skapande och kopiering genom faktiskt UI, sekundärskola, oförändrat original, exakta kvitton, CSRF/epok, auditrollback, återkallat mandat och huvudmannens godkännande. 12 callbackförlopp verifierade. Samtliga egna testmiljöer och IdP-fixturer städade. |
| Statisk kontroll och bygge | TypeScript, full app/lib-lint, separat skyddat appbygge och handboksbygge PASS. 468 versionshanterade webbkällfiler bytejämförda med det separata byggunderlaget. |
| Installations-/leveransverktyg | 91 prov PASS, inklusive nekade ofullständiga bevis, exakt sex funktionsbyten, tidigare leverans och skolavgränsad rektorsförmåga. |

Sex slutbilder är granskade. CSS för layout, dold hjälptext och fast datornavigation kontrolleras också i browserprovet. Helbilderna återger flytande navigation över delar av dokumentet; granskningen och faktisk interaktion gäller det avgränsade skapande-/kopieringsflödet, inte en allmän acceptans av hela gränssnittet.

## Installation och lokal leverans

Migration `20261016100000_rector_programplan_creation.sql` är installerad. Exakt sex befintliga funktionsdefinitioner ändrades. Alla originalrader i 65 tabeller, kolumner, övrig struktur, rättigheter och tidigare migrationsjournal bevarades; transaktionscommit och lokala migrationsfiler är verifierade.

3012 kör produktrevision `a34dd199a96a1c24448c1c6ad8a688da4b91949a`, exakt samma 204 filer som slutprovet. Artefaktens SHA-256 är `3f1f98e8a05711435291ef82162cd0daed6107376057225337cad215b5d3ea7f`. Byte från föregående verifierade c8f3256 gjordes med bevarad återställningskopia. Faktisk läsande OIDC/MFA efter bytet gav `canCreateEducation=true`, exakt en skola motsvarande det aktuella rektorsuppdraget och fortsatt läsning av klasser/namngivna timplaner. 62 verksamhetstabeller är oförändrade. Provets nya app-/GoTrue-session städades; äldre sessioner, audit och verksamhetsdata bevarades. Hälsokontrollen visar workerd och skolplattform_worker.

## Avvikelser under arbetet

- Tidiga SQL-prover rättades för testets felaktiga statusnamn och mandatfält; slutmatrisen ersätter inte de sparade misslyckade försöken.
- De första två faktiska browserkörningarna nådde skapande/kopiering men stoppade på WebKit-fel när testet navigerade innan sessionsvyn var färdig. Testet väntar nu på inloggad arbetsyta före sidbytet; ingen feltext filtreras bort.
- Tredje körningens 23 funktionella kontroller passerade, men bygget avvisades vid bildgranskning eftersom CSS-verktyget inte hittade alla klasser under den ignorerade byggkatalogen. Samma oförändrade produktkällor byggdes därefter utanför den katalogen. Fjärde körningen på detta bygge passerade hela matrisen inklusive CSS-kontroller och bildgranskning. Endast det fjärde bygget levererades.

## Spårbarhet och kvarstående gränser

ADMIN-02 (skapande/huvudmannabeslut), ADMIN-03 (kullkopiering), PLANERING-01 (vald egen skola) och ADMIN-04 (bevarade klasskopplingar) får avgränsade delbevis i fas 5. [Kontextens SS 12000-avstämning](05-RECTOR-PROGRAMPLAN-CONTEXT.md) gäller SS 12000:2024/OpenAPI 2.1.0: interna planobjekt, stabila organisations-/klassrelationer och skrivansvar bevaras. Ingen extern standardanslutning eller verklig kommunintegration har provats. Historiska 88/100 planer och 3/8 faser samt övriga öppna fasgap ändras inte.

Privata rårapporter finns under `/private/tmp/`; endast filnamn och kontrollsummor dokumenteras här. Hemligheter och råa identitets-/sessionjournaler versionshanteras inte.

| Rapport | SHA-256 |
| --- | --- |
| `rector-programplan-sql-final.json` | `102157e0e1b7352e6e0ffef00bdac2bf8ac13a7f8da6320d912b4a2084dcd46d` |
| `rector-actual-fourth.json` | `b3ec5bd0dace9065ebd9dac68d2b2ced8da3a25778c83f5a5aab4f3b8e7ff53b` |
| `rector-install-verify.json` | `6fdd59477daba024eb3c79b82c2d85cb03a0fd5f0991b846ed6f77a094f77f23` |
| `rector-install-apply.json` | `55d2433190ba0cd9e780c7947a5941f68bcde2e928da3e20fe3ef92a08b633d8` |
| `rector-delivery-verify.json` | `4a475225f8dbb225f9ad98bf9a555a6e67f1037bbc7733138406d34ca63a2c1d` |
| `rector-delivery-apply.json` | `b560d1050a0014ee9b0dd8f1759369043da5ad55a5d2a2422b50247be3b86ed6` |
