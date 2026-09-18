# Lokal kontroll av kontoåtkomst

Den här kontrollen gäller fas 2:s lokala, syntetiska provmiljö. Den visar att den byggda appen kan begränsa kontoåtkomst, uppdrag, kunddata och loggning med en lokal test-IdP. Den är inte en godkänd kommunanslutning och verifierar inte IAM-02 eller IAM-06. Verkliga elever och vårdnadshavare får inte användas här.

## Starta miljön

Från projektroten, med Docker igång och `host.docker.internal` lokalt upplöst enligt [startanvisningen](README.md):

```bash
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
node work/pilot/prepare-local.mjs --target protected --with-idp
node work/pilot/prepare-local.mjs --target baseline
cd web
npm run build:protected
npm run dev:protected
```

Öppna `http://localhost:3000/`. Det byggda protected-paketet kan i stället startas med `npm run preview:protected` och öppnas på `http://127.0.0.1:3012/`. Fasgrinden startar och stoppar sina egna testservrar på `5193`, `3012` och `3013`; den gör ingen databasreset eller ändring av `/etc/hosts`.

## Syntetiska testpersoner

Det lokala provlösenordet är `Provlosenord-1`. Det är ett offentligt, syntetiskt fixturvärde och får aldrig återanvändas i drift.

| Arbetsflöde | Konto | Vad som ska synas |
|---|---|---|
| Kundadministration | `anna.admin` | Provkund A, giltigt kundadminuppdrag och känsliga åtgärder bakom separat step-up |
| Granskarlogg | `bertil.granskare` | Endast Provkund A:s händelser och CSV-export |
| Två uppdrag | `hanna.tva` | Giltiga uppdrag hos A och B, tydligt kontextbyte |
| Samma e-post, annan identitet | `cecilia.a` och `cecilia.b` | Inga delade medlemskap mellan kunderna |

Standardinloggning kan vara lösenordsbaserad. När en känslig administrativ åtgärd kräver högre tillit visar appen **Verifiera med engångskod**. Hämta aktuell TOTP-kod från projektroten, exempelvis:

```bash
node work/pilot/idp-otp.mjs --user anna.admin
```

Efter step-up måste användaren bekräfta åtgärden igen. Appen återspelar aldrig en väntande POST automatiskt.

## Bedöm arbetsflödena

1. Logga in som `hanna.tva`, välj ett uppdrag och öppna samma session i två flikar. Byt uppdrag i den ena fliken. Den andra fliken ska låsas och verksamhetsinnehållet rensas.
2. Logga in som `anna.admin`. Kontrollera att en personbunden inbjudan visar mottagare och kund och att spärrdialogen namnger personen, kunden och följden. Slutför en känslig åtgärd först efter TOTP-step-up.
3. Logga in som `bertil.granskare`, öppna **Granskarlogg** och kontrollera att händelserna hör till rätt kund. CSV-exporten ska fungera och själv skapa en spårbar exporthändelse.
4. Bedöm smal telefonvy och tangentbordsfokus. Den automatiska kontrollen använder WebKit/telefonvy. En fysisk telefon är ännu inte bevisad, eftersom localhost-issuer och origin först måste göras nåbara och provas separat.
5. Logga ut. Inget tidigare verksamhetsinnehåll ska ligga kvar.

## Kör den samlade fasgrinden

```bash
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
cd web
npm run verify:phase2
```

Resultatet skrivs till `work/pilot/results/phase2-summary.json`. PASS kräver färska modell-, typ-, lint-, bygge-, fas 1-browser-, databas-, isolerings-, åtkomst- och protected-browserbevis från samma Git-revision och samma källfingeravtryck. `--skip-browser --out /tmp/phase2.json` ger högst PASS-PARTIAL och kan inte skriva över fullrapporten. BLOCKED beskriver vilken lokal miljö som saknas; det är aldrig ett godkännande.

| Krav | Färskt bevis i rapporten |
|---|---|
| IAM-01 | Personbunden engångsinbjudan, fel subject/issuer, utgången/replay och samtidig inlösen |
| IAM-03 | Uppdragsgiltighet, verklig kundmetadata samt kontextbyte och race-skydd |
| IAM-04 | Sessionslivstid, utloggning, flikrensning och IdP-bortfall |
| IAM-05 | Spärr, avslutat uppdrag och profilbundet MFA-bevis med samtliga negativa underfall |
| ACL-01 | RLS/constraints, främmande ID, kundbegränsad logg/CSV samt stängd PostgREST/GraphQL/Storage |
| AUDIT-01 | Serverhärledd aktör/uppdrag, oföränderlig logg, export, flödningsskydd och rollback vid loggfel |

Sparordningsreproduceraren körs separat och redovisas som `KNOWN-ISSUE`, ägd av fas 5. Den etiketten får inte användas för nya regressioner och betyder inte att felet är löst.

Efter en grön automatisk körning återstår användarens bedömning och en separat GSD-verifiering. Rapportens PASS ändrar inte kravstatus till **Verifierad**.
