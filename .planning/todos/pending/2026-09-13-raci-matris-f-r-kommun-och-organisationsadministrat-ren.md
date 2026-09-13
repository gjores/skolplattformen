---
created: 2026-09-13T10:40:00.000Z
title: RACI-matris för kommun- och organisationsadministratören
area: auth
files:
  - .planning/phases/02-verifierad-konto-tkomst/02-CONTEXT.md
  - docs/kommunintegration-och-sakerhet.md
  - docs/medicinska-uppdraget-och-kansliga-delar.md
  - .planning/todos/pending/2026-09-12-api-f-r-l-rares-beh-righeter-med-statistisk-uppf-ljning.md
---

## Problem

Användarens formulering: "för kommun eller organisations admin behövs en sjukt bra RECI" — tolkat som **RACI** (Responsible, Accountable, Consulted, Informed). Kundadministratören hos en kommun eller en enskild huvudman behöver en tydlig ansvarsmatris över vem som utför, vem som är ansvarig, vem som hörs och vem som informeras för varje administrativ åtgärd i plattformen — och den matrisen behöver vara **synlig och användbar i appen**, inte bara ett dokument.

I dag finns ansvarsfördelningen utspridd: projektbeslutet "HM utser rektor, rektor tilldelar läraruppdrag", rolltabellen i `docs/kommunintegration-och-sakerhet.md` §2 (huvudman, rektor, lärare, skoladministratör, kommunens IT-administratör, leverantörens support), fas 2:s kundadministratör (D-06, D-12) och granskare (D-13), samt de särskilda gränserna för utlämnande (§6) och elevhälsans medicinska insats. Ingen samlad matris finns, och behörighetsmodellen (identitet → medlemskap → uppdrag → rättigheter) saknar en läsbar spegling som en kommunadmin kan visa för sin organisation, revisorer eller dataskyddsombud.

## Solution

TBD. Riktning:

- **Bygg matrisen ur behörighetsmodellen, inte bredvid den.** Raderna är åtgärder (etablera kund, bjuda in, utse rektor, tilldela läraruppdrag, spärra medlemskap, fastställa timplan/poängplan, koppla klass, registrera handling, pröva utlämnande, exportera logg, ansluta integration …); kolumnerna är funktioner (kundadmin, huvudman, rektor, lärare, skoladministratör, kommunens IT, granskare, leverantörens support). Cellvärdet R/A/C/I härleds från samma regler som servern prövar (fas 2 D-10–D-13, fas 3:s uppdragsmodell), så att matrisen aldrig kan säga något annat än vad appen faktiskt tillåter.
- **Per kund konfigurerbar inom ramar.** Kommunen kan flytta C/I och delegera R inom lagens gränser (t.ex. vem som informeras vid spärr), men A för lagbundna beslut (rektor enligt skollagen 2 kap., huvudmannens fastställande enligt gymnasieförordningen) är låst och märkt med lagrum.
- **Två vyer:** (1) kundadminens matrisvy med filter per skolenhet och funktion, exporterbar för revision; (2) i varje åtgärdsdialog en rad "Ansvarig / Hörs / Informeras" hämtad ur matrisen, så att den som klickar ser vem som blir A och vilka som får besked.
- **Koppla till säkerhetsloggen:** varje loggad händelse bär vilken RACI-rad den föll under, så att granskaren kan fråga "vilka åtgärder utfördes av någon som inte var R enligt matrisen" (avvikelse) — det är det statistiska uppföljningsbehovet från todon om behörighets-API:t.
- **Undantag synliga:** elevhälsans medicinska insats och utlämnandeprövning har egna A som inte följer linjen (verksamhetschef enligt HSL respektive den som prövar handlingen); matrisen ska visa det i stället för att dölja det.
- Hör till fas 3 (uppdragsmodell) eller en egen fas efter den; fas 2 lägger grunden med kundadmin, uppdrag med giltighet och loggen.
