---
created: 2026-10-25
title: Klick på kurs/ämne visar alla likadana behov för enkel samläsning
area: tjanstefordelning
status: pending
phase: "05.1"
source: användarprov etapp 2 (3012, kandidat 1eb5467)
---

# Användarönskemål

I matrisen visas varje behov med kursnamn och ämnesrad, till exempel *Engelska – Nivå 1* (ENGE1000X) och *Historia – Nivå 1a1* (HIST1A10X). Användaren vill kunna klicka på kursen eller ämnet och komma till **alla likadana behov på skolan** för läsåret, så att det blir lätt att se vilka klasser som läser samma kurs och skapa en samläsning av dem.

# Att göra

- Gör kursnamnet till en åtgärd som filtrerar eller öppnar vyn *Per kurs/ämne* för samma kurs (samma kurskod eller ämnesrad, inte bara samma namn). Den ska visa varje klass behov, fördelat, lärare och befintliga samläsningar.
- Därifrån ska användaren kunna markera behov och starta **Samläsning** med dem förvalda, med samma regler och förhandsvisning som i dag och utan automatisk samläsning.
- Matcha på stabil identitet (kurskod och nivå från timplanens källrad). Samma namn på olika kurser eller nivåer ska inte slås ihop. Alternativa rader som Svenska/SVA hanteras enligt todo [valbara-kurser-som-undervisningsgrupper](2026-10-25-valbara-kurser-som-undervisningsgrupper.md).
- Fokus, tangentbord och tillbakaväg till cellen. Handbok: *Matris och vyer* och *Samläsning*. Pröva på dator och telefon (läsläge).

Registrerad som backlogg enligt användarens önskemål. Ingen ändring är gjord.

## Löst 2026-10-26

Åtgärdat i [05.1-27](../../phases/05.1-tjanstefordelning/05.1-27-SUMMARY.md) och provat med simulerat UI och faktiskt prov på kandidat 2da6f1e. Ännu inte installerat på 3012. APL-perioder (veckor) jämförs först i schemaläggningen.
