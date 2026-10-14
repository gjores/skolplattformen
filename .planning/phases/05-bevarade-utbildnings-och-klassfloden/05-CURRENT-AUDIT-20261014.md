---
phase: 05-bevarade-utbildnings-och-klassfloden
reviewed: 2026-10-14
status: gaps_found
verification_level: current-source-and-existing-evidence-review
requirements: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, PLANERING-01, PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
---

# Fas 5: aktuella leveranser och verkliga luckor

Genomgången utgår från användarens godkända krav och uppdrag 2026-10-14 att fortsätta till nästa konkreta användarprov. Aktuell källrevision före rättningen är `64c0d6c`. Root och en oberoende GSD-verifierare har jämfört faktisk skyddad kod med fasens mål och senare beslut. Den oberoende genomgången var läsande: inga nya tester eller databasändringar följer av den i sig.

## Kravspårning

| Krav | Vad som faktiskt finns | Återstående arbete |
| --- | --- | --- |
| ADMIN-01 | Kundadministratören har ny skolimport via kod. Offentligt organisationsnummeruppslag finns. | **Verklig implementationslucka:** huvudmannen saknar skyddad import via kod/organisationsnummer och uppdatering av befintlig skola som bevarar tillsatt rektor. Egen avgränsad plan krävs. |
| ADMIN-02 | Stödda nationella Gy25-program har skapande, nivå-/fördjupningsarbete, terminer och beslutskedja. [Användarprov av beslut](05-DECISION-FLOW-USER-TRIAL.md) godkänt 2026-10-12. | Samlad krav-/fasbedömning återstår; senare yrkesprovs-/individuella studieplansfunktioner är egna gränser. |
| ADMIN-03 | Verklig kopia till ny utbildning/elevkull finns. Ram, terminer och skolor ingår; skolpaketsval ska enligt senare beslut inte kopieras. | **Verklig fellucka:** separata HTTP-steg ger delkopia vid fel, och okänd status kan hoppa över terminer/skolor. Rättas genom [COPY-ATOMIC](05-COPY-ATOMIC-PLAN.md), med nytt mänskligt prov efter teknisk leverans. |
| ADMIN-04 | Beständig tom klass, explicit fastställd gymnasietimplansversion, läsår/årskolumn och uttryckligt versionsbyte är anslutna till skyddade API/SQL. [Operativ verifiering](05-OPERATIONAL-VERIFICATION.md) ger aktuella avgränsade delbevis. | Mänskligt prov av klasskoppling och versionsbyte återstår. Det är en bedömningslucka, inte ett saknat gymnasiekommando. |
| PLANERING-01 | Uppdragsbundet planeringsår/skola, separat registerår, retur/Back/omladdning och skydd mot sena svar. | Samlad kravspårning och fasacceptans, inget nytt konkret implementationsfel hittat i genomgången. |
| PLANERING-02 | Källstyrd årsprojektion, nya/fortsättande kullar och tydliga okända GR/IM-underlag. | Samlad kravspårning inom den beslutade avgränsningen. |
| PLANERING-03 | Sök/filter/sortering/sidindelning över tillåtet urval och rollinkorg med egna uppgifter först. | Dokumenterad kvarstående läslatens för huvudman/admin är uppföljning; inget nytt blockerat arbetsflöde belagt. |
| PLANERING-04 | Exakt årskolumn, originalindex och fryst version. Gymnasiets klassbyte gäller uttryckligt valt läsår. | Mänsklig klass-/års-/versionsbedömning. |
| PLANERING-05 | SQL/Worker/dator-/telefonbevis, skyddade mandat och S1/S3-kontrakt. [Samlat årsplaneringsprov](05-PLANNING-YEAR-USER-TRIAL.md) godkänt 2026-10-09. | Det nya kopieringsfelet kräver egna färska verifieringsbevis; äldre gröna körningar räcker inte. |

## Kodankare för kvarstående luckor

