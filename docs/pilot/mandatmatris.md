# Mandatmatris för syntetiska prov, version synthetic-v1

Detta är ett tekniskt provkontrakt för fas 3, inte kundens godkända driftpolicy. Verklig profil är okonfigurerad och nekar. Profilen får endast användas i verifierat lokalt protected-mål. Inga journaler eller verkliga elevuppgifter ingår.

## Beslut och provförslag

Användarbeslut: huvudmannen utser rektor; rektor tilldelar lärare inom eget mandat. Lärare har egna undervisnings-/mentorsgrupper, skoladministratörer tilldelade skolor. Huvudmannens organisationsöversikt ger inte elevinsyn. Elevhälsa får uttrycklig skol-, elev- eller ärendeomfattning; teammedlemskap ger inga rättigheter. Rektor tilldelar elevhälsa inom sin skola; särskilt utsedd elevhälsoansvarig får tilldela över sin uttryckliga skolmängd. Ingen får utöka eget mandat. IT sköter anslutningar utan elevdata. Separat support kräver tidsgräns, skola, syfte och rektorsgodkännande. Obligatorisk loggning ska stoppa skyddad åtgärd vid fel.

Följande konkreta åtgärder, fält och 60-minutersgräns är provförslag från 03-RESEARCH, inte beslut om verklig användning. Vem som utser elevhälsoansvarig, professionernas verkliga rättigheter, supportgränser och lagringstid kvarstår som kundbeslut. Profession är metadata utan extra rättigheter. Elevhälsoansvarig förseedas; ingen publik utnämningsväg ingår.

## Matris

Alla rader kräver samma kund och huvudman, aktivt medlemskap, valt giltigt uppdrag och giltig överordnad kedja. Ingen union mellan användarens uppdrag. Okända rättigheter, fält och scope nekas. Basfält är `id`, `display_name`, `unit_id`, `group_ids`; bara uttryckligen begärda tillåtna fält lämnas.

| Funktion | Åtgärder | Fält | Relation | Delegation/avslut |
|---|---|---|---|---|
| huvudman | organization.read | id, display_name | uttryckliga skolor inom huvudman | rektor |
| rektor | pupil.read | basfält | tilldelad skola | lärare, skoladmin, elevhälsa, support |
| administrator | pupil.read, pupil.export | basfält | tilldelad skola | ingen |
| larare | pupil.read | basfält | undervisnings-/mentorsgrupp inom skola | ingen |
| elevhalsa | pupil.read | basfält | uttrycklig skola ELLER elev ELLER exakt ärende + dess elev | ingen |
| elevhalsoansvarig | mandate.grant, mandate.revoke | inga elevfält | uttryckliga skolor | elevhälsa |
| it | connection.read/enable/pause/test | enabled, version | tilldelad skola | ingen |
| support | pupil.read | basfält | exakt en elev inom exakt en skola | ingen |
| kundadmin | mandate.grant, mandate.revoke | inga elevfält | egen kund och huvudman, inom egen skolmängd | kundadmin, granskare; separat kontoadministration |
| granskare | audit.read | event_id, action, occurred_at, outcome, assignment_id | egen kund och huvudman | ingen |

Support kräver `purposeCode=synthetic-troubleshooting`, rektor som överordnad/godkännare, explicit elev samt `[startsAt, endsAt)` om högst 60 minuter. Varken export, skrivning eller delegation tillåts. IT:s test gäller lokal konfiguration, inte kommunanslutning. Ärendemandat ger inte andra ärenden för samma elev.

## Indata och ansvar mellan modell, server och SQL

`decideMandate({assignment, ancestors, profileId, verifiedLocalTarget, serverNow, request})` ger `{allowed, reasonCode, assignmentId, allowedFields}`. Alla uppdrag, relationer, kund-/huvudmannakopplingar, resursens skol-/grupp-/elev-/ärende-ID och tid måste hämtas av servern i aktuell transaktion. Indata är typade interna värden, aldrig klientens behörighetspåståenden. Profilflaggan är serverkonfiguration och ersätter inte målskydd.

Modellen prövar ett objekt per beslut. Listning/export måste filtreras i SQL före antal, paginering och svar; `group_ids` måste även begränsas till tillåtna grupper för gruppavgränsade uppdrag. Beslutet öppnar ingen dataväg och utför ingen loggning. SQL/server måste skydda hela transaktionen, kontrollera identitets-/personalbindning, främmande nycklar och loggcommit innan svar. Klientroll är ingen parameter.

Datum är inkluderande i Europe/Stockholm; tidsintervall är halvöppna och skärs med datumen. Överordnad kedja prövas vid varje anrop, även efter försvagat mandat; saknad förälder och cykel nekar. Barnets kund, huvudman, skolor och hela giltighet måste rymmas inom tilldelarens. `identityId` förhindrar självutökning även via andra medlemskap. Framtida uppdrag får utfärdas, men kan inte användas före start. Avslut använder samma delegationsgräns.

## Namngivna acceptansfall

Testnamnen i `web/lib/mandate-policy.test.mjs` är det körbara kontraktet för SQL-/serverproven. Huvudgrupper: `principal-school`, `principal-teacher`, `principal-revoke`, `head-principal`, `teacher-group`, `teacher-mentor`, `school-admin-export`, `health-school`, `health-pupil`, `health-case`, `health-lead-multischool`, `principal-support`, `it-admin-*`, `support-boundary-*`.

Negativa grupper: `unknown-action`, `foreign-customer`, `foreign-organizer`, `foreign-school`, `empty-school`, `upcoming`, `ended`, `expired`, `blocked-membership`, `foreign-field`, `unknown-scope`, `teacher-empty`, `teacher-foreign-group`, `health-pupil-other`, `health-case-no-context`, `health-case-other-pupil`, `self-escalation`, `head-teacher`, `principal-principal`, `grant-foreign-school`, `grant-longer-time`, `no-public-health-lead`, `support-too-long`, `support-no-purpose`, `support-no-approval`, `support-no-*`, `real-profile`, `unverified-target`, `parent-revoked`, `parent-weakened`, `parent-missing`, `parent-cycle`, `no-union-of-assignments`.

Modellproven är endast deterministiska syntetiska prov. SQL, API, loggning, dator/telefon och verklig kundanslutning är separata verifieringar i senare planer.
