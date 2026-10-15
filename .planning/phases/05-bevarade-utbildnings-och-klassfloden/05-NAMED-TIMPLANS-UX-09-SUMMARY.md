---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-09
status: prepared_ui_mock_verified
subsystem: class-timplan-ui
requires: [NAMED-TIMPLANS-UX-06, NAMED-TIMPLANS-UX-07]
provides: [reviewed-class-multiselect, persisted-serial-class-link-queue]
completed: 2026-10-15
---

# Namngivna timplaner 09 – granskat flerval med resultat per klass

Två eller fler klasser kan markeras, granskas och kopplas med befintliga enklasskommandon i följd. Varje klass visar kvar, okänd sparstatus, mottaget kvitto, sparad och återläst eller konflikt. Detta är färdig UI-/köimplementation med syntetiska prov; faktisk server-/SQL-integration och paketacceptans återstår. Ingen gemensam SQL-batch påstås.

## Beteende och skydd

- Synliga checkboxar ersätter enklassvalet. Aktuell namngiven timplan/version visas per klass. Identiska kopplingar kan inte skickas igen; andra kullar kan inte väljas.
- Granskningen visar före → efter, målplanens namn/version, skola och uttryckligt läsår. Markeringar skriver ingenting.
- Alla commandId, förväntade revisioner och föregående plan-ID:n skapas en gång vid granskning. En strikt validerad journal sparas och kontrolläses i sessionStorage före första nätanropet. Scope innehåller kund, medlemskap, uppdrag, kontextepoch och planidentitet; råtoken sparas inte.
- Varje POST kräver ett validerat kvitto och en exakt återläsning innan klassen blir sparad. Vid okänd status skickas endast samma oförändrade begäran. Omladdning läser automatiskt, men skickar inte automatiskt.
- Delvis sparat resultat bevaras; konflikt och okänd status stoppar återstående klasser. Om en tidigare kvitterad länk senare ändrats av annan aktör visas konflikt och ingen automatisk återställning görs. En senare okänd begäran kan fortfarande återhämtas exakt.
- Granskat plan-/klassnamn och planversion kontrolleras före oskickade poster; ett namnbyte kräver ny granskning. Gamla okända begäranden får behålla sin ursprungliga identitet.
- Trasig/förlorad journal, MFA och osäker status blockerar ny körning och intern navigering. Återkallat mandat döljer skyddade resultat. Ett annat scope återanvänder aldrig journalen.
- Befintlig enklassskapandehantering, fryst utbildningsstart, explicita läsår, huvudmannens läsläge, legacybegränsningar och serverns canManage bevaras. Det fanns ingen äldre beständig klasskopplingsjournal att migrera; det tidigare tillståndet för enklasskommandon låg i React. Klasskapandets befintliga återförsök har bevarats och regressionsprovats.

## Filer

- `web/app/protected-class-timplans.tsx`, `web/app/protected-class-timplans.css`
- `web/lib/class-timplan-queue.ts`, `web/lib/class-timplan-queue.test.mjs`
- `web/e2e/named-class-links.spec.ts`, `web/playwright.named-class-links.config.ts`
- `web/e2e/fixtures/operational-preview.tsx`
- `web/e2e/operational-class-timplan.spec.ts` – uppdaterade val/granskningsselektorer och realistisk revisionsåterläsning i mocken.
- `web/e2e/class-cohort-actual.spec.ts` – enbart nya flervalsselektorer och sparad-besked; detta actualprov har **inte körts** i arbetet.
- `web/app/protected-gym-timplan-workspace.tsx` – endast scopeKey/returnTo på ProtectedClassTimplans-anropet. MFA-retur innehåller validerade detalj-ID:n/läsår, ingen fri söktext.

## Verifiering

Samtliga kommandon körda i `web/`, testserver endast på 5194. Användarens appar 3012/3013 och databasen har inte startats om eller muterats.

