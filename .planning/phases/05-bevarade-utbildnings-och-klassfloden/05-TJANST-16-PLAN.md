---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-16
type: execute
wave: 11
depends_on: ["TJANST-10A","TJANST-11","TJANST-12","TJANST-13","TJANST-14","TJANST-15A"]
files_modified: ["web/app/protected-home.tsx","web/app/tjanst-workspace.tsx","docs/handbok/tjanstefordelning.md","docs/handbok/mandat.md","docs-site/sidebars.js"]
autonomous: true
status: planned
must_haves:
  truths: ["Huvudmannen kan välja avtal och följa upp; rektor kan fördela, bedöma och fastställa inom rätt skola.","Lärare med eget mandat kan öppna Min tjänst utan undervisningsgrupp eller elevåtkomst.","Användaren hittar begriplig hjälp om avtal, arbetstid och beslutsansvar."]
  artifacts: ["web/app/protected-home.tsx","web/app/tjanst-workspace.tsx","docs/handbok/tjanstefordelning.md","docs/handbok/mandat.md","docs-site/sidebars.js"]
  key_links: ["Exakt versionsbundet underlag → verifierat beteende → redovisad provnivå"]
---

<objective>
Koppla ihop tjänsteflödet och dokumentera verifierat användarbeteende. Omfattar TJ1-01–10 med särskilt fokus på TJ1-06/09/10. Ingen full kommunanslutning eller fullständig fasacceptans följer av paketet.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-10A-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-11-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-12-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-13-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-14-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-15A-SUMMARY.md

</context>

<tasks>
<task type="auto">
<name>Anslut alla färdiga vyer till skyddad navigation</name>
<files>web/app/protected-home.tsx; web/app/tjanst-workspace.tsx</files>
<action>Inventera senaste protected-home och session/context-kontrakt från07A. Anslut slot-komponenterna från10–15A i en sammanhängande Tjänstefördelning: personal, avtalsgrund, fördelning, bedömning, Min tjänst, huvudmannens uppföljning och årsrutiner. Skola och läsår ska återanvända etablerad kontext för administrativa roller. Egenvy får separat kontrakt som inte kräver administrativa planning-context-rättigheter. Starta larare+self i Min tjänst och dölj Elever för self; gruppmandatets befintliga elevväg bevaras. Ingen klientroll skapar rättigheter. Scopebyte, Back/reload, dirty och okänt skrivutfall passerar samma journal. Montera inga ofärdiga flikar. Huvudmannen får uppföljning utan fastställandeknapp och läraren ser endast publicerad eller uttryckligt delad dialogversion.</action>
<verify>Från web: npx tsc --noEmit; npx oxlint app lib; relevanta tjänst- och mandat-Nodeprov samt samtliga tjanst-preview-browserprov. Kontrollera menykontrakt för HM/rektor/administratör/grupplärare/selflärare. Därefter npm run build enligt etablerat protected-byggläge; bevara artefakten till17.</verify>
<done>Samtliga ingångar använder verkliga skyddade API:er och rätt serverkontext; inga simulerade svar finns i produktkopplingen.</done>
</task>

<task type="auto">
<name>Skriv användarhandbok och bygg dokumentationen</name>
<files>docs/handbok/tjanstefordelning.md; docs/handbok/mandat.md; docs-site/sidebars.js</files>
<action>Beskriv faktisk arbetsgång, huvudmannens val mellan avtalsprofiler, version/giltighet, rektors individuella skäl och fastställande, lärarens dialog/kvittens/initiativ, reglerad tid/förtroendetid, samläsning, mentorskap och kopiering. Förklara att avtalsmall inte bevisar tillämplighet och att 2027-regler före ikraftträdandet är framtidsscenario. Visa saknat schemaunderlag som begränsning och skilj budget/schema/utfall. Dokumentera endast färdigt beteende; tekniska kontrakt, SQL, GSD och testkonton hör inte hit. Länka från användarens mandatstöd och handboksnavigation.</action>
<verify>Från roten: npm run docs:build. Granska den byggda sidans navigering, rubriker, länkar och mobilbredd. Kontrollera dokumentets påståenden mot16-kopplingen och markera kvarvarande begränsningar.</verify>
<done>Handboken förklarar uppgiften utan att utlova faktisk schemauppföljning, extern SS12000-anslutning eller generell juridisk prövning.</done>
</task>
</tasks>

<verification>
Inventera berörda filer vid start och följ kontraktets SS 12000-mappning, aktuella mandat, sekretess och okändsemantik. Tidigare PASS ersätter inte kontroller av nya ändringar.
</verification>

<success_criteria>
- Huvudmannen kan välja avtal och följa upp; rektor kan fördela, bedöma och fastställa inom rätt skola.
- Lärare med eget mandat kan öppna Min tjänst utan undervisningsgrupp eller elevåtkomst.
- Användaren hittar begriplig hjälp om avtal, arbetstid och beslutsansvar.
- Resultatets nivå och begränsningar är dokumenterade; pilotens äldre acceptans skrivs inte om.
</success_criteria>

<output>
Skriv 05-TJANST-16-SUMMARY.md och uppdatera paketets implementeringsöversikt/verifieringsmatris med faktiska resultat. Genomför avgränsad commit/push enligt projektreglerna.
</output>
