---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "24"
subsystem: register-protected-list-export
status: complete
completed: 2026-09-28
tags: [postgres, pgtap, audit, react, export, playwright]
requires: [04-04, 04-11, 04-13, 04-23, 04-25]
provides:
  - Skyddsflagga per rad och skyddade elev-ID för hela urvalet i listsvaret, bara för administratör med skyddsbehörighet på skolan
  - En committad skyddsvisningshändelse per skyddat elev-ID som listan lämnar ut, även utanför sidan
  - Fail-closed-kontroll i adaptern av listans skyddsform
  - Märket Skyddade personuppgifter i elevlistan (tabell och kort)
  - Uttryckligt, aldrig förvalt skyddsval i exportdialogen med serverprövat antal
affects: [04-16, 04-17, 04-19, 04-21]
requirements: [DATA-01, DATA-02]
requirements-addressed: [DATA-01, DATA-02]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Villkorad nyckel i SQL-svar: protectedIds tas bara med vid skyddsbehörighet, annars är svaret byte för byte 04-04:s form"
    - "Adaptern prövar skyddsformen mot capabilities och SQL:s egna auditRefs före loggning; referenser härleds aldrig ur body"
key-files:
  created:
    - supabase/migrations/20260929180000_phase4_list_protected_flag.sql
    - web/e2e/phase4-protected-export.spec.ts
    - web/playwright.phase4-protected.config.ts
  modified:
    - supabase/tests/phase4_protected.test.sql
    - supabase/tests/phase4_export.test.sql
    - web/lib/server/pupil-register.ts
    - web/lib/server/pupil-register.test.mjs
    - web/lib/pupil-register-model.ts
    - web/lib/pupil-register-model.test.mjs
    - web/app/pupil-register-workspace.tsx
    - web/app/pupil-dialogs.tsx
key-decisions:
  - "Användarbeslut 2026-09-28: Alla elever i urvalet ger behörig administratör alla skyddade elev-ID i urvalet, även på andra sidor; varje utlämnat skyddat ID loggas per listläsning"
  - "Användarbeslut 2026-09-28: kryssrutan visas bara när urvalet innehåller minst en skyddad elev, är aldrig förvald och återställs vid byte mellan markerade elever och hela urvalet"
  - "Användarbeslut 2026-09-28: märket syns bara för administratör med huvudmannens skyddsbehörighet för elevens skola; rektor och lärare ser den anonyma raden utan märke"
  - "Användarbeslut 2026-09-28: skillnaden i antal för obehörig administratör (i urvalet jämfört med exporterbara) lämnas oförändrad här och bekräftas i 04-19"
  - "Avsiktlig kontraktsändring mot 04-04: listan får skyddsdiskriminator och auditRefs ur hela urvalet, men bara för behörig administratör"
  - "PupilCard bygger på en egen projektionstyp så att listans protectedIdentity?: true inte smalnar av kortets protectedIdentity: boolean"
actuals:
  tokens: 10300
  tasks: 3
  commits: 3
plan_head_before: d4259a6a8c13dc30c9dd1e514dd687abcc651116
duration: ca 30min
---

# Fas 4 plan 24: skyddade elever i elevlistan och exporten

**En administratör som har huvudmannens skyddsbehörighet för skolan ser nu märket Skyddade personuppgifter på skyddade elever i elevlistan. I exportdialogen kan hen uttryckligen ta med dem. Valet är aldrig förvalt, och servern prövar det igen. Alla andra (administratör utan beslut, rektor, lärare, elevhälsa och support) får samma listsvar och samma dialog som tidigare. Allt är provat lokalt med syntetiska uppgifter, i databas, nodprov och webbläsare på dator och telefonvy. Nedladdningen är inte browserprovad.**

## Genomfört

