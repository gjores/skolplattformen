---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-CENTRAL-CONTENT
status: planned
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
