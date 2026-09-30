---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "07"
status: complete
completed: 2026-09-30
requirements: [ADMIN-02]
source_commit: 6922ce79dbd0268bb540ab40dbd492566c79c448
catalog_id: sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace
---

# 05-07 — versionsbundet katalogunderlag för programplaner

En faktisk kodgrund finns nu för gymnasiets programplansunderlag: sluten katalogprojektion, reproducerbart offlineartefakt, strikt referensresolver och serverintern integritetsvalidator. Ett exakt program, ämne och nivå binds till känt kataloginnehåll och uttrycklig utbildningsstart. Okänd inriktning, fel version/poäng, saknad historisk version eller saknat startunderlag stoppas utan senaste-version-reservvärde.

Detta öppnar ingen ny användarvy eller programplansskrivning. `resolved` betyder endast återfunna tekniska referenser. `decisionReady` och `writeReady` är alltid false. ADMIN-02 och hela fas 5 förblir Pending/öppna.

## Genomförda uppgifter och commits

| Uppgift | Resultat | Commit |
| --- | --- | --- |
| 05-07-01 | Slutet katalog-/referensformat, datum-/versions-/nivåkontroll, verifierad fryst instans och 9 meningsfulla prov. | 43c1aef |
| 05-07-02 | Importsäker offlinegenerator, bytekontrollerande `--check`, SHA-256-artefakt och 7 generatorprov. | e93df0d |
| 05-07-03 | Serverintern adapter med samma runtimeparser/resolver, 5 serverprov och kodanknutet nästa SQL-kontrakt. | 6922ce7 |

Plan och inventering committades först i 8b8341f. Inga befintliga lokala modeller, originalsnapshot, migrationer, routes, UI, grants eller de fem orelaterade arbetskopieändringarna ingår i implementationen.

## Återfinnbar källa och kvarstående alternativ

Artefaktet bygger på befintlig snapshot hämtad 2026-09-05: 907 ämnen, 2192 kurser/nivåer, 29 program och 2561 programblock–nivåreferenser. Samtliga icke-tomma block korsreferensprövas mot exakt ämne, version, item och poäng. 10 block saknar nivålista i hela råa programunderlaget, inklusive inriktningar som inte valdes i det avgränsade referensprovet; de får inga syntetiska nivåer.

Katalog-ID: `sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace`. Hashen omfattar den slutna normaliserade projektionen utan ID, kanoniska objektfält/katalogmängder och bevarad semantisk block-/nivåordning. Alla använda namn, poäng, datum, versioner, skolformer, kategorier och optional-markeringar ingår. Generatorn gör ingen nätåtkomst eller databasimport. Originalsnapshotens bytes är verifierat oförändrade mot Git.

Referensprov för samtliga 29 program, första publicerade inriktningen och uttrycklig start 2026-08-01 återfinner underlaget tekniskt. De redovisar 58 optional-subject-val, 8 ej nivåupplösta block i just dessa studievägar och 29 ej verifierade samlade programregler. Det är inga färdigbeslutade utbildningar. Svenska/SVA behålls, inga språkval görs implicit och ingen generell 2500-poängsram, fördjupningsrest, timram eller förkunskapsordning fabriceras.

Den separata offentliga källkontrollen jämförde endast SA25 v4, EK25 v4 och ES25 v3:s programversion/startdatum med aktuellt API; alla tre matchade. Se `phase5-07-source-check.json` och inventeringens primärkällor. Hela katalogen har inte uppdaterats eller liveverifierats. En 2025-start kan därför sakna nödvändig historisk version och stoppas uttryckligen; det är ingen automatisk rättslig bedömning av äldre utbildning.

## Färska kontroller

| Kontroll | Resultat |
| --- | --- |
| Riktade katalog/generator/serverprov | PASS 21/21, inga skip |
| Hela modell-/server-/generatorsviten | PASS 451/451, inga skip |
| Typkontroll och app/lib/generator-lint | PASS |
| Exakt artefaktkontroll `--check` | PASS, ingen skrivning |
| Skyddat bygge | PASS, revision 6922ce79dbd0268bb540ab40dbd492566c79c448 |
| Oberoende GSD-läsgranskning | 5/5 must-haves strukturellt uppfyllda, inga kvarstående kodblockerare |
| Diff-/ägarkontroll | PASS |

Maskinrapport: `work/pilot/results/phase5-07-catalog.json`. Byggd Worker-entrypoints bytes: `sha256:a5e7a478df39eda042fddc421260fb92f794b055dd32f0f21b2d6118a00adec3`. Bygget bevisar bevarad byggbar app; den nya serveradaptern anropas genom riktade runtimeprov, inte genom någon ny app-route. Browserprov/handboksbygge kördes inte om eftersom denna plan inte ändrar användarbeteende; 05-06:s tidigare browserbevis är historik.

Negativa prov prövar faktiska produktionsfunktioner: gammalt ID med ändrat innehåll, icke verifierad/klonad katalog, okända program/inriktningar, program-/ämnesversioner, datum, Gy11/GR/GYAN, ämne/item/poäng, dubbelval/fasta nivåer, ofullständiga äldre poster samt otillåtna fält och typer. Verifieraren hittade dolda extrafält och glesa arrayer som tidigare inte avvisades korrekt; båda rättades före slutproven. Objekt-/arrayprototyper, alla egna nycklar, symboler och accessorer kontrolleras, och getter-proven bevisar att accessorn inte körs. En lintanmärkning i det glesa arrayprovet rättades utan att förlora den verkliga luckan.

## Nästa gräns

`docs/programplansgrund-kontrakt.md` beskriver nästa SQL-plan: oföränderligt katalogartefakt med DB-verifierad hash, planbunden program-/ämnesversion och start, explicit hantering av äldre `unpinned_basis`, levande server-/SQL-mandat, revision/CAS samt atomisk ersättning och obligatorisk DB-/Worker-audit. Huvudman/rektor utformar programplansutkast; endast huvudman fastställer direkt. Timplanens förslag/återsändning införs inte i programplansprocessen.

Nationella alternativ, programkategorier/ramar, skapande, versioner/beslut, skyddad API/UI, kullkopiering och klasskoppling kräver fortsatt genomförande och verkliga lokala SQL/API-prov innan öppnande. Databasinventeringen i början av passet var endast läsande; inga databasmutationer eller nya rättigheter har tillkommit här. Fas 4:s mänskliga checkpoint/datumanmärkning och separata fasverifiering kvarstår. Ingen faktisk kommunanslutning eller pilotdrift är verifierad.
