# Fas 5 — valideringskarta

Status 2026-09-29: startunderlag granskat, implementation och fasverifiering återstår. Kravstatus ändras inte av denna karta.

| Krav | Positivt användarbeteende | Negativa och återställande prov | Slutligt bevis |
| --- | --- | --- | --- |
| ADMIN-01 | Huvudman importerar skola via kod/orgnummer, omläser adress/skolform; uppdatering bevarar lokal rektor. | Annan kund/skola, återkallat mandat, förfalskad klientroll, fel under import/audit; rektorsmandat och data oförändrade. | Lokal SQL/API + dator/telefon + handbok; verkligt källuppslag redovisas separat från stub. Väntar. |
| ADMIN-02 | Gymnasieutbildning, kurs/nivå, utkast/förslag/beslut följer befintliga regler och består efter inloggning. | Låst version, ogiltigt katalogval/ram, obehörigt beslut, samtidig revision, audit-/delskrivningsfel. | Modeller + lokal SQL/API + browser + handbok. Väntar. |
| ADMIN-03 | Huvudman kopierar till senare kull och får egna utkast med nya ID:n. | Tidigare/ogiltigt år, dubbla samtidiga kopior, annan kund/skola, avbrott; inga kopierade elever/klasser/beslut/tillstånd. | Lokal atomär SQL/API, negativa identiteter och browser. Väntar. |
| ADMIN-04 | Beständig klass kopplas till exakt fastställd timplan/läsår/kolumn; ny version lämnar gamla kopplingen kvar. | Annan skola, fel kolumn, ej fastställd ny koppling, tvetydig backfill, omvänd sparordning, ny objekts-ID, konflikt och loggfel. | Modeller + schemaavstämning + SQL/API + browser/läsårsunderlag. Väntar. |

## Genomförda startprov

Se `05-CURRENT-EVIDENCE.md`: 30/30 befintliga modellprov PASS; båda äldre sparordnings-/ID-prov FAIL. Den syntetiska transporten är inget API- eller databasbevis. Inga ADMIN-krav är genomförda eller verifierade här.

## Kontroller per avgränsad implementation

1. Rena modell-/serverkontrakt och riktade samtidighetsprov.
2. Nya migrations-/policy-/grant-prov mot endast assertTarget-skyddat syntetiskt mål. Kontrollera oförändrade data efter nekade eller felande anrop.
3. Positiva och negativa API-prov med separata kunder/skolor/uppdrag, återkallelse, MFA där befintlig policy kräver och auditbortfall.
4. Byggd skyddad app, dator och telefonvy, verklig servertransport; tangentbord, sparläge, konflikt och ny inloggning. Enhetsläge anges som sådant, ingen påhittad fysisk telefon.
5. Relevant typ/lint/bygge och handboksbygge efter användarbeteendeändring. Separat syntetisk baslinje bevarar uppskattade äldre flöden.

Fas 5 behöver en fail-closed kravgrind som kräver alla obligatoriska steg, ingen grön status vid saknade mål, skip eller inaktuell kodfingerprint. Den bevarar fas 4:s negativa säkerhetsvägar men ersätter inte fas 4:s kvarstående mänskliga checkpoint/fasverifiering. Exakta kommandon och rapportnamn fastställs i respektive ännu återstående genomförandeplan; denna karta är inte en körd grind.

## Föreslagna framtida provfiler — ännu inte skapade

- `web/lib/server/education-planning.test.mjs`: kommandovalidering, roll-/skolgräns, revisionskonflikt och minimerad audit.
- `supabase/tests/phase5_planning.sql`: positiva mandat samt nekad annan kund/skola, utgånget/återkallat mandat, klientrollsförfalskning och rollback vid logg-/delskrivningsfel för samtliga fyra krav.
- `work/pilot/verify-phase5-api.mjs`: samma matris via verklig lokal server, samtidiga kommandon och oförändrade rader efter nekande.
- `web/lib/planning-save-order.test.mjs`: senaste lokala avsikt, inaktuella svar och server-ID efter skapande.
- `web/e2e/phase5-planning.spec.ts`: dator/telefon/tangentbord, skolval, omläsning/ny inloggning, kopiering och versionbunden klasskoppling.
- `web/scripts/verify-phase5.mjs`: obligatorisk kravgrind utan skip-väg till PASS.

Namnen är planeringsförslag, inte befintliga körbara tester. Nästa genomförandeplan ska bekräfta eller precisera dem innan implementation.


## Delbevis 05-03 — 2026-09-30

Stängd timplans-SQL på 8c91a22: PASS 77/77; två riktiga anslutningar/låsväntan PASS 4/4; mandat 243/243, audit 19/19, registerkonflikt 19/19 och timplansmodell 14/14 PASS. Se 05-03-SUMMARY. Intern DB-audit har session_id=NULL; session/API/nekandeaudit och exakt Worker-grant hör till 05-04. Vald rad/kolumnbredd verifierad, inte full matris/totalram eller gymnasiets programplansgrund. Äldre fastställt beslut och klasskoppling bevarade i syntetisk fixtur. ADMIN-kraven och fas 4:s slutverifiering fortsatt öppna.