- Skolimport: `web/app/protected-home.tsx` öppnar kundadministration endast för kundadmin; `web/app/kund-workspace.tsx` och `web/app/api/kund/skolenhet/route.ts` erbjuder endast ny kodimport. Befintlig skola nekas med 409. `supabase/migrations/20260913200000_phase2_access_model.sql` importerar med INSERT. Äldre `web/lib/organisation-store.ts` registeruppdatering ligger i den tidigare klientvägen och uppfyller inte den skyddade huvudmannavägen.
- Kullkopiering före rättningen: `web/app/protected-programplan-workspace.tsx` gjorde `saveCopy` → skapa → separat terminer/skolval i `openCreatedCopy`. Terminsläsningsfel kunde ignoreras; återhämtning från ett känt skapat kommando kunde lämna efterstegen ogjorda. `05-CONTEXT.md` och `05-CONTRACT.md` kräver atomärt, isolerat verksamhetskommando med auditrollback.
- Klasskoppling finns faktiskt i `web/app/protected-class-timplans.tsx`, `web/lib/server/class-timplan.ts` och migrationerna `20261012210000_class_timplan_flow.sql` / `20261012240000_class_start_calendar.sql`. Planera inte om den som saknad funktion.

## Äldre planering och bevis

DECISION-FLOW ersätter uttryckligen äldre 05-25/26/32/33 inom stödd gymnasiekedja. Övriga äldre 05-27–31/34–35 kan ha levererade delbeteenden men får inte kollektivt markeras färdiga utan målspårning. Äldre 05-17 utan SUMMARY får inte bli en evig grind när senare VOCATIONAL redan ger aktuella yrkesprofilbevis.

GR/IM:s nya beslut, särskilda profiler, individuella studieplaner, framtida yrkesprov och schemadelprojekt utvidgar inte automatiskt ursprunglig fas 5. Det tidigare godkända grund-/årsplanerings-/beslutsprovet behöver inte göras om i sin helhet.

05-22:s första migration ändrade fyra `updated_at`. Historisk verifiering förblir PARTIAL. Den korrigerade framåtkällan och senare bevarandebevis ändrar inte det historiska resultatet; inga gamla tidsstämplar gissas eller skrivs tillbaka.

Historiska 88/100 planer och 3/8 verifierade faser räknas inte om i denna genomgång. De senare DECISION/VOCATIONAL/OPERATIONAL-planerna och COPY-ATOMIC redovisas separat. Fas 4:s egen mänskliga checkpoint och verklig kommun-/pilotanslutning godkänns inte av fas 5:s prov.

## Nytt inventerat historiskt loggfynd

Det faktiska kopieringsprovets slutkontroll fann 1 827 äldre säkerhetshändelser med saknat `actor_identity_id`-ankare. Läsande inventering visar händelsedatum 2026-09-30 till 2026-10-05; de föregår denna rättning. Kopieringsprovets äldre hela audit-/identitetsrader är bevarade. Fyndet får inte repareras genom att hitta på identiteter eller ändra historiska loggar. [Separat uppföljning](../../todos/pending/2026-10-14-utreda-historiska-loggankare.md) kräver käll-/cleanupdiagnos och spårbar hantering före full pilotacceptans. Kopieringsprovets nya slutgrind mäter baslinjen, bevarar den exakt och kräver noll nya saknade ankare; den påstår inte att all äldre logghistorik är fullständig.

## Fortsättning

1. Slutför och verifiera COPY-ATOMIC med fullständighets-/fel-/återhämtningsbevis.
2. Leverera samma prövade bygge och ett avgränsat användarprov för kullkopiering och klass/läsår/version.
3. Efter användarsvaret: precisera och genomför ADMIN-01:s skyddade huvudmannaväg i en egen plan, följt av dess konkreta användarprov och samlad fasbedömning.

Fulla ADMIN-/PLANERING-krav och fas 5 förblir öppna tills deras egna resultat och acceptansgränser har stämts av. Detta är ingen verklig kommunanslutning.
