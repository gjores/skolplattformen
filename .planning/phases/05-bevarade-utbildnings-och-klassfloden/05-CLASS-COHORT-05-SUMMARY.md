---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-05
status: complete
date: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Strikta kontrakt för tidiga klasser

Plan05:s rena TypeScript-kontrakt är implementerade och verifierade. Underlag, skapa och status har separata exakta scheman. Klasser förblir oberoende av timplanskoppling och elevmedlemskap. SQL04:s faktiska svar/paritet, skyddade HTTP-rutter, UI och verklig Worker återstår som separata bevis.

`web/lib/class-cohort.ts` exporterar de överenskomna typerna och sex parsers. Create kräver exakt utbildning/skola, command-ID, revision, 64 hextecken för källtoken, verkligt datum och 1–20 redan granskade kanoniska namn. Namn ordnas aldrig om eller normaliseras i parsern. Okända fält, accessor-egenskaper, glesa arrayer, fel UUID/revision och dubbla namn nekas. Ensamma UTF-16-surrogater nekas; giltiga tecken utanför BMP räknas som två kodenheter mot gränsen 60.

Create-svaret verifieras mot begärans command-ID, skola, utbildning, datum, exakt antal och namnordning. Klass-ID:n ska vara unika; varje klass måste ha samma start, juli-härlett första läsår, null slut och `education_start`. Found-status kräver ett fullständigt verifierat kvitto med `replayed=true`; not_found kräver `receipt=null`. Svarens schema återger inte requestens sourceToken/revision, så SQL måste verifiera dessa mot det lagrade requestkvittot. Ett parserfel är inte bekräftat sparande.

Läsning tillåter historiska klassår 1–9998 och bevarar namn upp till 60 Unicode-kodpunkter, även namn som gamla PostgreSQL-vägen tillåter men nya batchregler nekar. Detta gäller båda provenienserna enligt rootens kontraktsförtydligande. Legacy kräver null start/slut; känd giltighet kräver verklig start och inkluderande slut utan omvänd period. Blockerad aktuell källa döljer inte historiska klasser. Källdatum/år/token är alla null eller alla kända. Okänd källa och kända år utanför 2000–2100 kräver blocker och läsläge. En komplett lista med 2 000 klasser får inte samtidigt påstå att nya klasser kan skapas.

## Verifiering och commits

- RED: `node --test lib/class-cohort.test.mjs`, exit1, 11/11 giltiginputsviter föll mot en avsiktlig fail-closed scaffold. Commit `adc001c` innehåller detta TDD-steg, inte en färdig leverans.
- GREEN: commit `8ef4dc8` implementerade kontraktet, 12/12 sviter PASS. Rootens oberoende läsning identifierade ensamma surrogater; ett riktat RED-prov föll före rättningen. Egen slutkontroll hittade även ett för tolerant canManage vid klassgränsen; dess prov föll före rättningen.
- Slutligt `node --test lib/class-cohort.test.mjs`: **13/13 PASS**, exit0, inga skips. Sviterna omfattar flera negativa mutationer per kontrakt, datumgränser, Unicode, legacy-läsning, requestbundna kvitton och batchgränser.
- `npx tsc --noEmit`: exit0 efter sista parserändringen.
- `npx oxlint lib/class-cohort.ts`: exit0. Tidigare lintanmärkning mot string-spread rättades till explicit Unicode-kodpunktsräkning med `Array.from`.

Ingen databas, runtime eller UI ändrades av plan05. Ingen appbyggnad eller ny handboksändring behövs för en ännu inte inkopplad ren kontraktsmodul. Root ansvarar för gemensam status och push; endast plan05:s två kontraktsfiler och denna sammanfattning ingår i agentens ändringar.

## SS 12000 och kvarstående bevis

Avsedd mappning följer SS 12000:2024/OpenAPI 2.1.0: stabilt klass-ID, separat giltighet, okända historiska datum och GY-klassens interna utbildningsrelation bevaras. Inga medlemskap eller externa ID:n skapas. Modellen är ett internt kontrakt, inte verifierad SS 12000-export eller kommunanslutning. SQL-/TypeScript-paritet mot faktiska SQL04-svar ska redovisas där; full kravacceptans och användarprov följer senare planer.
