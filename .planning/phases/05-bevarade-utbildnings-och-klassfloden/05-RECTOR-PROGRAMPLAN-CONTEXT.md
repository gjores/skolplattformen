---
phase: 05-bevarade-utbildnings-och-klassfloden
package: RECTOR-PROGRAMPLAN
status: approved_for_implementation
date: 2026-10-16
---

# Rektor skapar programplaner för sin skola

## Beslut och mål

Användarens uttryckliga beställning 2026-10-16: ”Ja rektor ska kunna skapa programplaner och kopiera till nästa kull för sin skola. Huvudmannen ska fortfarande godkänna dem. Fixa det.” Detta beslutar ändringen; tidigare avgränsningar till huvudman ersätts för just skapande och kopiering. Inga ytterligare verksamhetsval eller godkännandefrågor behövs inför genomförandet.

Rektor ska i sitt aktuella skoluppdrag kunna skapa en utbildning med ett första programplansutkast, samt kopiera en läsbar programplan till nästa elevkull på den aktiva egna skolan. Nytt och kopierat innehåll är utkast. Rektor skickar planen för beslut; huvudmannen fastställer den enligt befintliga regler. Huvudmannens befintliga skapande, kopiering och beslutsmöjligheter består.

## Avgränsning

- Gymnasiets befintliga skyddade programplansflöde utökas. Skapandet gäller de Gy25-underlag som redan stöds; ingen ny programtyp, katalog eller extern anslutning ingår.
- Skoluppdrag verifieras av server och databas vid varje skrivning, statusläsning och återförsök. Klientens roll, gamla svar och vald URL är inte mandat.
- En rektorskopia tillhör endast den aktiva egna skolan. Om en gemensam ram har en annan ursprungsskola kan rektor kopiera den när ramen faktiskt är kopplad till den egna valda skolan. Övriga skolkopplingar följer inte med rektorskopian. Originalets gemensamma skolval ändras aldrig. Huvudmannens kopia behåller tidigare beteende med originalets skolval.
- Rektors nya skapanderätt ger inte rätt att ändra gemensamma skolval, utbildningsmetadata, arkivera, radera eller fastställa. Befintlig rätt att redigera framtida utkast inom hela ramens skolmandat består.
- Kopian behåller underlag, programfördjupning och terminsfördelning. Den får nya stabila utbildnings-/plan-ID:n, ny elevkull, framtida start och eget beslut. Elever, klasser, timplaner, klasskopplingar, skolornas paketval och tidigare beslut kopieras inte.
- Datumregler, versionskontroll, lås, obligatorisk audit, MFA, CSRF, kvitton och återhämtning efter borttappat svar bevaras.
- Den redan godkända användbarhetsleveransen och övriga fasgap förblir historik. Paketet innebär inte full fasacceptans eller omräkning av historiska 88/100 planer och 3/8 faser.

## Färsk kodkontroll

Kodbaskartorna i `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md` och `TESTING.md` är lästa men beskriver septemberläget; dagens skyddade Worker-/API-kod är styrande. Ingen ny extern teknik krävs (discovery nivå 0).

1. `phase5_programplan_selection` returnerar `canCreateEducation` endast för huvudman. `phase5_create_programplan_education` och `phase5_programplan_education_status` gör egna huvudmannakontroller och anropar `phase5_programplan_unit(...,true)`. Senaste installerade definition ska verifieras mot migrationskedjan, inklusive senare form- och klassdatumändringar; den nya `20261016100000_rector_programplan_creation.sql` utgår från faktiskt installerad definition hämtad med `pg_get_functiondef`.
2. `phase5_programplan_organisation_actor` i `20261004130000_phase5_programplan_units.sql` kräver huvudman för alla skyddade organisationshändelser och stämplar rollen huvudman. Endast skapandehändelsens rollvillkor ska utökas; den verkliga aktörsrollen måste sparas.
3. `20261014100000_phase5_atomic_cohort_copy.sql` spärrar rektor i både kopiering och audit. Funktionen kräver dessutom att begärd skola är originalets ursprungsskola och att alla originalets skolor finns i mandatet. Rektors egen skolkopia behöver en avgränsad gren som inte kopierar andra skolor. Befintligt lås-/CAS-/kvittoflöde ska bevaras.
4. API-rutterna för `utbildning/skapa`, `utbildning/status`, `utbildning/kopiera` och `utbildning/kopiera/status` tillåter bara huvudman. Val-rutten kan redan läsas av rektor; serveradaptrarna använder SQL:s `canCreateEducation`.
5. `protected-programplan-workspace.tsx` har en separat huvudmannaspärr i `saveCopy` och skickar `workspace.education.unitId` även när en annan kopplad skola är aktiv. Listknappen styrs däremot redan av serverns skapandeförmåga. `protected-programplan-flow.tsx` och handboken beskriver huvudmannens exklusiva skapande.
6. `SchoolsDialog` använder också `canCreateEducation` som kontroll. Att utöka flaggan får inte utöka skolvalsmandatet: synlighet och serverns livscykelkommando måste fortfarande kräva huvudman.

## SS 12000

Befintlig dokumenterad referens används: **SS 12000:2024, OpenAPI-dokument 2.1.0**, enligt `05-CLASS-COHORT-SS12000.md` (kontrollerad 2026-10-15). Paketet ändrar interna skrivmandat och skapar interna utbildnings-/programplansobjekt; ingen ändring av standardens externa objekt eller kontrakt föreslås.

| Berörd information | Hantering |
| --- | --- |
| Skolenhet och organisation | Befintliga stabila ID:n, externa ID:n och kund-/organisationsrelationer bevaras. OrganisationReference-mappningen från tidigare avstämning består. |
| Intern utbildning, elevkull och programplansversion | Ingen direkt extern standardmotsvarighet antas. Kopian får egna interna ID:n och självständig beslutshistorik. |
| Klasser, medlemskap, giltighet och elevplaceringar | Group/GroupMembership-mappning och datum består. Dessa objekt kopieras eller flyttas inte. |
| Källa och skrivansvar | Programunderlagets källa bevaras; skapande och kopiering auditeras med faktisk identitet och aktuellt rektorsuppdrag. Beslutsansvaret stannar hos huvudmannen. |

Verifiera att egen skolkopia inte ändrar originalets organisation, skolkopplingar, klass-ID:n, medlemskap, giltighet, externa ID:n eller timplansrelationer. Ingen verklig SS 12000-anslutning eller standardcertifiering följer av dessa interna prov.

## Leverans och bevis

Genomförande följer `05-RECTOR-PROGRAMPLAN-PLAN.md`. Testa verklig SQL och skyddat HTTP/OIDC-flöde med syntetiska data, samt dator och telefon. Skilj simulerade route-/UI-prov från verkliga körningar. Installera endast verifierad lokal migration och exakt provad app på 3012, med bevarandekontroll och återställbar app. Bygg aldrig över den aktiva `web/dist-protected`-artefakten. Spara konkret verifiering och avgränsad slutredovisning; användarens tidigare godkännanden ska inte behöva upprepas.
