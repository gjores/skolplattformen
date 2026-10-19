---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-CENTRAL-CONTENT
status: awaiting_install_approval
type: execute
autonomous: true
---

# Centralt innehåll som val i APL-perioder

Användaren beställde 2026-10-19 att rektor ska välja kurser med tid i timplanen och sedan centralt innehåll och övrigt innehåll i APL-planen. Användarens val: ”strukturerade val: ögonblicksbild från Skolverkets Syllabus-API, sparade val per kurs med ämneskod, version och nivå samt fritext för övrigt innehåll. Gör en GSD-plan med migration.” Kursurvalet är redan levererat (c6781e8: bara fasta ämnesnivåer med APL-tid). Fas 5/ADMIN-02 berörs; kopiering till nästa kull (ADMIN-03) och klass–timplansrelationer (ADMIN-04) bevaras. Gemensamma regler: AGENTS.md.

## Vad som ska bli sant

- Under en vald kurs visas ämnesnivåns centrala innehåll grupperat under ämnesplanens rubriker. Rektor kryssar i de punkter som ska behandlas på arbetsplatsen.
- Ett fritextfält **Övrigt innehåll** tar emot sådant som inte är centralt innehåll. **Arbetsmoment** finns kvar som i dag.
- Valen sparas, visas i granskningsdialogen och i huvudmannens granskning och följer med vid kopiering till ny version/kull när samma ämnesversion finns.
- Gamla planer utan val läses, sparas och bekräftas som förut. Deras innehållshash, rektorsbekräftelser och beslutskvitton ändras inte.
- Betygskriterier ingår inte i den här planen.

## Kontrakt (fastställs före implementation)

Innehållspost utökas med valfria fält: `{ rowKey, description, centralContent?: [{ itemKey, text }], otherContent?: string }`.

- Ämneskod, version och nivå tas ur fasta radnyckeln `part:SUBJECT:VERSION:LEVEL` och lagras uttryckligen per post (`subject_code`, `subject_version`, `level_code`). Servern nekar post där de inte stämmer med radnyckeln. Block, alternativ och `meta:` får inga val.
- `itemKey` = `sha256` av normaliserad punkttext, bunden till ämne/version/nivå. Texten lagras som ögonblicksbild så att betydelsen består om katalogen ändras.
- Servern godtar bara punkter som finns i en seedad katalogtabell (`syllabus_central_content`, med katalog-ID `sha256:` som programplanskatalogen). Klienten kan alltså inte spara egen text som centralt innehåll.
- Gränser: högst 100 punkter per post, punkttext ≤ 1 000 tecken, övrigt innehåll ≤ 2 000 tecken, inga dubbletter.
- Hash: tomma nya fält ger exakt dagens hashnyttolast. Icke-tomma fält läggs till efter befintliga element i `phase5_apl_hash_payload` och motsvarande klientfunktion.
- Kopiering (`phase5_apl_copy_structure`): val följer med när målraden har samma radnyckel. Annars hamnar posten i befintlig kopieringsgranskning, och inga val tappas tyst.

## Vågor

1. **Katalog.** Utöka `scripts/fetch-syllabus.mjs` så att centralt innehåll hämtas för GY-ämnen med `GRADE_SUBJECT_SYLLABUS` (cirka 570 ämnen och 1 100 nivåer). Verifiera först hur API:et hämtar exakt den ämnesversion som radnyckeln anger. HTML tolkas till rubrik plus punkter och sparas som genererad JSON per ämne/version, så att `import.meta.glob` laddar den först när kursen öppnas. Ett nodtest kontrollerar tolkning av `<p><em>`, `<p><strong>` och listor utan rubrik med ENGE och PEDG som fixturer. Ett skript bygger SQL-seed med katalog-ID, enligt mönstret i `build-programplan-catalog-sql.mjs`.
2. **Databas och server.** En additiv migration skapar `syllabus_central_content` med seed, kolumnen `apl_period_contents.other_content text not null default ''` och tabellen `apl_content_central_items(plan_id, period_id, row_key, item_key, ordinal, text)` med främmande nyckel och kaskad till `apl_period_contents`. Uppdatera parse/value/command/hash/copy/decision_detail och skrivskyddet (`phase5_apl_write_guard`, triggern från `separate_apl_workflow`). Uppdatera även `web/lib/apl-plan.ts`, `web/lib/server/apl-plan.ts` och förhandsworkern. Ingen befintlig rad skrivs om.
3. **Gränssnitt och handbok.** I `protected-apl-plan.tsx` får varje kurs en kryssruta per punkt under rubrikerna, med räknare och möjlighet att fälla ihop. Lägg till fältet Övrigt innehåll, visa valen i granskningsdialogen och i huvudmannens APL-granskning, och markera punkter som inte finns i den laddade katalogen. Uppdatera `docs/handbok/apl-planering.md` och kör handboksbygget.
4. **Leverans.** Kör kontrollerna nedan, bygg skyddat, gör faktiskt Worker-/OIDC-/browserprov mot egen databas med syntetiska data och förbered lokal installation med bevarandekontroll. Migration och byte av 3012 genomförs först efter användarens uttryckliga godkännande. Uppdatera STATE och verifieringsfilen och pusha.

