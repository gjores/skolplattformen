---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "19"
status: complete
completed: 2026-10-04
requirements-addressed: [ADMIN-02]
requirements-finally-verified: []
---

# 05-19: Sammanhållen programplan

Planen är nu en tabell: ämnen, programfördjupning och sex terminer redigeras på samma ställe. Lägena "Ändra fördjupning", "Granska och spara utkast" och det separata kortet "Årskurser och terminer" från 05-18 är ersatta för underlagsbundna utkast. Servern, dess kontrakt och SQL är oförändrade. Allt är provat lokalt med syntetiska uppgifter.

## Levererat

- **Tabellen** (`protected-programplan-board.tsx`)
  - Överst finns årskurskort. Tabellen har grupper per programdel och kolumner för poäng och Åk 1–3 HT/VT, med summa per termin och status per rad.
  - Klick i en tom termin lägger nivåns återstående poäng där. Siffror kan skrivas, och radens knappar delar nivån på läsåret eller tömmer raden. Föreslå fördelning och Visa bara ofördelade finns ovanför tabellen.
  - Utkastet sparas automatiskt när man lämnar en rad (terms-API med CAS). Osparade rader är gula och ogiltiga rader röda och sparas inte. Vid konflikt finns valen Läs om eller Spara mina värden. Ett tappat svar läses tillbaka utan ny skrivning.
  - Programfördjupning läggs till och tas bort direkt (fördjupnings-API). En fördelad nivå töms först, och ett okänt svar läses tillbaka.
  - På telefon visas en årskurs i taget. Låsta versioner är skrivskyddade.
- **Regler** (`programplan-terms.ts`, `programplan-analysis.ts`)
  - Förslaget följer nivåordningen: programgrund från åk 1, inriktning och fördjupning från åk 2, individuellt val i åk 2–3, gymnasiearbete i åk 3, lika fördelning HT/VT, och ämnen med en nivå läggs där läsåret har minst poäng.
  - Fel: nivå utan terminer, högre nivå före lägre, outnyttjad programfördjupning. Risk: ojämnt läsår (±15 %) och gymnasiearbete före åk 3.
  - Klar för beslut räknas fram: allt fördelat, inga fel och startdatum finns. Statusen visas överst, och kortet "Innan planen är klar" listar vad som saknas.
- **Kopiera till ny utbildning** tar nu med terminsfördelningen. Om det misslyckas står det i beskedet.
- **Handboken** `docs/handbok/programplaner.md` är omskriven efter det nya flödet. Dokumentationsbygget passerar.

## Användarbeslut och tolkningar

- 2026-10-04: UI:t ska vara sammanhållet, och en plan kan inte vara klar förrän fördelning och analys är genomförda.
- Valt utan uttryckligt svar, enligt rekommendation:
  - Utkastet sparas automatiskt per rad.
  - Klar för beslut räknas fram och sparas inte.
  - Förslagsreglerna är de som står ovan.
- Ändring från tidigare analys: outnyttjat utrymme i programfördjupningen är nu fel, inte risk, eftersom eleverna annars inte når programmets poäng.

## Verifiering

| Kontroll | Resultat |
|---|---|
| Node (modell, analys, förslag, server) | 535/535 PASS |
| tsc, oxlint app lib, skyddat bygge | PASS |
| Docusaurus-bygge | PASS |
| Tabellens webbläsarprov (`phase5-terms.spec.ts`, omskriven): klick och autospar, ogiltigt värde, förslag och klar, konflikt, MFA och loggfel, tappat svar, borttagning av fördelad nivå, telefon | 15/15 PASS + 1 avsiktligt hoppad (telefonfallet på dator) |
| Programplanens webbläsarprov (`phase5-programplan.spec.ts`, anpassad till tabellen) | 38/40. Fallen 12 (utloggningens IdP-omdirigering) fallerar på dator och telefon, som före 05-19 |
| Timplanens webbläsarprov (regression) | 20/20 PASS mot samma bygge |

Skärmbilder från dator och telefon är granskade. Telefonens terminskolumner fick fast bredd efter granskningen.

## Kvarstår

- Fastställande finns inte. Klar för beslut är framräknat och sparas inte på servern.
- Yrkesprogrammens totalsumma (2 700/2 800) ägs av 05-17. Där kontrolleras ramen inte.
- Lagrumshänvisningarna i analysen är inte verifierade.
- Utloggningsprovet (fall 12) är fortfarande rött och inte utrett.
- Mänskligt prov av det nya flödet återstår.
