---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "42"
status: completed
scope: local-synthetic-only
completed: 2026-10-08
verification: passed
---

# 05-42 — GR/IM i årsplaneringen

Avgränsat **PASS**: samtliga O01–18 på dator och telefon passerade i en enda färsk fullkörning. ROOT42476 observerade känd exit0; ingen sammanfogning av delprov eller ommärkning av historiska rapporter. Framsteg87/100 planer och3/8 verifierade faser; nästa05-43. Detta är en isolerad lokal miljö med syntetiska uppgifter, ingen verklig kommunanslutning eller godkänd pilot.

## Verifierat användarbeteende

GR-årsraden öppnar exakt klassbunden fastställd v1 för åk8/9 även när v2-utkast finns. Klass/bindnings-ID/skola/version/kolumn-ID bevisas, men den historiska originalkartan är fortfarande okänd. Vyn visar därför lagrade positioner, okända årstimmar och historisk skrivspärr; dagens grades/reordering får inte bli ett historiskt indexbevis. O01/O02/O04/O06 passerar på båda enheterna.

Saknad framtida årsbindning visas som lucka, inte noll. IM behåller veckotid: sju tvåtimmarsrader inklusive mentor ger14 timmar per vecka. MentorNULL/fullmatris400 blir saknat underlag, aldrig0 eller påhittade årstimmar. O03/O09/O10/O11/O18 passerar; sjunde O10-bilden visar färdigladdade sju rader, till skillnad från äldre sjätte bildens inläsning.

GR/IM delar verkligt planeringsår/skolurval och serverstyrd lista:50+2, sökning även efter första sidan, sortering, URL/Back/reload och exakta mandat. Rektorns all-schoollista innehåller52 behöriga GR-rader, inte en annan rektors skola. Uttryckligt aktuell utkastmatris är dagens indexsemantik, inget historiskt årsbevis; omladdning kräver faktisk årsbindning/nytt uttryckligt val. Cellskrivningen bevarar v1 och andra originalkolumner, använder originalindex1/rätt plan/revision/MFA och faktisk serveraudit. HM/admin/annan rektor nekas enligt mandat. Hållet och okänt sparbesked spärrar år/skola/Back tills kvittens/återläsning; O05/O07/O08/O09/O12–18 passerar på båda enheterna. Modalens native selectOption är ett kontextguardprov, inte pekaråtkomst bakom dialogen.

## Slutliga bevis

| Bevis | Faktisk referens/resultat |
|---|---|
| Färsk full O36 | `work/pilot/results/phase5-42-other-actual-seventh-20261008.json` · SHA `c39fa94964b254adaa7f141c1d6dd8b5b091b3e50334653af31233092dffa901` · ROOT42476 exit0 ·36/36 |
| Källa/spec/byggd Worker | `ac41d6c3ed9cdd9977bee6a9207fa30a146ad165` / `93c6b4e06eca6563059b9cb5f877a818a44ba9b553e6ee184125969998b0e639` / `17924ff417899dd5863c394bb4496a5bf22865bd` |
| Slutlig ROOT-filreader | ROOT74755 exit0/chunk83c5f8; full49/241/source20/parser2, fyra föregångarkedjor,36 normalcleanup/original15/sexflaggor/egna16/foreignDDL0 |
| Audit-/identitetsterminal | audit197363 / `114cc50cea808c5094a0d018a16a558e4a2ea692b1b6b6d1b5bef3b48ff6a066`; auditerade identiteter5387 / `3ebcec8704b6c90bfda0af01120bcba4b9d5f355542bf0097f674b96de9528a2` |
| Genuina sjunde pre/during | launch8403b92e; during1298daca; Gitinventering16a561e8; fullsource/build300 +180 tillåtna artifactfiler/inventory3b5af3de |
| Pixel-/geometrigranskning | `work/pilot/results/phase5-42-seventh-root-pixel-file-review-20261008.json` · SHA `6078ddc27d830c4da1aab69f398b76fac78bfcef814a67fb6d3f57843dc66527` ·16 geometrier/16 PNG/14 unika ROOT-granskade |
| Oberoende full FILE- och målgranskning | `work/pilot/results/phase5-42-seventh-independent-full-file-review-20261008.json` · SHA `281713e9082cb51ecae6d61559df54c1660b5f62cae9cfcf5e81bb8df75867cc` ·PASS utan blockerare/3 av3 mål |

Ingen målprocess observerades eller kördes av dokumentförfattaren; ROOTs faktiskt kända exit och befintliga råartefakter används. Aktuell source241 och skyddade49 är identiska med bevarat bygge179; inget nytt appbygge gjordes för provlocatorrättningarna. Historisk C16, separat C04, L36 och G38 behåller egna rapporter/byggen; de märks inte om till sjunde O36.

## Bevarad återställning och felhistorik

V3 läsförkontroll ROOT12636 exit0 (completion17da2431/reservedb5e71f1c) före separat ROOT96917 apply exit0 (completion198ca4e5/reserved4d070944); faktisk commit/postcommit/DB-/filstängning och oberoende501eecd4 bevarad.13 egna sessioner till0, endast sjätte egen4991e99e-graf städad,111 egna audithändelser/fyra ankare kvar, foreignaudit0. Original15 exaktSEARCH/katalog/råACL28/ALL audit/identiteter/staff/sju äldre grafer bevarade före/efter/postcommit. V1/V2-förkontrollFAIL7669/7099 och cbdb/a085 består; felaktiga fast81 och created_at mot occurred_at ändrade bara recoverydiagnosen.

Första sex fullförsök är fortsatt FAIL: e72d4722 setup/missing bound staffunit;60447dad årsbytets transienta lista;769bda9c rektors mandatförväntan;1fc39150 fel standardconfig/0 suites;7e72e016 O14 två seen GET/deferred;05643d1d O15 modal-locator/seen POST/deferred. Samtliga egna stopp/recoveries, historiska original-/retainedgrafer, första NoTestsFound802588d5 och avgränsat O14fe3e39fb respektive O15/O16d469e07c bevaras; delproven ersätter aldrig full36. PLAN/STATEs tidigare bytes under historikrader är kvar.

## Bild- och verksamhetsgränser

- Telefon O01/O05/O08/O10 visar fokushopplänk över sidtext. O05 visar också svag dialogtext efter sparningen. Orsaken är inte fastställd; bilderna bevisar inte en felfri eller stabil slutbild.
- Modalens överordnade kontextprov använder native selectOption och bevisar inte pekaråtkomst bakom en öppen dialog.
- Grundskolans Visa årskurs är fortfarande en dropdown. Gymnasiets årskursknappar verifierades i föregående plan.
- Proven använder en isolerad lokal miljö och syntetiska uppgifter. Formell färdigmarkering och huvudmannens godkännande är fortfarande en öppen lucka.

Grundskolans dropdown innebär att användarens mobilönskemål inte påstås löst för alla skolformer. Fulla PLANERING-/ADMIN-02/03/04-krav, hela fas5, yrkesram05-17, historisk05-22 metadataPARTIAL, klassskapande/nya årsbindningar/elevflytt och formella beslut är fortsatt öppna. Rektors färdigmarkering/HM-godkännande införs inte av05-42.

Nästa [05-43](05-43-PLAN.md): separat FinalC16 på samma sista prövade artifact, samlad läsande release, exakt kontrollerad3012-transfer/före-efter18 och därefter konkret mänskligt prov. ROOT har separat byggt den granskade handboken (64057 exit0/chunk993043); det avslutar inte43. SlutC/release/3012/mänskligt svar är fortfarande PENDING. Awaiting_user får användas först när den konkreta leveransen är verifierad.
