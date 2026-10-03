# 05-18 — Fördela programplanens poäng över årskurs och termin

Datum: 2026-10-03. Källa: användarens nya todo och instruktionen ”lös den nya todon. gör det jävligt snyggt!”. Tidigare frågor om delegation och timplansskapande är separata beställningar.

## Beslut och avgränsning

- Programplanens nivåer ska kunna fördelas uttryckligen i poäng över sex terminer: åk 1 HT/VT, åk 2 HT/VT och åk 3 HT/VT. En nivå kan läsas över flera terminer. Poäng är inte undervisningstimmar.
- Heltal ≥0, högst nivåns/ramradens poängsumma. Ofullständig fördelning är tillåten i utkast och visas med återstående poäng. Ingen automatisk fördelning eller dubblering.
- Fördelningen tillhör exakt programplansversion. Fastställd/ersatt plan kan läsas men inte ändras. Versionskloning bevarar fördelningen som självständig kopia.
- Redigerbara rader härleds från exakt katalog-/ämnes-/nivåversion: icke alternativa fasta nivåer och planens valda programfördjupning. Individuellt val (200 p) och gymnasiearbete (100 p) är uttryckliga ramrader, inte påhittade ämnesnivåreferenser. Alternativa ämnen och ämnen utan upplösta nivåer visas som kvarstående underlag; tidsinmatning väljer inte ämnen åt användaren.
- Arbetet sker i den befintliga sammanhängande programplansvyn, med tydlig terminsöversikt och radvis inmatning som fungerar på dator och telefon. Verksamhetsnamn, poäng och årskurs/termin ska bära gränssnittet.
- Nuvarande servermandat för huvudman och rektor bevaras. Admin och HM:s uttryckliga delegation kräver separat pending todo. Godkännande/fastställande och skapande av timplan från fastställd programplan levereras separat; denna fördelning blir deras versionsbundna underlag.

## Aktuell kod, återanvändning och risker

Discovery nivå 0: lokal förlängning av befintlig arkitektur, inga nya beroenden. Kod läst 2026-10-03: `programplan-catalog.ts`, `programplan-contract.ts`, `programplan-table.ts`, `server/programplan-planning.ts`, `protected-programplan-workspace.tsx`, `protected-programplan-sheet.tsx`, katalog-/utkastmigrationer och aktuell SQL/API/browserharness.

`basis_reference` är strikt låst utom `specializationRefs`. Använd en separat JSONB-kolumn `point_plans.term_distribution`, default `[]`, och separata läs-/sparkommandon/API. Befintliga `parseProgramplan` och `phase5_programplan_result` behåller sitt kontrakt. `phase5_programplan_actor/scope/session_check` återanvänds med deras låsordning och uppdaterade mandatkontroll efter låsväntan. Nuvarande actor tillåter HM/rektor, inte administratör.

SQL-resolvern returnerar diagnostik, inte upplösta nivåer. SQL-radhelper måste därför läsa den pinade oföränderliga katalogprojektionen efter framgångsrik resolvervalidering; samma radnycklar och ramar ska ha TS/SQL-paritetsprov. `programplan-table.ts` visar även oavgjorda alternativ och saknar subjectVersion i sina tabellrader; dessa är inte ett validerat skrivunderlag.

Borttagning av fördjupningsnivå med sparad terminsfördelning nekas av SQL tills användaren uttryckligen rensat och sparat just den radens fördelning. UI visar vilka poäng som behöver rensas; kvarvarande rader och gamla planversioner bevaras. Vid samtidiga ändringar måste ny fördelning avvisas med revisionskonflikt. Kloning behöver explicit kopiering av nya kolumnen, som gamla SQL-insert annars lämnar tom.

## Verifieringsgräns

SQL, verklig Worker/API och dator-/telefonbrowser ska prövas med syntetiska uppgifter på verifierat protected-mål. Inget av detta ersätter mänskligt begriplighetsprov, nationellt beslutsflöde eller godkänd verklig anslutning. ADMIN-02 och fas 5 förblir öppna tills återstående beteenden har verifierats.
