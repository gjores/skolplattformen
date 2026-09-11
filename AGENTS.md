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

## Struktur och kontroller

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

*Skapad vid GSD-initiering 2026-09-10; uppdaterad efter godkänd färdplan 2026-09-11.*
