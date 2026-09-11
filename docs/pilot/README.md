# Provmiljö — startanvisning

Provmiljön är appen i **exempelläge**: två fiktiva skolor (Björkhagens grundskola, Exempelstads gymnasium) i sidans minne, utan databas, utan inloggning och utan anrop till någon Supabase-tjänst. Ändringar gäller tills sidan laddas om. Vad som är bevisat och vad som återstår står i [baseline.md](baseline.md); pilotens beslutsläge står i [connection-profile.md](connection-profile.md).

## Förutsättning

Paketet kräver Node 25 (`node@25` från Homebrew); systemets Node 20 räcker inte.

```bash
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
cd web && npm ci
```

## Dator

```bash
npm run dev:example
```

Öppna `http://localhost:3000/`. Sidhuvudet ska visa **Provmiljö** och arbetsytan **Fiktiva skolor och elever.** samt **Ändringar gäller tills sidan laddas om**. Skolan väljs i väljaren **Exempelskola**; rollen provas under **Prova som**.

## Telefon (fysisk enhet på samma wifi)

```bash
npm run build:example && npm run phone
```

`build:example` bygger med exempelläget inbäddat och märker bygget i `dist/build-mode.json`; `phone` vägrar starta ett bygge som saknar den märkningen. Skriptet skriver ut adressen `http://<LAN-IP>:3002/` — öppna den i telefonens webbläsare. Endast GET/HEAD tillåts genom telefonproxyn.

## Blockerad start (vad som händer utan exempelläge)

```bash
npm run dev:blocked:test
```

Öppna `http://127.0.0.1:5192/`. Sidan ska bara visa rubriken **Arbetsytan är inte tillgänglig ännu** med en kort förklaring — ingen skolväljare, inget rollval, inget innehåll. Läget simulerar en start där miljön saknar `NEXT_PUBLIC_APP_MODE=example` men har (falska) anslutningsvärden; de öppnar ingenting.

## Lokala databasmål (kräver Docker)

```bash
node work/pilot/prepare-local.mjs --target protected   # 7 migrationer inkl. karantän, 127.0.0.1:563xx
node work/pilot/prepare-local.mjs --target baseline    # 6 migrationer från taggen fas1-baslinje, 127.0.0.1:553xx
node work/pilot/prepare-local.mjs --target <mål> --fresh   # återställ målet
node work/pilot/prepare-local.mjs --target <mål> --stop    # stoppa målet
```

Kommandona körs från projektroten. Målen är disponibla och loopback-bundna; `verify-target.mjs` vägrar molnvariabler, `--linked` och okända mål.

## Alla kontroller

```bash
cd web && npm run verify:phase1                  # full grind: modeller, tsc, lint, bygge, Playwright, pgTAP, API, baslinje-db
node scripts/verify-phase1.mjs --skip-browser --out /tmp/phase1.json   # snabb återkörning, högst PASS-PARTIAL
node scripts/verify-phase1.mjs --with-restore   # inkluderar återställningsprovet av taggen
```

Utan Docker blir databasstegen **BLOCKED** (exit 3), aldrig PASS. Sparordningssteget är KNOWN-ISSUE med ägare fas 5 och räknas aldrig som PASS. Resultatet skrivs till `work/pilot/results/phase1-summary.json`; använd `--out` utanför arbetsträdet om den committade fulla körningen inte ska skrivas över.

## Vad som aldrig ska göras

- Köra `work/supabase/*.mjs` mot molnet — skripten är historik, flera skriver till ansluten databas och `reset.mjs` raderar demodata.
- Lägga in verkliga elevuppgifter i provmiljön, fixturer eller resultatfiler.
- Lägga nycklar, `.env.local` eller andra hemligheter i Git, planeringsdokument eller felsökningsutdata.
