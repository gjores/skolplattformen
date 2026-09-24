# Förberedande observationer inför 03-04

2026-09-24. Läsande inventering av lokalt syntetiskt protected-mål. Detta är **inte** verifierad auditkapacitet eller godkänd driftkonfiguration.

Kong 2.8.1 använder vanlig accesslogg; den är inte ett fast minimerat händelsekontrakt. Storage 1.41.8 skriver JSON men har även potentiellt känsliga request-/resurs-/felfält som inte får kopieras brett. Ett reqId är inte i sig bevisat serverhärlett. Postgres 17.6.1.095:s observerade filinställningar saknar sessionsidentifierare och SQLSTATE i loggprefix; effektiva inställningar måste fortfarande kontrolleras i databasen. Docker använder json-file.

Nästa prov ska fastställa minimal struktur, serverhärledd korrelation och förlustdetektion. För gateway: pröva genererat request-id och fasta kategorier (rest/rpc/storage/other) utan URL eller query. För Postgres: pröva minimerat prefix med tid/process/session/rad/användare/SQLSTATE och stäng parameter-/statementinnehåll; verifiera hur SET ROLE syns. Kontrollera både stdout/stderr, rotation och avbruten insamling. Konfigurationsändringarnas genomslag och avsiktliga fel måste verifieras, inte antas från produktversioner.

Ingen sådan konfiguration ändrades här. Elevläsningsvägen förblir stängd i väntan på fullständiga bevis.
