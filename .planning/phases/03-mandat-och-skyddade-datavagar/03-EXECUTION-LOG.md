# Fas 3 — genomförandelogg

## 2026-09-23

- Användaren begärde gsd-execute-phase 3 med högst tio procentenheter av veckokvoten. Startvärde 18 %, stopp före 28 % med marginal för avrundning. Mätaren är kontogemensam.
- Planerna genomförs sekventiellt enligt beroenden; 03-01 inledd med executor.
- Lokalt protected-mål verifierat via verify-target: skolplattform-pilot-protected på loopback. Inga fjärrmål används.
- Före ändringar kördes befintliga SQL-prov: 3 filer, 137 tester, PASS. Detta är baslinjebevis, inte fas 3-verifiering.
- Plan 03-07 korrigerad efter användarens senare Docusaurus-beslut: handboken omfattar användarinstruktioner och regler; tekniska kontrakt/resultat stannar i docs/pilot.
- 03-01 genomförd: 91 policyprov, typkontroll och riktad lint passerar. Kundadmin/granskare med organizerId=null rättades vid oberoende genomläsning. Modellen är ännu inte inkopplad i server/databas. Se 03-01-SUMMARY.md.
- Efter 03-01 kördes hela modellsviten: 259 PASS, 0 FAIL.
- 03-02 delvis genomförd: stängd schemagrund och intern verksamhetskedja. Tre separata migrationer tillämpade i lokalt protected-mål utan reset. 185 nya SQL-prov PASS; hela SQL-sviten 322 PASS. Resultat i phase3-sql-mandates.json och phase3-schema-regression.json. Ingen API-/browserverifiering och ingen ny användaråtkomst.
- Slutmätare 26 % (start18; cirka8 procentenheter). Paus vid verifierad delgräns med marginal före28. Återstående samordnade mutations-/serverbyte startas inte inom återstående lilla marginal. 1/7 planer komplett, 03-02 PARTIAL. Se .continue-here.md. Ingen fas3-kravstatus ändrad till verifierad.

## Fortsättning till högst 30 %

- Ny användarbudget: stoppgräns30 %, mätare27 % vid start av fortsättningen.
- Ny12:00-migration för explicit personal–medlemskapsbindning och separat intern kontroll av rektor/lärare, aktiv medlem, roll och skolor. Inga app-/klienträttigheter öppnas; ingen identitetsmatchning på namn/e-post.
- 28 ytterligare SQL-prov passerar: 213 fas3-prov, 350 totalt inklusive137 tidigare. Ingen reset. 03-02 förblir PARTIAL; nästa migration efter20260922120000. Full mutations-/inbjudnings-/serverkoppling och objektpolicy återstår.

## 2026-09-26 — fortsättning till fasens slut eller checkpoint

- Användaren valde: kör tills fas 3 är klar eller en checkpoint nås. Veckomätare 25 % vid start (nytt veckofönster), 5-timmarsfönster 13 %. Extra användning avstängd och månadsgräns nådd — kvottak stoppar agenter tvärt; mätaren kontrolleras mellan planerna.
- Återskapad provmiljö bekräftad: etableringen 2026-09-24 slutförd (protected-målet 24 migrationer, IdP uppe, ingen pågående etablering). Gamla testresultat gäller föregående miljö och återanvänds inte.
- Ordning: 03-04 (auditkällor på nya stacken) → 03-05 (återstående arbetsyta och riktig verifiering) → 03-06 → 03-07 (användarprov, checkpoint).
- 03-04 slutförd (executor, huvudkatalogen, master). Kong-reload-kapplöpning upptäckt och rättad; Storage korrelerad via Kong-tvingad X-Client-Trace-Id; Postgres-loggprefix lokalt via ALTER SYSTEM. `collect-denials.mjs --probe --outage storage,kong,db` PASS (local-synthetic-only), alla 10 SQL-filer PASS efter omstarterna, 277 modell-/serverprov, tsc och lint PASS. Commits ec47457, 5cff981, 862ebb3. Worker-API-prov ej omkörda på nya stacken (03-06). Nästa: 03-05.
- 03-05 slutförd (executor, huvudkatalogen, master). Tilldelningsformulär med behörigt urval, syntetiskt elevprov och distinkt `audit_unavailable`. Elevläsningen öppnades för Workern (migration 20260926100000) först efter att `verify-access --case phase3-pupils` gett 27/27 PASS: committad händelse per läsform, och loggfel ger inget innehåll. Två fel hittades och rättades: `uuid[]` som sträng och utgångna mandat listade som giltiga (migration 20260926110000). SQL 10 filer PASS (540 prov), 281 modell-/serverprov, tsc och lint PASS. Protected-bygget är från 2c27916. Browserprov med riktig OIDC gav 18/18 PASS på dator och iPhone 13. Den byggda previewn är omstartad på localhost:3000. Commits: 86e6550, 13f3a36, 6608317, 2c27916 och 7dcd1cd. Nästa steg är 03-06.
- 03-06 genomförd (executor, huvudkatalogen, master).
  - **API-prov:** `verify-mandates.mjs` gav 25/25 PASS mot byggd Worker på återskapad stack. Proven omfattar nekandeflod, loggfelsinjektion, källavbrott, direktvägar och gamla RPC:er. Access-regressionen gav 16/16. Sessionsbevisen mintas lokalt, så ingen verklig IdP är prövad.
  - **Grinden:** `verify:phase3` med färskhetskontroll och 12 enhetsprov. Första grindkörningen fick SQL-fel av kvarlämnade inbjudningar från access-provet och rester av `.dev.vars`-lås. Båda rättades (c7a113d).
  - **Andra grindkörningen:** FAIL. Alla sex krav BLOCKED, eftersom mandatbrowsern saknas och baseline, port 5192 och fas 2-OTP inte är klara.
  - **Commits:** 6a730c3, 93296ec, c7a113d, 440bcb0.
  - **Nästa:** 03-07.
- 03-07 uppgift 1 är genomförd (executor, huvudkatalogen, master). Planen står vid den blockerande användarcheckpointen.
  - **OTP:** fas 2:s OTP-fel berodde på en TOTP-uppgift för `anna.admin` som inte matchade den sparade hemligheten. Rättat med fixturen `phase2-otp-fixtures.mjs`, som ingår i grinden. MFA-kravet är oförändrat.
  - **Mandatspec:** 12 flöden × 3 projekt = 36 PASS.
  - **Rättade UI-fel:** dialogfokus, loggvyns svarsordning och hängande sessionskontroll.
  - **Handboken:** mandat, användning, säkerhetslogg och regler är uppdaterade. Status står som byggt och automatiskt prövat.
  - **Färsk grind:** PASS på 7d4ec8d, med alla sex krav PASS (lokalt och syntetiskt).
  - **Commits:** 7b10da7, 2cf7f38, e243b4a, 7d4ec8d, 0338c7c.
  - **Väntar på:** användarens bedömning.
