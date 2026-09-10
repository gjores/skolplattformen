# Conventions

Kartlagt 2026-09-10.

- Svensk verksamhetstext och felmeddelanden. Roller använder interna värden `huvudman`, `rektor`, `administrator` och `larare`.
- Domänmodeller skiljs från Supabase-lager och React-vyer. Behåll den separationen när sessionsdata ersätts med lagring.
- Många ändringar använder optimistisk vyuppdatering följd av skrivning och omläsning. Bevara skolval och hantera konkurrerande svar uttryckligen.
- Fastställda planer är versioner; kopiering till ny kull ger nya utkast och ärver inte gamla beslut eller elevmedlemskap.
- Databasändringar uttrycks i daterade SQL-migrationer. Appliceringsstatus ska verifieras separat; en fil bevisar inte att migrationen körts.
- `database.types.ts` genereras utifrån schemat. Modeller och klienttyper ska hållas förenliga.
- Större arbetsytefiler och global CSS finns redan. Föreslå avgränsade uttag när nya ansvar införs, inte en orelaterad total omskrivning.
- Daterade researchdokument är källunderlag; deras rekommendationer och juridiska resonemang kräver granskning innan de blir programregler.
