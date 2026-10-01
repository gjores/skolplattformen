---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "10"
reviewed: 2026-10-01
reviewer: independent-executor-05-09
status: code_review_passed_runtime_pending
scope: SQL, slutna underlagskontrakt, serveradapter och klientens kommandokontrakt
---

# Oberoende kodgranskning av 05-10

Sex kodkontroller passerar. Inga konkreta blockerande fel har hittats i de granskade färdiga koddelarna. Detta är en kodgranskning före fulla körbevis, inte ett godkännande av 05-10 eller användarflödet.

1. **Levande skolmandat och lås — PASS.** Listan härleder kund/huvudman/skolor från faktisk `phase5_programplan_actor` och aktuella `mandate_units`. Workspace använder `phase5_programplan_scope(null, offeringId)`, som låser faktisk session, kund och utbildning samt läser om mandatkedja och utbildningsrad efter väntan. Utbildningens ID och kund-/huvudmanna-/skolkedja prövas igen före audit. Helpers och båda nya entrypoints är stängda i grundmigrationen; ett separat preflightbevis behövs före grants.
2. **Exakt oföränderligt katalogunderlag — PASS.** `catalog_id: null` innebär uttrycklig frånvaro av val. SQL returnerar valt historiskt payload eller `catalog_unavailable`, utan alias för senaste katalog. Servern verifierar SHA-256 mot hela lagrade payloadet och det begärda ID:t innan programmet och berörda ämnen projiceras. Varken aktuell repoartefakt, osignerad liten projektion eller klientvald roll ersätter denna gräns. Verifierad katalog kan inte ändras genom klientens projektion.
3. **Slutna svar och explicit saknat underlag — PASS.** Request- och responseparsers prövar exakta objektfält, vanliga prototyper, symbol/accessorfält, täta arrays, typer, verkliga datum, UUID, katalogbindning och program/inriktning. Okänd/malformad projektion stoppas inom transaktionen. Projektionens katalog får inte `verifyProgramplanCatalog`-kapabilitet eller beslutberedskap; `decisionReady` är konstant false. Saknat program/inriktning får ett blockerat resultat med inga fabricerade alternativ.
4. **Äldre val och startdatum — PASS.** Workspace återger äldre råa fördjupningskoder i sparad ordning, inklusive okända/dubbla värden; klienten visar dessa och stänger bindning/kloning vid tvetydighet. Koderna ersätts inte ur senaste katalog. Bindning och obunden kloning kräver uttryckligt riktigt startdatum samt bekräftelse på bevarad ordning. Bunden kloning visar oföränderliga källval/start och skickar null legacyunderlag.
5. **Maxversion och utkast utanför sidan — PASS.** SQL räknar `latestVersion`, `draftId` och `versionCount` över hela utbildningen. Synlig versionlista är separat paginerad i stabil fallande ordning. Klientens skapa-/klonkommando använder hela utbildningens maxversion och stänger nytt utkast när ett annat finns, även utanför aktuell sida. UI härleder inte maxversion ur synliga rader.
6. **Sessionsbunden audit och kommandobevarande — PASS.** Båda läsvägar använder `protectedRoute`, kräver HM/rektor och obligatorisk audit, kontrollerar same-origin och återanvänder uppdaterad session/epoch. Ny Workspace-DB-logg och Worker-logg delar samma yttre transaktion; parser-/katalogintegritetsfel kastar AuditUnavailable före svar. Klientens kommandosvar kontrollerar utbildning, sparad identitet, utkaststatus, katalogbindning, revision/version och ordnade val. Create/replace kan ändra val; bind/clone bevarar källval. Sparad plan fastställs inte här.

## Lästa källor

- `supabase/migrations/20261001120000_phase5_programplan_workspace.sql`
- Befintliga `phase5_programplan_actor`, `phase5_programplan_scope` och session/audit i migration 20260930162000.
- `web/lib/programplan-workspace-contract.ts`
- `web/lib/server/programplan-workspace.ts`
- `web/app/api/programplaner/lista/route.ts` och `underlag/route.ts`
- `web/lib/protected-programplan.ts` samt relevanta katalog-/bind-/klon-/svarskontroller i `protected-programplan-workspace.tsx`.
- `supabase/tests/phase5_programplan_workspace.test.sql` och riktade parser-/adapterprov som provspecifikationer, inte som påstådda körbevis.

## Begränsningar före slutförande

Granskaren har inte gjort samtidiga databaskörningar eller egna kodändringar. Körbevis för exakt två nya grants, återställd ACL, DB/Worker-auditrollback, verkliga sessions-/mandatgränser, read-preservation, fel/timeout och dator-/telefonflöde måste finnas från genomförandet. SQL-testkällans positiva/negativa assertions och pagineringsfall stödjer granskningsbedömningen men ersätter inte färsk körning. En observerad låsväntan prövas separat om workspacegenomförandet ska göra ett nytt påstående om dynamiskt mandat efter väntan.

Fullständiga nationella ramar, alternativ, nivåföljd/timregler och fastställande förblir stängda. Mänsklig användarverifiering och fasens samlade kravverifiering återstår. Ingen verklig IdP-/kommunanslutning eller pilotdrift granskas här.