### Uppgift 1: skyddsuppgift i listsvaret bara för behörig (c7fd0c1)
- **Migration `20260929180000_phase4_list_protected_flag.sql`** ersätter bara `public.phase4_list_pupils(jsonb)`. Före ändringen kontrollerades att målets definition var identisk med 140000:s (`prosrc` jämförd). Ingen senare migration hade ändrat den.
  - Sidans rader får `protectedIdentity: true` när aktören är administratör och eleven är skyddad och fullt läsbar (`is_protected` och `full_access`).
  - `body.protectedIds` innehåller de skyddade elev-ID:na ur hela det filtrerade urvalet, i listans sortering. Nyckeln tas bara med när aktören är administratör och `phase4_has_protected_permission` gäller för urvalets skola. Annars utelämnas den.
  - `auditRefs` bildas ur hela urvalet i stället för bara sidan. Varje skyddat ID som lämnas ut har alltså sin egen `{kind:'protected'}`-referens. För obehöriga är de fortsatt tomma.
  - `security definer` och `search_path` är oförändrade. Revoke från `public, anon, authenticated` och grant till `skolplattform_worker` upprepas idempotent. `phase4_projection`, `phase4_filtered`, `phase4_pupil_card`, `phase4_export_pupils` och `phase3_mandate_options` är orörda.
- **Tillämpning och ordning:** först `assertTarget('protected')` och kontroll att `schema_migrations` slutade på `20260929170000`. 04-17:s `20260930100000` var inte tillämpad. Sedan kopiering till målets workdir, `supabase --workdir … migration up --local` och ny målkontroll. Målet slutar nu på `20260929180000`. Ingen fjärrdatabas, ingen `reset.mjs` och ingen `--include-all` användes. Ordningen i våg 9 blev 04-25, 04-24 och därefter 04-17.
- **pgTAP `phase4_protected`:**
  - (a) En hjälpare prövar obehörigas form på sida 1 och 2: nycklarna i `body` är exakt `pupils, scope, options, capabilities, count, page, pageSize`, ingen rad har `protectedIdentity`, `auditRefs` är tomma och sökning på skyddat eller anonymt namn ger 0. Den körs för administratören före beslut, lärare, elevhälsa med skolomfattning, support och administratören efter återkallelse.
  - (b) Behörig administratör: raden visar `Hemligt namn` med `protectedIdentity: true`, bara den raden har nyckeln och värdet är aldrig `false`. `protectedIds` är exakt den skyddade eleven på sida 1 och 2. Sida 2 saknar raden men har referensen. Ett sökord eller filter som utesluter eleven ger `[]` och inga referenser. Varje ID har exakt en skyddsreferens, och antalet är oförändrat 64.
  - (c) Den gamla assertionen `list has no protected or identity discriminator` är ersatt av två: identitetsnummer, `projection` och radens `canReadProtected` är fortfarande förbjudna, och `protectedIdentity` förekommer bara på den skyddade eleven och då som `true`.
  - (d) Huvudmannen återkallar beslutet, och administratören får åter formen i (a).
- **pgTAP `phase4_export`:** för obehörig administratör ger `protectedIds` med skyddat ID och med okänt uuid samma fel (`P0002`, `Pupil not found`), både i preview och download, före beslut och efter återkallelse. Befintliga omprövningar är oförändrade.
- **Adaptern (`pupil-register.ts`):** `pupilRow` godtar valfri `protectedIdentity` men bara med värdet `true`. `listBody` godtar valfri `protectedIds` med unika UUID (skiftlägesoberoende) och högst `count` stycken. `listPupils` stoppar svaret med `AuditUnavailable` före loggningen om en flagga eller `protectedIds` finns utan `canReadProtected`, om en flaggad rad saknas i `protectedIds` eller om ett ID saknar SQL:s skyddsreferens.

