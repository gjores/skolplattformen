---
created: 2026-10-25
title: Fördelat vid samläsning summerar hela gruppen
area: tjanstefordelning
status: pending
phase: "05.1"
source: användarprov etapp 2 (3012, kandidat 1eb5467)
---

# Användarrapporterat problem

Under användarprovet av etapp 2 rapporterade användaren att *Fördelat* blir missvisande för samlästa rader: "Den adderar ihop allt så det ser ut som att det ska läggas ut så många timmar."

Skärmbilden gäller Syntetisk skola 11 och raden *Svenska – Nivå 1 / Svenska som andraspråk – Nivå 1* i BF27-TEST, märkt **Samläsning**:

- **Behov:** 84 h 28 min
- **Fördelat:** 174 h 28 min
- **Avvikelse:** +90 h (varning)
- **Kalle Knas cell:** 84 h 28 min (samläsningssymbol)
- **Klassraden:** 174 h 28 min av 84 h 28 min

Läraren har alltså lagt ut precis behovet, men raden ser överfördelad ut med 90 h.

# Trolig orsak (inte verifierad)

`coverage()` i `web/lib/tjanst-model.ts` lägger för en samläst rad till **all lärartid i samläsningsgruppen** (`joint.teachers`) på den medverkande klassens behov. Tid som hör till gruppens andra medlemmar eller lärare, här sannolikt 90 h, räknas då in i den här klassens *Fördelat* och avvikelse. Det kan också slå igenom i klassradens summa och i skolans *Ej fördelad tid* (`schoolSums`).

# Att reda ut och åtgärda

- Bestäm vad *Fördelat* ska betyda för ett behov i en samläsning: lärartid som täcker just den klassens behov, med gruppens tid räknad en gång per klass och inte som gruppens summa. Lärarens egen summa ska fortfarande räkna grupptiden en gång (D-beslut för samläsning).
- Kontrollera datan för den aktuella gruppen läsande: vilka rader och lärare som ingår, och var de 90 h kommer ifrån.
- Rätta täckning, avvikelse, klassrad, fotrad och bemanningens *Ej fördelad tid* konsekvent. Lägg till modelltester för en grupp med flera lärare och flera klasser med olika behov.
- Stäm av handboken (*Samläsning*, *Matris och vyer*) mot det rättade beteendet.
- Pröva på dator och telefon, och låt användaren bedöma vyn igen.

Registrerad som backlogg enligt användarens önskemål under pågående användarprov. Ingen rättning eller verifiering är gjord med denna notering.

## Löst 2026-10-26

Åtgärdat i [05.1-26](../../phases/05.1-tjanstefordelning/05.1-26-SUMMARY.md) och provat med simulerat UI och faktiskt prov på kandidat 6b1a906. Ännu inte installerat på 3012.