- `node --test lib/class-timplan-queue.test.mjs`: **7/7 PASS**. Scope, hostile/sparse journal, kvitto + återläsning, oförändrad unknown-begäran, konflikt, samtidiga ändringar samt namnbyte.
- `npx --no-install playwright test --config=playwright.named-class-links.config.ts`: **32/32 PASS**, 16 fall vardera i Desktop Chrome och iPhone 13/WebKit. Två klasser, annan serie, annat läsår, klass utanför kull, identisk koppling, första sparad/andra409, svar bort efter simulerad commit, reload, MFA-retur, dubbelklick, scopebyte, trasig journal, lagringsfel före/efter POST, senare extern ändring och återkallat mandat.
- `npx --no-install playwright test operational-class-timplan.spec.ts --config=playwright.usability.config.ts --output=/private/tmp/named-class-links-regression`: **42/42 PASS**, befintlig klasskapning, datum/läsårsgränser, versionsbyte, säkra felbesked och läsläge på båda enheterna.
- Utökad kontroll av alla berörda formulärkontroller avslöjade iOS-select **23px** trots min-height. Explicit `height:44px` rättade detta. Riktad `--grep '44px'`: **2/2 PASS efter rättningen**. Hela 32/42-körningarna föregår denna isolerade CSS-rättning; de redovisas inte som omkörda efter den.
- Efter typning av mocken och korrigerad referens till Storage-metoden kördes även `--grep 'förlorad lagring efter svar'`: **2/2 PASS**, `/private/tmp/named-class-links-storage-final-pass.json`.
- `npx --no-install tsc --noEmit`: PASS.
- `npx --no-install oxlint app/protected-class-timplans.tsx lib/class-timplan-queue.ts lib/class-timplan-queue.test.mjs e2e/named-class-links.spec.ts e2e/fixtures/operational-preview.tsx`: PASS efter typning av den nya mocken.
- Desktop- och telefonskärmbilder av granskningen har lästs visuellt. Dialogen visar klasser, mål, läsår och seriellt sparande utan horisontell sidscroll. Tryckmål/fokus är mätta. Detta är inte slutlig användaracceptans eller hela paketets mobilgranskning.

## Faktisk provhistorik och avvikelser

1. Första utbyggda körningen: 28/30 PASS; dialogens stängknapp var 28px bred. CSS min-width/min-height 44 rättades och efterföljande geometri passerar.
2. Nästa 32-körning: 31/32 PASS; sidan laddades oväntat om under öppning före testhandlingen. Trace visar en extra navigation och Vite-återanslutning. HMR från samtidiga källändringar är misstänkt men inte bevisad. Oförändrad produktkod med samordnat skrivuppehåll gav 32/32 PASS. Första felspåret är bevarat.
3. Den kompletterande 44px-mätningen fann ett verkligt iOS-selectfel (23px). Efter explicit höjd passerade samma dator-/telefonprov.
4. Extra lint över den äldre operational-testfilen visade befintliga `any`-annoteringar; denna äldre fil ingår inte i projektets normala `oxlint app lib`. Den nya testfilens annoteringar rättades och riktad lint ovan passerar. Inga breda typrefaktoreringar av gamla tester ingår.
5. Ingen påstådd initial TDD-RED för köimplementationen. Observerade fel och korrigeringar ovan är faktisk historik.

## Råbevis

- `/private/tmp/named-class-links-pass-32.json`, SHA-256 `b4f6850361148cdb8ff73bae8939ed69cfa5899726aa98aa37363dead3111487`.
- `/private/tmp/named-class-links-regression-pass-42.json`, SHA-256 `7d43c031745617dd197d9fa3e74f3b6e355becdf71fe5c2e478aa297384d9230`.
- `/private/tmp/named-class-links-control-size-pass.json`, SHA-256 `d84b9002b9bd65b9c8d05f2247021df647f48100dfbd008e44f85279708b0b91`.
- Första felen: `/private/tmp/named-class-links-first-failed-30.json`, `/private/tmp/named-class-links-first-failed-32.json`, `/private/tmp/named-class-links-control-size-fail.json` samt motsvarande artefaktkataloger.
- Slutliga granskningsbilder: `/private/tmp/named-class-links-control-size-pass/`; ursprungliga resultatbilder: `/private/tmp/named-class-links/`.

## SS 12000 och återstående arbete

SS 12000:2024/OpenAPI 2.1.0 enligt paketets dokumenterade mappning. Klass-/organisations-ID:n, giltighet och medlemskap ändras inte. Timplansserie och journal är interna begrepp. Syntetiska UI-prov bevisar inget informationsutbyte eller standardstöd.

Plan 07:s faktiska kedja, SQL-projektionsparitet, samlad UI-integration och handbokens slutliga flödestext/bygge återstår inom paketet. Ingen ändring av STATE/ROADMAP eller godkännandestatus har gjorts av utföraren. Root sköter granskning, avgränsad commit och push; utföraren har inte committat.
