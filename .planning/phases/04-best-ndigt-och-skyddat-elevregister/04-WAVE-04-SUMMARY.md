---
phase: 04
wave: 4
status: complete
full_sql_status: fail
completed_plans: [04-04, 04-11]
next_plans: [04-05, 04-09]
---

# Fas 4 — våg 4

Registerurval, anonymisering, historik och export har fått serverstyrd databasprojektion. Huvudmannen kan ge och återkalla skolbunden skyddsbehörighet genom ett auditerat API och en prövad dialog. Se 04-04-SUMMARY och 04-11-SUMMARY för kravspårning och kontrakt.

## Verifierat

- 140/140 SQL-prov för registerprojektion och skyddsbehörighet samt 20/20 exportprov PASS. Kandidaten prövades först i rollback, sedan efter permanent lokal migration. Migration 131 öppnar exakt tre behörighetsfunktioner; migration 140 lämnar nya registerläsningar stängda för Worker.
- 357/357 modell-/serverprov PASS. Typkontroll, lint och skyddat appbygge PASS efter relevanta ändringar.
- Åtta verkliga OIDC-/Worker-/databasfall PASS i Chromium och WebKit: logg före svar, rollback av både tilldelning och återkallelse vid framkallat loggfel, utgånget MFA-bevis, fel ursprung, klientvald aktör samt rektor/administratör utan tilldelningsrätt.
- Dialogens två slutliga UI-fall PASS: dator 13,4 s och telefon 9,4 s. Tilldelning/återkallelse, fokus, bevarade val, osparad bekräftelse, 44 px pekytor och layout prövade. Skärmbilder granskade. MFA-felets presentation simuleras i UI-fallet; backendens MFA-nekande provas separat med faktisk utgången testsession. Inga verkliga elevuppgifter ingår.
- Första browserkörningens dialogfel rättades med uttryckliga tillgänglighetsreferenser. Därefter rättades provets rullisteväljare till roll och beräknat namn. Slutligt PASS bygger på åtta backendfall och två riktade UI-omprov, inte en påstådd obruten grön tiotestskörning.
- Handboken beskriver skyddsbehörigheten och att elevläsning ännu är stängd. `npm run docs:build` PASS. Ingen publicering.

## Full SQL-regression är fortfarande röd

Alla 14 filer kördes. 454 assertions passerade, men sex äldre fas 3-fixturer avbröts före assertions med `Case school scope denied`: phase3_boundaries, phase3_connections, phase3_mandates, phase3_matrix, phase3_policy och phase3_temporal. Detta är samma tidigare redovisade behov av portning till beständiga registerrelationer. Ägare är 04-14/15. Inga filer hoppades över eller räknades som godkända; full fasgrind är inte PASS.

Minimerade rapporter finns lokalt i `work/pilot/results/phase4-projection.json`, `phase4-export.json`, `phase4-wave4-full-sql.json`, `phase4-permission-first-run.json` och `phase4-permission-desktop-ui.json`. Telefonens slutrapport finns i `web/test-results/phase4-permissions.json`. Tillfälliga ACL, loggfel och sessionsändringar återställdes; alla databasprov kördes seriellt efter målskydd. Ingen databasreset eller verklig anslutning användes.

## Nästa steg

Våg 5 omfattar 04-05 (atomiska ändringar, datumregler och konflikter) samt 04-09 (auditerade läs-API:er). Kommunperiodens ursprung är `null` när historiskt bevis saknas; 04-05 har preciserats så nya ändringar skriver stabila period-ID och datum i samma historiktransaktion. Registergränssnitt, samlade användarprov och slutlig fasverifiering återstår. Sju av fasens 22 planer är genomförda; inga nya krav markeras slutverifierade och ingen verklig drift godkänns.
