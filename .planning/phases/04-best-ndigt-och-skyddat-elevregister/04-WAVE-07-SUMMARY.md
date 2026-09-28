---
phase: 04
wave: 7
status: complete
completed_plans: [04-10, 04-14]
next_plans: [04-13, 04-15]
---

# Fas 4 — våg 7

Vågen öppnar skyddade serverrutter för ändring, personnummervisning och export (04-10) och portar första delen av de äldre fas 3-SQL-proven till det beständiga elevregistret (04-14). Allt är lokalt och bygger på syntetiska uppgifter. Inga krav är markerade som slutverifierade.

## Verifierat

- Modell- och serversvit efter vågen: 383/383 PASS. `tsc --noEmit` och `oxlint app lib` PASS. Appbygget passerade i 04-10, och de tre nya rutterna finns i routelistan. 04-14 ändrade bara SQL-prov.
- 04-10: `POST /api/elever/andra`, `/personnummer` och `/export` kräver same-origin och administratör. MFA krävs för ändring, personnummer och nedladdning. Förhandsvisningen lämnar bara antal. Nedladdningen hålls i minnet tills loggen är committad. Proven körs mot en simulerad databas- och sessionsgräns.
- 04-14: `phase3_mandates` 279/279, `phase3_matrix` 56/56, `phase3_policy` 105/105 och `phase3_temporal` 34/34 PASS mot det målskyddade lokala protected-målet i en rollbacktransaktion. Full regression: 1081 passerade assertions, mot 607 före vågen.

## Kvarstår

- **Körrätt för Worker:** `phase4_change_pupil`, `phase4_resolve_source`, `phase4_reveal_personal_number` och `phase4_export_pupils` är fortfarande stängda för Worker. Mot den lokala databasen svarar de nya rutterna därför 403, och verklig användning fungerar inte ännu. För att öppna dem krävs en avgränsad grant-migration, uppdaterade ACL-assertioner i `phase4_periods`/`phase4_export`/`phase4_register` och ett verkligt prov med Worker, OIDC och PostgreSQL. Detta blockerar browserprovet i 04-13 och E2E i 04-16 och måste tilldelas en plan.
- `phase3_boundaries` och `phase3_connections` avbryts fortfarande med `Case school scope denied`. Portningen ägs av 04-15. Den fullständiga SQL-grinden är fortfarande röd.
- Två avsiktliga kontraktsändringar i 04-14, beskrivna i 04-14-SUMMARY: den gamla läsaren `phase3_read_pupils` förväntas nu vara stängd för Worker, och gruppfiltreringsfallet använder en tidigare klassperiod eftersom en elev bara kan tillhöra en klass åt gången.
- 04-13 behöver spegla exportkroppens form i klientmodellen.
- `state.advance-plan` och `roadmap.update-plan-progress` kunde inte hantera STATE.md och ROADMAP.md, så filerna rättades för hand.

## Nästa steg

Fas 4 har 13 av 22 planer genomförda. Våg 8 är 04-13 (elevkortets anslutning och ändringsdialoger) och 04-15 (resterande äldre SQL-prov).
