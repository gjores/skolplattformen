# Skolplattformen — projektvägledning

## Projekt och aktuell inriktning

Detta är en befintlig svensk skolplattform, inte ett tomt projekt. Läs `.planning/PROJECT.md` och `.planning/STATE.md` när du fortsätter planerat fasarbete. Första milstolpen är säker administration inför en pilot. `.planning/REQUIREMENTS.md` och `.planning/ROADMAP.md` anger detaljer och godkännandestatus; ett förslag får inte behandlas som beslutad leverans.

Användaren godkände de 42 detaljkraven och färdplanens åtta faser 2026-09-11. Återfråga inte detta godkännande. Genomförande och verifiering återstår; aktuell fas och nästa steg finns i `.planning/STATE.md`.

## Arbeta inom GSD

- Utgå från `.planning/codebase/` och verifiera berörd kod innan förändring. Äldre research och byggstatus beskriver inte automatiskt nuläget.
- Vid fasarbete: klargör avsikt och val med `gsd-discuss-phase`, skriv genomförbara planer med `gsd-plan-phase`, genomför med `gsd-execute-phase` och kontrollera användarbeteende med `gsd-verify-work`. Dokumentera resultat och kvarstående luckor i GSD-filerna.
- Varje aktivt krav ska kunna följas till en fas och ett verifieringsresultat. Markera inte ett simulerat integrationsprov som en riktig kommunanslutning.
- Dela större ombyggnader i kontrollerbara förändringar. Bevara gymnasiets utbildningsflöde, kurs-/nivåtillägg, kopiering till nästa elevkull och explicita klass–timplanskopplingar.
- Hantera vanlig dialog, statusfrågor och avgränsade rättningar proportionerligt. Ställ inte frågor som användaren redan har besvarat. Senare användarbeslut går före dokumentförslag.
- Versionshantera avgränsade ändringar och uppdatera planeringen när omfattningen ändras. Blanda inte in andra pågående ändringar i en commit.

## Löpande push till GitHub

- Användaren har 2026-09-28 godkänt löpande push till `origin` (`gjores/skolplattformen`). Pusha aktuell arbetsgren efter varje färdig och relevant kontrollerad GSD-plan, efter avslutad våg och innan arbetspasset avslutas när det finns nya commits. Nytt godkännande behövs inte för dessa pushar.
- Vid längre arbete: sikta på högst cirka en timme mellan pushar när nya kontrollerade commits finns. Pusha vid nästa naturliga delsteg; skapa inte ofärdiga commits enbart för att hålla intervallet.
- Kontrollera vilka commits som ska skickas. Ta inte med orelaterade arbetskopieändringar, hemligheter eller personuppgifter. Pusha bara aktuell gren, utan force-push eller automatisk publicering/driftsättning.
- Verifiera efter push att fjärrgrenen har avsedd commit. Vid nätverks-/behörighetsfel eller avvikande fjärrhistorik: bevara lokalt arbete och redovisa vad som ännu inte är pushat; skriv aldrig över fjärrhistorik för att få igenom överföringen.

## Struktur och kontroller

### Dokumentation med Docusaurus

- Handbokens källor finns i `docs/handbok/`, Docusaurus-appen i `docs-site/`. Kör `npm run docs:install`, `npm run docs:dev` och `npm run docs:build` från projektroten.
- Docusaurus ska enligt användarbeslut 2026-09-23 endast innehålla användarinstruktioner och regler i systemen. Vid ändrat användarbeteende ska GSD-planen omfatta berörda handbokssidor och dokumentationsbygge. Tekniska API-kontrakt, driftanvisningar, GSD-processer och projektstatus hör till interna repodokument. Ange verifierat beteende och begränsningar.
- Bara granskad handbokstext byggs. Importera inte `.planning/`, testkonton eller privata miljöfiler automatiskt. Publicering kräver separat beslut.

Paketrot är `web/`; projekt- och GSD-rot är katalogen ovanför. React/TypeScript med Vinext/Vite används för appen. Domänmodeller ligger i `web/lib/*-model.ts`, datalager i `*-store.ts`, vyer i `web/app/` och databasmigrationer i `supabase/migrations/`.

Kör relevanta kontroller i `web/`: `node --test lib/*.test.mjs`, `npx tsc --noEmit`, `npx oxlint app lib` och `npm run build`. Anpassa kontroller till ändringen; en dokumentändring kräver inte en ny appbyggnad. Vid UI-ändring prövas berört användarflöde på dator och telefon. Tidigare passerade tester är historik, inte bevis för nya ändringar.

## Identitet, data och integration

- `signInDemo` och `bootstrap_demo_profile` ger demobesökare huvudmannarättigheter. De får inte användas med verkliga elevuppgifter eller i pilotens skyddade driftvägar.
- Huvudmannen utser rektor. Rektor tilldelar läraruppdrag inom sina aktuella skolenheter. Kontrollera verkliga mandat på servern och relevanta datavägar; klientens rollval är inget behörighetsbevis.
- Hemligheter och personuppgifter ska inte skrivas i Git, planeringsdokument eller felsökningsutdata. Rootens och webbappens ignorefiler skiljer lokal konfiguration från källor.
- Granska `work/supabase/`-skript före körning; flera skriver till ansluten databas och `reset.mjs` raderar demodata. Använd avsedd isolerad testmiljö.
- Skolverkets uppslag verifierar skoluppgifter, inte rätten att företräda en huvudman. Elevregisterintegration behöver eget källansvar, kontrakt och behörighet.
- `.planning/research/PITFALLS.md` innehåller preciseringar av offentlighetsförslaget i `docs/kommunintegration-och-sakerhet.md`. Härled inte automatisk rättslig klassning, publik webbpublicering eller fasta projektdeadlines ur det äldre förslaget.

## Kommunikation

Skriv på svenska med tydliga verksamhetsord. Beskriv vad användaren kan göra, vad som faktiskt är verifierat och vad som återstår. Förslag, implementation, test mot syntetiska data och godkänd verklig anslutning är olika status.

*Skapad vid GSD-initiering 2026-09-10; senast uppdaterad med löpande GitHub-push 2026-09-28.*