### Uppgift 2: märke och uttryckligt skyddsval (2e0b5af)
- **Modellen:** `PupilListItem.protectedIdentity?: true` och `PupilList.protectedIds?: string[]`. Den rena hjälparen `protectedExportChoice(list, target)` ger `{count, ids}`: snittet med markeringen för markerade elever och alla `protectedIds` för hela urvalet. Resultatet är alltid `{0, []}` utan `canReadProtected` eller utan `protectedIds`. `exportPost` skickar skyddade ID bara när `includeProtected === true`.
- **Elevlistan:** märket **Skyddade personuppgifter** (Badge `outline`, `ShieldAlert` 16 px med `aria-hidden`) står under elevens namn i Elev-cellen på dator och i elevkortet i listan på telefon. Det använder samma klasser som elevkortets märke (`.pupil-badges`/`.pupil-badge`), så ingen ny CSS behövdes. Skyddsinformation skrivs aldrig till `title`, `data-*`, `aria-*`, konsolen, lagring, historik eller adress. Arbetsytan skickar `protectedIds` till dialogen bara när `canReadProtected` gäller, annars `[]`.
- **Exportdialogen:** den tidigare texten om att skyddade elever alltid utelämnas och den hårdkodade tomma listan är borttagna. I fältgruppen Elever finns i stället kryssrutan **Ta med elever med skyddade personuppgifter ({p})** med hjälptexten **Utan detta val utelämnas de ur exporten.** Den visas bara när p > 0, ligger i en etikett på minst 44 px, är aldrig förvald och återställs vid byte mellan markerade elever och hela urvalet. När valet ändras görs förhandsprövningen om med de uttryckliga ID:na, och nedladdningen skickar samma lista. En 404 i förhandsprövningen ger nu samma generiska text som nedladdningen: *En elev i urvalet ingår inte längre i ditt uppdrag. Stäng dialogen, hämta aktuellt läge och välj igen.*

### Uppgift 3: browserprov (6082ffb)
- `playwright.phase4-protected.config.ts` har tre projekt: dator 1440×900, iPhone 13 (WebKit, 390 px) och 320×740. Provet går mot byggd protected-Worker på 127.0.0.1:3000 och lokal OIDC. `verify-target` körs före varje databasskrivning. Den syntetiska elevens skyddsflagga och p3.admins behörighet sätts tillfälligt (behörigheten via huvudmannens `/api/kund/skyddsbehorighet` i en separat kontext) och återställs alltid i `finally`. Efter körningarna: flaggan `false` och 0 aktiva beslut, alltså ursprungsläget.

## Faktisk verifiering

| Kontroll | Resultat |
|---|---|
| RED, `phase4_protected` före migrationen | FAIL 10/203, bara de nya (b)/(c)-assertionerna. (a) passerade redan |
| `phase4_export` före migrationen | PASS 28/28 (nya likhetsprov låser befintligt beteende) |
| `run-sql-tests --file phase4_protected.test.sql` | PASS 203/203 |
| `run-sql-tests --file phase4_export.test.sql` | PASS 28/28 |
| Full SQL (`phase4-24-all-sql.json`) | PASS 16/16 filer, 1224 assertions |
| Nod `pupil-register` + `pupil-register-audit` | RED 1 (behörig form avvisades), därefter PASS 36/36 |
| Modellprov | RED 2/26, därefter PASS 26/26 |
| `node --test lib/pupil-register-model.test.mjs lib/server-client.test.mjs lib/server/pupil-register.test.mjs` | PASS 70/70 |
| `node --test lib/*.test.mjs lib/server/*.test.mjs` | PASS 399/399 |
| `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build` | PASS |
| `npm run build:protected` | PASS, bygge märkt `2e0b5af` |
| `playwright.phase4-protected.config.ts` | **PASS 3/3**, två fullständiga körningar |
| Regression `playwright.phase4-card.config.ts` (04-13) | PASS 9/9 |
| Regression `playwright.phase4-list.config.ts` (04-12) | PASS 13/13 |
| Worker-avbrott | 0 `[ERROR]` i förhandsvisningens logg under alla körningar |

Minimerad rapport: `work/pilot/results/phase4-24-browser.json` (gitignorerad, utan elevvärden). Skärmbilderna ligger i gitignorerade `web/test-results/`.

