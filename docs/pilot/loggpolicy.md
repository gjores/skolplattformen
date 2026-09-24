# Loggpolicy i syntetisk provmiljö

Status 2026-09-24: Worker-del och gallringsfunktion införda. Hela AUDIT-02/03 är inte verifierad; se fasens SUMMARY för faktiska prov och kvarvarande alternativa källor.

## Händelser före svar

Mutationer och läsrutter med `audit: 'required'` måste lämna en säkerhetshändelse i samma databastransaktion. Servern väntar på commit före HTTP-svar. Mandatlistningen använder detta läsläge. Elevläsning/export är fortfarande stängd och måste kopplas till samma kontrakt före öppning. Ett loggfel ger generiskt serverfel utan resultatet; verksamhetsändring rullas tillbaka.

Varje nekande lagras med egen servergenererad korrelation. Den tidigare gränsen med en sammanfattningshändelse efter 20 nekanden används inte längre. Om nekandet inte kan loggas returneras serverfel. Det är inte ett fullständigt överlastskydd; driftens kapacitet och skydd behöver provas separat. Gamla denial_buckets lämnas kvar för historik/kompatibilitet men används inte av Worker-loggningen.

## Innehåll

Händelsen har serveridentitet, vald kund och uppdrag, korrelation, tid, kontrollerad åtgärd, objektreferens och utfall. Detaljer följer slutna värdescheman: rollvärden, UUID-referenser, heltalsantal, booleska indikatorer, kända felkoder och fasta routekategorier. Fri spärrorsak, elevnamn, anteckningar, rå sökning, URL-suffix/query och klientens proof-objekt kastas. MFA-bedömningen läggs till separat från serverns bedömning. Loggen innehåller identifierare som fortfarande kräver åtkomstskydd; minimering gör inte innehållet anonymt.

## Gallring

`audit_retention_policy` väljer kund och profilen synthetic-v1, exakt 30 dygn. Ingen kund aktiveras automatiskt av migrationen. Konfiguration sköts separat av databasoperatören, aldrig via approller. Underhållsrollen är NOLOGIN; endast lokal postgres-operatör har medlemskap.

`purge_synthetic_audit(customer)` tar inga datum eller antal dagar från anroparen. Serverns transaktionstid avgör cutoff. Endast `occurred_at < cutoff` gallras; händelsen exakt vid cutoff bevaras. Underhållsrollen kan anropa funktionen men saknar direkt tabellradering och kan inte ändra policyn. Triggern förbjuder alla uppdateringar och omprövar gränsen vid radering. Kund utan konfiguration nekar. Verklig lagringstid är fortfarande ett öppet kund-/driftbeslut.

## Källor utanför Worker

Direkta REST/RPC/Storage/SQL-vägar förblir stängda. Deras faktiska serverloggar måste ge minimerat, korrelerbart underlag. En testklients egen rapport är inte en källhändelse. Källavbrott, återhämtning och luckor behöver egna bevis; insamlaren måste rapportera BLOCKED om underlag saknas. Asynkron Docker-insamling ersätter inte synkron loggning före elevsvar i en verklig driftmiljö.
