---
created: 2026-10-07
title: Tjänstefördelning som ersätter Plan Digital
area: tjanstefordelning
status: pending
proposed_requirements: [TJANST-01, TJANST-02, TJANST-03, TJANST-04, TJANST-05, TJANST-06]
related_requirements: [GROUP-01, SCHEMA-01, SCHEMA-08, LLEG-03, PLANERING-05, ACL-02, ACL-04]
phase: "05.1 — infogad fas, användarbeslut 2026-10-19"
files:
  - .planning/research/PLAN-DIGITAL-ERSATTNING-2026-10-07.md
  - .planning/research/SCHEMAMODUL-PROJEKT.md
  - docs/plan-digital-lasarsmodell.md
  - web/lib/timplan-model.ts
  - web/lib/lasar-model.ts
  - web/lib/access-rules.ts
---

## Användarbeslut

2026-10-07: Skolplattformen ska helt ersätta Plan Digital. LBS är första användare. Kommunpiloten är inte bunden av avtal och ska inte fördröja bytet. Tjänstefördelningen är därmed ett måste för bytet, inte en v2-funktion. GROUP-01 behöver därför flyttas eller delas vid omplaneringen.

## Förslag på krav (formulering bekräftas vid omplaneringen)

- **TJANST-01**: Behörig personal kan skapa och ändra tjänsterader per läsår: kurs × klass × lärare × tid per termin, med exakt timplansversion som källa. Persondata i raden är lärarens interna ID, inte personnummer.
- **TJANST-02**: Specialuppdrag (till exempel programansvar, mentor, speciallärare) kan läggas med egen tid och skiljs från undervisningsrader.
- **TJANST-03**: Samläsning och blandgrupper är en egen relation mellan rader, inte en särskild radtyp.
- **TJANST-04**: Läsårets och planens status följer en kedja med roller: utkast, rektor granskar, godkänd av huvudmannens representant, publicerad. Ändring efter godkännande kräver återställning med spår. Detta knyter till [todo 2026-10-06](2026-10-06-rektor-fardigmarkerar-och-huvudmannen-godkanner-planarbete.md).
- **TJANST-05**: Läraren ser sin egen publicerade tjänst via inloggning och kan registrera undantag enligt förordningen (se TID-06).
- **TJANST-06**: Årsrutiner: förläng tjänstefördelning från föregående läsår, flytta tjänst mellan personer, massregistrera.

## Ordning och beroenden

1. Gemensam statusmodell för läsår och plan, och identitets-/periodkontraktet (SCHEMA-01, PLANERING-05).
2. Samläsning som egen relation i datamodellen.
3. Tjänstefördelning, första versionen (TJANST-01–03).
4. Lärares tid enligt förordningen ([todo](2026-10-07-lararens-undervisningsuppdrag-enligt-sfs-2026-1487.md)).
5. Lärarregister (LLEG L1–L2), för behörighetsmarkering.
6. Schema i appen (SCHEMA-01–08).

Tjänstefördelningen behöver skola, klass, kull, timplan, lärare och mandat. Den behöver inte elevregister, registerimport (fas 6) eller kommunanslutning (fas 7) och kan därför ligga före dem. Fas 5:s UI-delar (05-39–43) hindrar inte arbetet med modell och kontrakt.

## Öppna beslut

- Roller: får arbetslagsledare och utvecklingsledare föreslå rader eller bara se? Ska huvudmannen godkänna varje skolas tjänstefördelning eller räcker rektors beslut? Får läraren kommentera sin tjänst?
- Hur samverkan med fackliga parter ska synas i flödet innan publicerad låses. Kontrollera med HR eller juridik. Ingen ställning är tagen.
- Vilka tidsslag en rad ska bära. Förslag: planerad tid, schemalagd tid (ur schemat) och, när det finns, genomförd tid hålls isär. Arbetstid enligt Plan Digitals modell (en siffra per rad) är inte automatiskt rätt; se förordningsunderlaget.

## Verifieringsmål

- En behörig rektor kan skapa, ändra och läsa om en tjänstefördelning för en skola och ett läsår. Annan skola, annat läsår och annan kund nekas på servern, även via direkt anrop.
- Samlästa rader visar rätt tid för varje lärare utan dubbelräkning.
- Statusbyten loggas med aktör och tid. Ändring efter godkännande nekas utan återställning.
- Läraren ser bara sin egen tjänst och inget annat.
- Dator- och telefonprov och handbokssida ingår i planen.

**Status: pending.** Användarbeslutat behov. Omplanering, implementation och verifiering återstår. Ingen ny körning eller kravverifiering följer av registreringen.