Browserprovet visar följande:
1. **Behörig:** i nätverkssvaret har bara den skyddade eleven flaggan, och `protectedIds` är exakt dess ID. Märket står på rätt rad i tabellen (dator) och i kortlistan (telefon), och bara där. Sidan har ingen sidledsrullning.
   - Markerad skyddad elev utan valet ger serverns generiska tomma urval (400 med texten *Urvalet innehåller inga elever att exportera.*). Kryssrutan visas omarkerad med (1). Valet ger förhandsprövning med `protectedIds` lika med ID:t och antal 1.
   - Byte till **Alla elever i urvalet** avmarkerar valet. Antalet ökar med 1 när valet görs och går tillbaka när det tas bort. ID:t finns i anropskroppen först efter valet.
2. **Återkallad behörighet** med dialogen öppen och valet gjort: förhandsprövningen ger `404 not_found`. Dialogen visar den generiska texten utan ord om skydd, och exportknappen är avstängd.
3. **Obehörig**, efter ny listläsning:
   - Nycklarna är exakt 04-04:s, och svaret saknar `protectedIdentity` och `protectedIds`.
   - Raden är anonym: annat namn, inget födelsedatum och `canExport: false`. Den har inget märke.
   - Varken DOM-text eller `title`/`aria-*`/`data-*` innehåller skydd. Undantaget är miljöetiketten *SKYDDAD PROVMILJÖ*.
   - Dialogen har ingen kryssruta och ingen text om skydd, och anropen har `protectedIds: []`.
   - Direktanrop med skyddat och med okänt ID ger samma status, kod och svarsform (404 `not_found`).
4. **Lagring:** adress, `history.state` och sessionStorage innehåller varken det skyddade elev-ID:t eller skyddsord.

### Krav → prov (lokalt, syntetiskt)
- **DATA-01** (skyddade uppgifter bara för behörig, loggade visningar):
  - Flagga och ID lämnas bara vid huvudmannens skolbeslut (pgTAP b/d och browserprov 1/3).
  - Varje utlämnat skyddat ID har en egen committad `pupil_protected_read`, även utanför sidan (pgTAP b och nodprov).
  - Obehörigas svar är oförändrat (pgTAP a för fyra funktioner samt efter återkallelse, browserprov 3).
  - En avvikande form stoppas utan body (nodprov, nio fall).
- **DATA-02** (serverprövad export):
  - Skyddade elever tas bara med efter uttryckligt val, och antalet kommer från servern (browserprov 1).
  - Omprövning efter återkallelse ger 404 (pgTAP export och browserprov 2).
  - Skyddat och okänt ID ger samma fel (pgTAP export och browserprov 3).
  - **Nedladdning med skyddade elever är bara SQL- och nodprovad, inte browserprovad.**

Inga krav är slutverifierade här.

## Avsiktlig kontraktsändring mot 04-04

04-04 fastställde två regler: listan har ingen skyddsdiskriminator för någon, och listans loggreferenser gäller bara den returnerade sidan. **För alla utan skyddsbehörighet på skolan gäller båda reglerna oförändrat**, och det är prövat i pgTAP (a) och i browserprovet. **För behörig administratör ändras båda avsiktligt:** raden får `protectedIdentity: true` (märket enligt UI-SPEC), `body` får `protectedIds` (exportvalet enligt D-15) och `auditRefs` omfattar varje skyddat ID som faktiskt returneras, även på andra sidor. Den gamla assertionen ersattes av två, och ingen annan assertion togs bort eller försvagades.

## Beteende för handboken (04-21)