## Kontroller

- Nod: katalogtolkning, kontraktsparse (gammal och ny form), hash (gammal form oförändrad mot sparade fixturer), gränser och dubbletter.
- SQL: falsk punkttext eller fel ämne/version/nivå nekas. Valen på block nekas. Gammal plan återspelas med oförändrad hash. Kopiering med samma och med ändrad radnyckel. Stale revision/hash, fel roll eller skola, återkallat mandat och MFA. Atomisk rollback vid radfel.
- UI på dator och telefon (`apl-plan.spec.ts` och `apl-decision`): välj punkter, spara, läs om, granska som huvudman, ta bort kurs (valen försvinner) och ladda en gammal plan utan val.
- `node --test lib/*.test.mjs`, `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build`, `npm run docs:build`.
- Sviten `apl-plan.spec.ts` har sedan tidigare 26 fel från separata APL-flödet (texter, beslutsväg, timmar på samma sida). De rättas eller avgränsas uttryckligen i våg 3, och ingen av dem räknas som PASS.

## SS 12000

Baslinje: SS 12000:2024 utgåva 4 / OpenAPI 2.1.0. Referensen ämne/version/nivå motsvarar standardens styrdokumentsreferens (Syllabus: ämneskod och kurs-/nivåkod). Mappningen ska stämmas av mot specifikationen i våg 1 och dokumenteras i verifieringen. Enskilda punkter i centralt innehåll och APL-planens innehåll är interna planuppgifter utanför standardens objekt; de exporteras inte som eget standardobjekt. Inga externa ID:n fabriceras. Katalogen kommer från Skolverket (CC0) och är referensdata, inte personuppgifter. Inget standardutbyte verifieras i denna leverans.

## Öppna frågor

- Om **Arbetsmoment** och **Övrigt innehåll** upplevs som dubbla fält kan de slås ihop efter användarprov. Planen behåller båda så att sparade arbetsmoment inte ändrar betydelse.

## Resultat våg 1 (2026-10-19)

- `scripts/fetch-syllabus-central.mjs` hämtar exakt version via `/subjects/{kod}/versions/{version}`. Verifierat: ANAT v1 och v2 skiljer sig, och `?version=` ignoreras av API:et. Skolverkets nätfilter bryter alla sökvägar med `/PROC/`, så skriptet faller då tillbaka till aktuell version och godtar bara exakt efterfrågad version. För PROC är version 2 aktuell.
- Katalogen omfattar 569 ämnesversioner, 1 113 nivåer och 18 051 punkter. Alla 18 052 `<li>` i källan är redovisade; den enda tomma är STAS nivå 1. Nivån ATVO1000X saknar punkter i källan. Katalog-ID (efter våg 2-rättning nedan): `sha256:c494f387655644b97bb0c4e97cc87abba57fa8c006d1b26d8d52b51b415b28ec`, API 1.16.2-SNAPSHOT, hämtad 2026-10-19. Omkörning ger samma ID.
- Tolkaren (`lib/syllabus-central.ts`) avbryter om text hamnar utanför rubrik, punkt eller inledning. Rubriker kan ligga i `<p><em>`, `<p><strong>`, vanlig `<p>` eller trasig `<em>`; inledningen kan ligga i `<p>`, `<h4>`, `<h5>` eller `<span>`.
- Avvikelse från kontraktet: Skolverket upprepar sex punkter inom samma nivå, oftast under olika rubriker (DJUR, KULT, MOTO, VENI). Punktnyckeln (32 hex av sha256) binds därför till ämne, version, nivå, **rubrik**, text och förekomst.
- Seed: en katalograd och 18 051 punktrader (4,6 MB), först provladdad i ett tillfälligt PostgreSQL 14-kluster. I våg 2 flyttades den till migrationen `20261019200100_apl_central_content_seed.sql` med antalskontroll. `--check` skyddar mot avvikelse.
- `lib/syllabus-central-load.ts` laddar en ämnesversion i taget via `import.meta.glob`. Den används först i våg 3 och är ännu inte prövad i ett bygge.
- Kontroller: nod 10/10 (tolkning, nycklar, radnyckel, katalogintegritet, seed) och hela `lib/*.test.mjs` 772/772. `tsc` och `oxlint` utan fel. Ingen databas, server eller UI är ändrad.

