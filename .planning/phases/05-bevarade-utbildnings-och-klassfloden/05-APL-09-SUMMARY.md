---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-09
status: complete
updated: 2026-10-16
user_trial: awaiting_user
---

# APL-09 – lokal installation och användarprov

Användaren godkände uttryckligen: ”Ja, godkänner de tre APL-databasändringarna och bytet på 3012. Kör på!” De tre exakta migrationerna i [releaseunderlaget](05-APL-RELEASE.md) är installerade. Samma skyddade kandidat `68cecb41e1d61ae8381951ee295758c4f764511c` kör på3012:209 filer, artefakt `e37a996c33ba301a86490512aff7ab4a65f3ccd32337ba91ac5cc713062ae9c6`. Ingen ombyggnad, DB-/IdP-omstart eller reset gjordes.

## Verifierad leverans

- Förnyad läsande förberedelse PASS direkt före installation: aktuell process/artefakt, schema, befintlig rektorsidentitet/mandat och MFA. Båda lokala provlåsen var lediga.
- Alla tre migrationer installerades i samma transaktion. Ursprungliga rader/kolumner i65 tabeller, tidigare migrationsjournal och rättigheter bevarades. Exakt testad struktur, nio nya stängda tabeller och tre Workergrants verifierades. Låstiden före commit var9006ms. Commit bekräftad och lokala migrationsfiler synkroniserade.
- Leveransens verify/apply PASS. Samma testade209 filer kopierades. Läsande riktig rektors-OIDC/MFA verifierade skolmandat, klassunderlag, namngivna timplaner, programplansskapandemandat, APL-kontrakt och beslutsunderlag. Hälsa workerd/skolplattform_worker PASS.
-71 verksamhetstabellers rader bevarades genom appbytet och läsprovet. Egna app-/GoTrue-sessioner städades; gamla sessioner och loggar bevarades. Ingen användarplan eller klass användes som skrivtest.

## Konkret ingång och extra läsprov

[Användarprovet](05-APL-USER-TRIAL.md) utgår från befintlig BYGGHUS27 i Syntetisk skola11. Ett extra läsande prov med samma befintliga rektorsmandat läste exakt denna plan, APL och beslut medHTTP200 samt matchande DB-/Worker-audit. Startsidan öppnades och APL-rubriken blev synlig. Provhjälpens efterföljande omedelbara räkning hittade ingen redigeringsknapp. Komponenten renderar knappen först efter separat APL-inläsning, vilket talar för en för tidig assertion; orsaken är inte slutligt omprovad. Detta är inte ett godkänt knapp-/fullflödesprov. Hela flödet på dator/telefon är separat verifierat iAPL-08.

Sidstängningen lämnade väntande nätverksobservationer och provhjälpen avbröt därför sin sessionstädning. Den egna browserprocessen avslutades. Exakt återhämtning band en appsession och en GoTrue-session till journalens riktiga callback, cookie-/tokenhash och audit. En refresh-token och en MFA-post tillhörde samma session. De fyra egna raderna togs bort; ursprungliga sessioner och en senare separat inloggning bevarades. Alla aktuella71 verksamhetstabeller och fem identitets-/loggtabeller var identiska före/efter återhämtningen. Eget lås borttaget.

Under väntetiden ändrades `gym_timplan_receipts`, `timplan_cells`, `timplan_events` och `timplans` utanför det läsande provet. Dessa ändringar återställdes inte. Återhämtningsbeviset avser aktuellt läge och ursprungliga sessioner; det rekonstruerar inte ursprungliga inloggningsmetadata. Första provets FAIL bevaras. Tidiga återhämtningsförsök avbröts före radering vid ny främmande session respektive för strikt tabellnamnsregex; slutlig återhämtning PASS. Ingen produktkod eller levererad artefakt ändrades.

## Privata bevis

| Fil | SHA-256 |
| --- | --- |
| `/private/tmp/apl-install-approved.json` | `c519682700152a45a8d3e7cebc33b4a9b50315301ce72af3dd94cb2c62be81ba` |
| `/private/tmp/apl-delivery-approved-prepared.json` | `484aba57eebc08c29f05c1747896929c30e87647940199023eb00ae72bfcc28b` |
| `/private/tmp/apl-delivery-approved-verify.json` | `89127cb9ed8c23ae4ead07a561232e1b83997414027be34a99989cb577d38556` |
| `/private/tmp/apl-delivery-approved-apply.json` | `caf20c7e4e3e30a5efaa9dbd1dc91e3ae45b72e71a0cc41321680bfd725590d5` |
| `/private/tmp/40bfb637-8505-42f3-a677-752316b7c501-readonly/delivery-readonly-7fdaef15-8dbc-4582-aa49-d333717d1f7e.json` | `bddbb315f35f56ca20436f0c4d2e633969a21c5e422256f7c593ee57e2f6fd7a` |
| `/private/tmp/apl-user-trial-read/delivery-readonly-bac48842-a7ff-438b-9474-9c079cbbb7db.json` | `af6fa55d8b198aa1add97678a6ea9bf1c6307906e7ac8d97017e38c6167685bf` |
| `/private/tmp/apl-trial-session-recovery.json` | `771322a6648b9122dd84c00db797fec864832fb493528b073cb543b8c16cf30b` |

## Status och gräns

10 av11 paketplaner är klara. APL-10 väntar på användarens begriplighetsbedömning. APL-etapp2/3 (arbetsplatser, elevplacering, närvaro och genomförande) kvarstår. Pilotens42 krav, åtta faser och historiska88/100 planer/3 verifierade faser ändras inte. SS12000:2024 utgåva4/OpenAPI2.1.0: stabila skol-/klass-ID:n, giltighet och källansvar bevaras. APL-planering är intern; inget externt standardutbyte är verifierat.