- Märket **Skyddade personuppgifter** visas i elevlistan och i elevkortet bara för en administratör som huvudmannen har gett skyddsbehörighet för elevens skola. Utan behörighet visas eleven med ett anonymt namn, utan märke och utan åtgärder (D-19).
- Exportdialogen har kryssrutan **Ta med elever med skyddade personuppgifter (p)** bara när urvalet innehåller skyddade elever och du har behörighet. Den är aldrig förvald. Utan valet utelämnas eleverna. Valet nollställs när du byter mellan markerade elever och hela urvalet. Knappens antal är serverns förhandsprövning.
- **Alla elever i urvalet** omfattar skyddade elever på alla sidor i urvalet, inte bara den sida som visas.
- Om behörigheten återkallas medan dialogen är öppen står det att en elev inte längre ingår i uppdraget. Stäng dialogen och hämta aktuellt läge.
- Om bara skyddade elever är markerade och valet inte är gjort står det att urvalet inte innehåller några elever att exportera.

## Avvikelser från planen

1. **[Rule 1, provlogik] Tomt urval ger 400, inte antal 0.** Min första browserassertion väntade 200 med antal 0 när bara den skyddade eleven var markerad. Adaptern svarar enligt 04-10 med ett generiskt `400 bad_request` vid tomt urval. Provet väntar nu 400 och dialogens befintliga text. Hela urvalet för p3.admin innehåller bara en elev, så grundantalet utan val är 0. Provet räknar därför 400 som 0. Produktkoden är oförändrad.
2. **[Rule 1, provlogik] Hängande lokator.** `dialog.locator('label', { has: choice })` matchade aldrig och väntade tills tidsgränsen. Den ersattes av `choice.locator('xpath=ancestor::label[1]')`. Animeringsväntan tar nu bara med ändliga animeringar.
3. **Typsäkerhet:** `PupilCard` bygger nu på en egen `PupilProjection` i stället för `PupilListItem`. Annars hade listans `protectedIdentity?: true` smalnat av kortets `protectedIdentity: boolean` till `true`. Beteendet är oförändrat.
4. **Förhandsprövningens 404-text** är nu densamma som nedladdningens generiska text. Tidigare stod det *Eleven finns inte eller ingår inte i ditt uppdrag.* Planen angav den befintliga texten om att en elev inte längre ingår i uppdraget.
5. **Grenskydd:** projektet kör sekventiellt på `master` med `branching_strategy: none`, enligt tidigare planer. Därför gjordes vanliga commits där, utan force eller omskrivning.

## Kvarstående begränsningar

- **Nedladdningen är inte browserprovad.** p3.admin saknar engångskod. Nedladdning med skyddade elever täcks av pgTAP (`phase4_export`, inklusive omprövning efter återkallelse) och nodprov. Den ingår i 04-16 och 04-19.
- Telefonprojekten är WebKit-enhetsläge i Playwright, inte en fysisk telefon.
- **Antalsskillnaden för obehörig administratör** (eleven räknas i urvalets antal men kan inte exporteras) är oförändrad enligt användarbeslut 4. Den ska bekräftas i 04-19.
- Browserprovet använder den enda syntetiska eleven vid p3.admins skola. Flera skyddade elever och sidbrytning prövas i pgTAP (64 elever, sida 2), inte i webbläsaren.
- 04-17, 04-16, 04-18–04-22, handboken (04-21), gsd-verify-work och fasverifiering återstår. Syntetiska prov godkänner varken verklig drift eller kommunanslutning.

## Known Stubs

Inga.

## Threat Flags

Inga nya ytor utöver planens hotregister. `protectedIds` i listsvaret är den planerade ytan (T-04-24-01 och T-04-24-04), och den är prövad enligt ovan.

## Commits

- `c7fd0c1` feat: skyddsflagga och skyddade elev-ID i listsvaret bara för behörig administratör
- `2e0b5af` feat: skyddsmärke i elevlistan och uttryckligt skyddsval i exportdialogen
- `6082ffb` test: browserprov av skyddsmärke och skyddsval i exporten för behörig och obehörig

## Self-Check: PASSED

- FOUND: supabase/migrations/20260929180000_phase4_list_protected_flag.sql, web/e2e/phase4-protected-export.spec.ts, web/playwright.phase4-protected.config.ts
- FOUND: c7fd0c1, 2e0b5af, 6082ffb (3 commits uppmätta från `d4259a6`)