## Resultat våg 2 (2026-10-19)

Fastställt kontrakt: en innehållspost är `{ rowKey, description, central?: { catalogId, items: [{ itemKey, heading, text }] }, otherContent? }`. Valfria fält saknas helt när de inte används, aldrig tomma. Fältet `central` tillåts bara på fasta ämnesnivåer (`part:ÄMNE:VERSION:NIVÅ`) och rymmer 1–100 unika punkter.

- Migration `20261019200000_apl_central_content.sql`:
  - Tabellerna `syllabus_central_catalogs` och `syllabus_central_items` är oföränderliga genom trigger och har inga rättigheter för någon roll.
  - `apl_period_contents` får `other_content` och `central_catalog_id`.
  - Ny tabell `apl_content_central_items` med ämneskod, version och nivå, kontroll mot radnyckeln och främmande nyckel till både innehållsposten (kaskad) och katalogpunkten. Den skyddas av samma APL-skrivskydd.
  - Ny gemensam skrivväg `phase5_apl_insert_content`, som kräver exakt katalogtext och rubrik.
  - Nya versioner av tolkning, värde, hash, kommando och kopiering. Hashposten är oförändrad `[rowKey, description]` utan val; med val läggs `apl_content_detail_v1` till med punkter i nyckelordning.
- Seed-migration `20261019200100_apl_central_content_seed.sql`.
- Rättning: Skolverkets text innehöll osynliga formattecken, till exempel mjukt bindestreck, i sex punkter, och APL-textreglerna nekar sådana. Tolkaren tar nu bort `\p{Cf}`, och katalogen genererades om. Nodtestet prövar att alla punkter klarar textreglerna.
- Klient: `lib/apl-plan.ts` har samma tolkning och hashpost (`aplContentHashEntry`). Server-TS (`lib/server/apl-plan.ts`) behövde ingen ändring.
- Kontroller:
  - `work/pilot/verify-apl-central-content.mjs` gav **PASS 26** i egen schemakopia med syntetiska data. Där prövades återrullning till exakt schema och rader, bevarade originalrader vid installation, exakt katalogantal, privata tabeller och funktioner samt att frysta hashvektorer före utökningen är oförändrade i SQL.
  - Samma prov täckte gammal form oförändrad, val och övrigt innehåll med TS-verifierad hash, nekad ändrad text, rubrik, annan nivå, okänd nyckel, okänd katalog, dubbletter och tomma fält, nekade direkta skrivningar och katalogändringar, att ändrat val bryter rektorsbekräftelsens hash, att borttagna val återställer exakt tidigare hash, sparning via Worker-rollen och kopiering till ny timplan med valen bevarade.
  - Nod 774 + 344, `tsc`, `oxlint` och `npm run build` gav PASS.
- Inte prövat: kopieringsbortfall (granskningspost) som innehåller val; tolkningen och hashen täcker formen, men inget SQL-fall skapar ett sådant bortfall. Ingen installation i aktiv databas, ingen HTTP/OIDC och inget UI. Våg 3 och 4 återstår.

## Resultat våg 3 (2026-10-19)

- `app/apl-central-content.tsx`:
  - Väljaren **Centralt innehåll (x av y valda)** har en kryssruta per punkt under ämnesplanens rubriker. Den laddar bara den aktuella ämnesversionen (en separat del i bygget per ämne). Den markerar sparade punkter som saknas i katalogen eller hör till äldre katalog och erbjuder borttagning. Nivåer utan centralt innehåll anges uttryckligen.
  - Den gemensamma läsvyn `AplContentSummary` visar kurs, arbetsmoment, valda punkter grupperade under rubrik och övrigt innehåll.
