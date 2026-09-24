---
phase: 03-mandat-och-skyddade-datavagar
plan: "04"
status: partial
completed: false
requirements_completed: []
updated: 2026-09-24
---

# 03-04 — obligatorisk loggning och källinsamling, delvis genomförd

## Genomfört och verifierat

- Worker kräver händelse för mutation och för läsrutter med audit=required. Mandatlistning använder detta läsläge. Commit föregår svaret. Elevvägen är fortfarande stängd.
- Alla nekanden får egen beständig händelse och serverkorrelation; den tidigare undertryckningen efter 20 försök är borttagen. Loggfel ger generiskt serverfel.
- Detaljvärden har slutna scheman; tillåtet nyckelnamn räcker inte för att lagra fritext. UUID, strikt ISO-tid, rollvärden, antal och booleska indikatorer bevaras. Fri orsak, klientproof och URL-suffix/query kastas. Serverns MFA-bedömning kvarstår separat.
- Separat NOLOGIN-underhållsroll och purge_synthetic_audit. Endast postgres-operatören kan anta rollen. Ingen vanlig approll får gallra eller ändra policy. Serverberäknad 30-dygnsgräns; exakt cutoff bevaras. Ingen befintlig kund har konfigurerats eller gallrats av migrationen.
- 13 rollback-SQL-prov för gallring/behörigheter PASS. Tidiga prov misslyckades på saknat operatörsmedlemskap och pgTAP-schemarättighet; medlemskapet infördes i ny migration21, testverktygsrättigheten endast i rollbackprovet.
- 277 modell-/serverprov PASS inklusive fem minimeringsprov. Typkontroll, lint och protected-bygge PASS.
- API-regression PASS med verkliga auditfel för läsning, export, nekande och skrivrollback; 30 nekanden ger 30 beständiga händelser och ingen suppression. Beständig händelse innehåller inte inskickad syntetisk fritext. Se senaste phase3-server-access.json för exakt fallantal/revision.

## Faktiska alternativa källor

Commit bbc5ddf inför assertTarget-skyddad Kong-konfiguration, minimerad insamlare och sju enhetstester PASS. Ett verkligt lokalt prov observerade tre Kong-händelser för REST/RPC/Storage. Minimerad Nginx-konfiguration validerades och laddades om. Resultat: work/pilot/results/phase3-denials.json.

**Källrapportens totalstatus är BLOCKED**, inte PASS. Storage-upstream, direkt SQL, individuell provkorrelation samt avbrott/rotation/cursor/återhämtning återstår. Kong-observationer i ett tidsfönster ersätter inte dessa bevis. Se docs/pilot/audit-sources.md och loggpolicy.md. Ingen AUDIT-02/03-verifiering eller verklig driftgodkännande hävdas.

## Beroenden och avvikelser

Worker-/gallringsdelen implementerades medan databasens slutmatris verifierades; ingen elevläsning öppnades. Migrationerna använder nya tidsstämplar20/21 efter redan tillämpad cutover19, inte planens historiska exempelfilnamn. Docusaurus ändrades inte; intern teknikdokumentation ligger i docs/pilot.

Nästa steg: komplettera kvarvarande källor och avbrottsprov. Därefter arbetsyta05 och samlad grind06/07. Grinden ska förbli röd när källunderlag saknas.

Commits: db8a894 (gallring), 707fbb1 (Worker), bbc5ddf (Kong-del).
