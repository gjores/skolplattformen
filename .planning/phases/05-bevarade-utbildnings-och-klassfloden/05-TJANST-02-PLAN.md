---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-02
type: tdd
wave: 1
depends_on: []
files_modified: ["web/lib/tjanst-avtal.ts", "web/lib/tjanst-avtal.test.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
gap: TJANST-T1T2
must_haves:
  truths: ["Huvudmannen kan tillhandahålla flera avtalsprofiler med olika giltighet och lokala tillägg.", "Rektor ser hur varje tidsram beräknats och vilka uppgifter som saknas.", "Gymnasiets grundnivå räknas som120 procent utan dubbel deltidsanpassning eller automatisk avräkning av förtroendetid."]
  artifacts: ["web/lib/tjanst-avtal.ts", "web/lib/tjanst-avtal.test.mjs"]
  key_links: ["Avtalsversion + lokal överenskommelse + period → granskningsstatus och individuell ram", "Separat lagprofil + faktisk undervisningskategori → tillämpliga gränser", "Rationell beräkning → uppåtrundat minimum/nedåtrundat maximum först i slutresultatet"]
---

<objective>
Bygg versionerade avtals-/lagprofiler och spårbar tidsberäkning. Profilval ska stödja faktiskt tillämpliga avtal och får inte bli en genväg till större tjänsteutrymme.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/TESTING.md
@.planning/research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
</context>

<tasks>
<task type="auto">
<name>1. Kontrollera profilkällor och skriv beräkningens RED-matris</name>
<files>web/lib/tjanst-avtal.test.mjs</files>
<action>Kontrollera före kodning aktuella originaltexter för SFS2026:1487, HÖK25/BilagaM och Almega Friskoleavtalet samt datum/version i researchen; lag- och avtalskällor är inte statiska. Dokumentera källor och tillämpningsgräns i02-SUMMARY, inga nya antaganden som granskade regler. Skriv modellprov:500 undervisningstimmar ger600 planeringstimmar;60procent och heltidsbedömt tak500 ger300 och planeringsgolv360;520 överskrider individuellt tak500 även om nationellt intervall slutar550;450 är nedre gräns för valt tak, aldrig obligatorisk undervisningsmängd. Prova datum före/från1juli2027, allmänna respektive faktiskt yrkesinriktade karaktärsämnen, blandad/okänd kategori, avtalsbyte och saknad fortsatt giltighet2027/28. HÖK:s1767 är kollektivgenomsnitt och får inte bli automatisk individuell total; Almega1807/1360 ska ge annan ram. Prova mentorstid, APT30+30,104 kompetenstimmar inom ramen, förtroendetid som egen dimension, okänd avräkning, semesterprofil och ofullständigt lokalt avtal. Pröva små minutmängder, exakta gränser och stegvis avrundning som annars ger falskt godkänt.</action>
<verify>Från web: node --test lib/tjanst-avtal.test.mjs. Redovisa faktiska RED-resultat och källornas daterade begränsningar.</verify>
<done>Testvektorer skiljer avtal, lag, individuell bedömning och outredd tillämpning.</done>
</task>

<task type="auto">
<name>2. Implementera spårbara regler och två skilda avtalsprofiler</name>
<files>web/lib/tjanst-avtal.ts; web/lib/tjanst-avtal.test.mjs</files>
<action>Implementera den avtalsspecifika kärnan enligt kontraktet, oberoende av01:s implementation så våg1 kan gå parallellt. Ta periodfakta som explicit serialiserat underlag enligt paketkontraktet. Profil innehåller avtalsparter, version, källreferens, giltighet, ferie/semester, granskningsstatus, individuellt/kollektivt mått, beräkningsperiod och lokala överenskommelser. HÖK och Almega är separata källbelagda mallar; huvudmannens aktivering/tillämplighetsbekräftelse för en anställning är en annan sak. Andra avtalsfamiljer kan registreras som ogranskade utan automatiskt grönt besked. Nationell lagprofil hålls separat och kan inte skrivas över av lokalt avtal. Räkna i heltalsminuter med rationell mellanberäkning; miniminivå avrundas konservativt uppåt och högsta tillåtna nivå nedåt först när visat/lagrat heltalsresultat krävs. Summera periodernas exakta delvärden före slutavrundning. Redan deltidsanpassad undervisning multipliceras med120procent utan ytterligare tjänstegradsfaktor. Beräknat minimum är grundgolv; individuell bedömning kan kräva mer. Okänd blandkategori, delårsregel eller avräkning av förtroendetid ger konkret blockerare, inte tyst högsta tak/standardtal. Frys parsers, förklarande beräkningssteg och gemensamma SQL-testvektorer.</action>
<verify>Prov till GREEN; npx tsc --noEmit. Kontrollera att testsviten har minst två faktiskt olika avtalsramar, lokal överenskommelse, gränsdatum, avrundning och ofullständigt underlag utan felaktig godkändstatus.</verify>
<done>Varje resultat kan förklaras med källa, period, indata och beräkningssteg; oklara profiler ger inget automatiskt efterlevnadsbesked.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
I denna tidiga plan prövas endast tillgänglig ren tidsmatematik och kapacitetsdata med syntetiska vektorer. Den fulla SharedAssessmentBasis-kedjan genomförs i03A/06 och verifieras först i09/17, inte som krav på ännu oskapade tabeller här. Senare integrationsfall: gemensam individuell undervisnings-/PU-ram över skolor: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Lokal kravspårning: TJ1-01/05.
Behöver: låsta research-/kontraktsfrågor och ny kontroll av primärkällor. Skapar: rena profil-/regelparsers och testvektorer för03/04/07/09. TID-02/03/04/08; juridisk fullständighet och verklig avtalsanknytning kan inte bevisas av syntetiska tester. Avtal/lag/motivering är interna domänobjekt utanför SS12000:s fullständiga representation; Duty.hoursPerYear får inte förlora skillnaden mellan tidsformer.
</verification>

<success_criteria>
- Minst två källgranskade mallar beräknas olika och har uttrycklig giltighet/tillämpning.
- Ingen profil gör1767 till universell individuell ram eller räknar förtroendetid som extra tid.
- Ofullständiga underlag, blandade uppdrag och avtalsluckor förblir synliga.
</success_criteria>

<output>
Skriv 05-TJANST-02-SUMMARY.md med källversioner, exakta exports, beräkningsfall och kvarstående tillämpningsgränser. Samordnaren hanterar commit/push.
</output>