- `protected-apl-plan.tsx` har väljaren, fältet **Övrigt innehåll (valfritt)** (trimmas och utelämnas när det är tomt), ny instruktionstext, **Visa ämnesinnehåll** i granskningsdialogen och sammanfattning i **Visa underlag**. `plan-decision-panel.tsx` visar samma sammanfattning för huvudmannen.
- Handbok: `apl-planering.md` avsnitt 3 och huvudmannens granskning samt `timplaner.md`. `npm run docs:build` PASS.
- Kontroller:
  - Nytt UI-prov i `apl-plan.spec.ts` på dator och telefon: välj kurs, kryssa två punkter, skriv arbetsmoment och övrigt innehåll, se dem i granskningen, spara (sparad ordning följer ämnesplanen, övrigt innehåll trimmat), se dem i underlaget, ta bort valen och spara exakt gammal form.
  - `apl-decision.spec.ts` 26/26: huvudmannen ser kursnamn, en vald punkt och övrigt innehåll.
  - Skärmbilder på dator och telefon är granskade. Dubbla listpunkter utan rubrik och fet kryssrutetext rättades.
  - Nod 774, `tsc`, `oxlint` och `npm run build` PASS.
- Avgränsat: `apl-plan.spec.ts` har kvar 13 fall (26 körningar) som felade redan före detta arbete. De förväntar sig det äldre flödet där timmar och APL låg på samma sida, äldre beslutstexter och knappar. Inget av dem rör kursvalet eller centralt innehåll, och de räknas inte som PASS. Totalt 38 PASS, varav 4 nya.
- Inte prövat: faktisk HTTP/OIDC, installation och mänsklig begriplighetsbedömning (våg 4).

## Våg 4: förberedelse (2026-10-19), installation väntar på godkännande

- Migrationerna har bytt namn till `20261019200000`/`20261019200100`, så att de kommer efter den redan installerade `20261019150000` (GR/IM).
- Rättning från förberedelsen: serverns felmappning saknade `unknown_central_content`. En manipulerad punkt hade gett 500; nu ger den 400 (`web/lib/server/apl-plan.ts`).
- SQL-prov med de nya namnen: PASS 26. Rapport `/private/tmp/apl-central-sql-1792408479.json`, SHA256 `b8ebefc18dd4316d663008160c62460d728f356a932c8b6e27814396e951b2a4`.
- Faktiskt prov (`work/pilot/verify-apl-central-actual.mjs`) mot eget skyddat bygge av 55ea3da, egen Worker på 3014, egen schemakopia med båda migrationerna, riktiga OIDC-inloggningar (15 verifierade callbacks) och syntetiska användare: **PASS 12/12**, utan omprov.
  - Dator och telefon: rektor väljer kurs med APL-tid, kryssar två punkter, skriver arbetsmoment och övrigt innehåll, ser dem i granskningen och sparar. Raderna i databasen har exakt katalog, ämne, version och nivå och läses tillbaka efter omladdning. Huvudmannen läser valen utan redigeringsknapp.
  - API: ändrad punkttext och okänd nyckel ger 400 utan skrivning; annan skola, huvudman och fel origin ger 403; utgången MFA skriver inget, och efter riktig step-up sparas valet en gång. Läsning och TS-hashverifiering godtar valet.
  - Full städning av OIDC, Worker och schemakopia. Sex skärmbilder är granskade. Rapport `/private/tmp/apl-central-actual-1792408760.json`, SHA256 `b396d4988dc4efb1a6f81d4364ee1bb05ece95b98d3a8470ac3fe563e6868a90`.
- Installationsrepetition mot den skyddade lokala databasen (`work/pilot/apply-apl-central-content.mjs --sql-evidence …`, utan `--apply`) gav **PASS 16/16** i en transaktion som rullades tillbaka:
  - De ursprungliga kolumnerna i alla 79 tabeller är oförändrade, och de 3 befintliga APL-planerna har exakt samma värde.
  - Bara de planerade 3 tabellerna, 2 kolumnerna, 3 villkoren och 1 indexet tillkommer. Exakt 5 funktioner omdefinieras med oförändrade rättigheter, och 5 privata hjälpfunktioner läggs till.
  - Katalogen får 18 051 punkter. Schemat är exakt återställt efteråt.
  - Rapport `/private/tmp/apl-central-apply-verify.json`.
- Kvar efter godkännande: `--apply` (installerar och journalför) och byte av 3012 från ae6c52e till det provade 55ea3da-bygget, med hälsokontroll. Mänsklig begriplighetsbedömning återstår.
