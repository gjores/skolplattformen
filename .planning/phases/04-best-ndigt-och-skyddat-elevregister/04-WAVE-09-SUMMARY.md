---
phase: 04
wave: 9
status: complete
completed_plans: [04-25, 04-24, 04-17]
next_plans: [04-16]
---

# Fas 4 — våg 9

Vågen stänger två luckor från våg 8: Worker-avbrott vid nekade anrop (04-25) och skyddade elever i lista och export (04-24). Båda planerna lades till efter våg 8 enligt användarbeslut 2026-09-28. Därefter avvecklas det gamla elevprovet (04-17). Allt är lokalt och bygger på syntetiska uppgifter. Inga krav är markerade som slutverifierade.

## Verifierat

- Modell- och serversvit efter vågen: 395/395 PASS. Fyra elevprovsfall togs bort i 04-17. `tsc --noEmit` och `oxlint app lib` PASS. `npm run build:protected` PASS i 04-17.
- **04-25:** Orsaken är fastställd. Ett nekande före handlern svarade innan begärans kropp var läst, och då kraschade wranglers lokala proxy vid nästa anrop på samma anslutning. A/B-prov på samma bygge: nekanden med kropp gav avbrott i 5/5 flöden, utan kropp 0/5, och med kroppen läst före svaret 0/10. Rättningen i `denyResponse` (`web/lib/server/authz.ts`, `ee00e31`) läser en oläst kropp till slut och kastar den, högst 1 MiB. Regressionsprovet `deny-path.test.mjs` föll före rättningen och passerar efter. Stabilitetskörning 25/25: 20 provkörningar och 5 nekandeflöden med 200 anrop vardera, 0 avbrott, mot 16/25 före rättningen.
- **04-24:** Migrationen `20260929180000_phase4_list_protected_flag.sql` ändrar bara `phase4_list_pupils`. Skyddsflagga och skyddade elev-ID i urvalet lämnas bara till administratör med skyddsbehörighet, och varje utlämnat ID loggas. Övriga roller får oförändrat svar. SQL: skydd 203/203, export 28/28. Browserprov 3/3 i två körningar på dator, 390 px WebKit och 320 px. Kortets 9/9 och listans 13/13 är fortsatt gröna.
- **04-17:** Migrationen `20260930100000_phase4_retire_probe.sql` tar bort `phase3_read_pupils` och elevprovets tabeller, utan CASCADE och med stopp om något fortfarande läser dem. Historiska logghändelser är orörda. Provrouterna är borta ur bygget, och den byggda Workern svarar 404 på `/api/prov/*` utan inloggning. Full SQL-regression: 17/17 filer och 1216 assertions. Sex befintliga SQL-prov skrevs om till att bevisa att de borttagna objekten saknas, inga andra assertions försvagades.

## Användarbeslut (04-24)

Beslutade 2026-09-28:
1. En behörig administratör får alla skyddade elev-ID i urvalet, även på andra sidor, och varje utlämnat ID loggas per listläsning.
2. Kryssrutan visas bara när urvalet innehåller en skyddad elev. Den är aldrig förvald och nollställs vid byte mellan markerade elever och hela urvalet.
3. Skyddsmärket visas bara för administratör med huvudmannens skyddsbehörighet på elevens skola.
4. Antalsskillnaden för en administratör utan behörighet är oförändrad och ska bekräftas i 04-19.

## Kvarstår

- **Fas 3:s API- och browserprov är övergångsröda.** `verify-mandates.mjs`, `verify-access.mjs`, `phase3-mandates.spec.ts` och `phase3-workspace.spec.ts` använder fortfarande `/api/prov` eller de borttagna tabellerna. Portningen ägs av 04-18. `work/pilot/collect-denials.mjs` saknas i 04-18:s fillista men har två direktprov mot borttagna objekt, se `deferred-items.md`.
- **04-25:** Varje postgres-klient i Workern ger ett ohanterat avslag. Det orsakade inte avbrotten men är noterat. Ett nekande med kropp över 1 MiB och svar utanför `denyResponse` är inte prövade. Wrangler 4.129.0 behandlar fortfarande fel i ProxyWorker som fatala. Ett versionsbyte är föreslaget men kräver användarbeslut.
- **Nedladdning i webbläsaren är inte provad**, eftersom provkontot saknar engångskod. Den ägs av 04-16 och 04-19. Telefonprov körs i WebKit-läge, inte på fysisk telefon.
- Smärre rester: två interna pilotdokument beskriver fortfarande elevprovet, och CSS-regeln `.probe-workspace` används inte. Ett inloggat anrop mot `/api/prov` är inte provat.

## Nästa steg

Fas 4 har 19 av 25 planer genomförda. Våg 10 är 04-16: fullständiga registerprov och syntetiska scenarion.
