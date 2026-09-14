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

## Skyddad provmiljö (fas 2, kräver Docker)

### Engångsförberedelse

GoTrue i containern och webbläsaren på datorn måste nå Keycloak under samma namn. Lägg därför till följande rad i `/etc/hosts` en gång:

```bash
sudo sh -c 'echo "127.0.0.1 host.docker.internal" >> /etc/hosts'
```

Inget skript i projektet ändrar `/etc/hosts`. Utan raden rapporterar `prepare-local --with-idp` **BLOCKED**.

### Starta

Kör först från projektroten:

```bash
node work/pilot/prepare-local.mjs --target protected --with-idp
cd web && npm run dev:protected
```

Öppna `http://localhost:3000/`. Första körningen hämtar `quay.io/keycloak/keycloak:26.7.3`, vilket kräver nätanslutning.

### Testpersoner

Alla testpersoner använder det lokala provlösenordet `Provlosenord-1`. Det är ett syntetiskt provvärde och ingen drifthemlighet.

| Användarnamn | E-post | TOTP krävs |
|---|---|---|
| `anna.admin` | anna@example.test | Ja |
| `bertil.granskare` | bertil@example.test | Ja |
| `cecilia.a` | cecilia@example.test | Nej |
| `cecilia.b` | cecilia@example.test | Nej |
| `david.admin-b` | david@example.test | Ja |
| `erik.utan` | erik@example.test | Ja |
| `frida.uppdrag` | frida@example.test | Nej |
| `gustav.sparr` | gustav@example.test | Nej |
| `hanna.tva` | hanna@example.test | Ja |
| `ivar.utan-otp` | ivar@example.test | Nej |

Hämta aktuell engångskod för en TOTP-person från projektroten:

```bash
node work/pilot/idp-otp.mjs --user anna.admin
```

Medlemskap och uppdrag för testpersonerna läggs av `work/pilot/sql/phase2-fixtures.sql` i plan 02-02, som kommer i en senare plan. Leverantörsinbjudan görs med `work/pilot/invite.mjs` i plan 02-06, som också kommer i en senare plan.

### Byggt paket

```bash
npm run build:protected && npm run preview:protected
```

Öppna `http://127.0.0.1:3012/`. Det skyddade paketet ligger i `dist-protected/`. Kommandona `phone` och `preview:example` fortsätter att vägra ett protected-bygge.

### Vad som inte påstås

- Keycloak är en lokal testleverantör — inte kundens IdP. Anslutning till Skolfederation eller kommunens IdP godkänns i fas 7 för IAM-02 och är det öppna beroendet OB-02 i `connection-profile.md`.
- Miljön använder inga molnnycklar och ingen `--linked`-anslutning.
- Exempelläget (`npm run dev:example`) är fortsatt helt utan backend.

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
- Redigera `/etc/hosts` från ett skript eller committa `web/.dev.vars`, `work/pilot/targets/` eller en genererad `realm.json`.
