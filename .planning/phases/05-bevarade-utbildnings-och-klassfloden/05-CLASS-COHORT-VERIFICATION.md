---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
status: awaiting_user
updated: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
actual_browser_status: passed
local_delivery_status: passed
human_trial_status: awaiting_user
standard: SS 12000:2024
openapi_document_version: 2.1.0
---

# Verifiering av tidig klassorganisation

Tidiga tomma klasser, skolmandat och uttryckliga läsårs-/versionskopplingar är implementerade. Automatiska prov har passerat mot ett isolerat syntetiskt mål. Fulla krav, hela fas5 och mänsklig acceptans är fortsatt öppna. Detaljer, ursprungliga fel och återhämtningar finns i [08-SUMMARY](05-CLASS-COHORT-08-SUMMARY.md); privata rådata ingår inte i Git.

## Aktuella resultat

| Del | Verifierat resultat | Gräns |
| --- | --- | --- |
| Installerad SQL | 436 PASS: datum124, länkidentitet68, batch/status183, kontrakt3, tidigare klassflöde58 | Fullmatrisen är ärvd från första installerade körningen; dess övergripande FAIL på provverktygets aliasfel består. Verklig DB-roll, SQL→TypeScript och5534 Unicodeprober ingår. |
| Faktisk samtidighet | 7/7 PASS | Separata anslutningar,2NOWAIT,3observerade blockeringsbarriärer,2gamla snapshots. Identisk batch ger samma två klasser och ett kvitto. |
| Verklig Worker/API/OIDC | 30/30 PASS, exit0 | Fyra egna syntetiska konton; nio unikt auditbundna autentiseringsomgångar,400 källhashar och63 bevarade verksamhets-/sessionstabeller. |
| Riktade produktprov | Node41 PASS | Åtta källhashar återkontrollerade oförändrade. Separat rålogg saknas för denna Node-körning; verktygsutfallet är dokumenterat. |
| Callbackbevisets negativa prov | Node40 PASS,0skip | Fel/saknade/dubbla/återanvända bevis, HTTPfel och MFA-/sessions-/epokfel nekas. |
| Klasspanelens rättning | 56 klassprov+18 kopieprov på dator/telefon PASS | Simulerade API-svar genom det riktiga skyddade skalet. Separat stödbevis. |
| Typkontroll, lint och skyddat bygge | PASS | Produkt88145bc; färsk typkontroll och riktad lint även efter provverktygsändringen. |
| Faktiska browserflöden | 6/6 PASS: A01/A02/A03 på dator och telefon | Exit0, inga skips/omprov/errors; sex fulla cleanup och14 visuellt granskade bilder. |
| Handbok | Granskad och byggd, exit0 | Lokal leverans sker separat i09. Ingen publicering. |
| Lokal3012-leverans | PASS, samma201 byggfiler från88145bc | Verklig läsande OIDC/MFA,59 business +4 äldre sessionstabeller och loggankare bevarade. Första städfel/återställning dokumenterade i09. |
| Mänskligt klassprov |awaiting_user |Separat vårkull förberedd; faktiskt användarsvar återstår. |

SQL-slutbevis SHA256: `1f6c0ae62a9e26d8725d7abf4ab641db52467c7d35e0c5f49c4f8a8410516473`.

Aktuellt API-bevis: `/private/tmp/class-cohort-08-fixed-api-pp1zm5ii/api.json`, SHA256 `955db4a6343bd4b68fafe918cc5d76e27044bed3f7191f05e6d7231719e0d63b`. Roots separata läsande validator och fixtur-/callbackgranskning PASS.

Samma testade bygge är levererat på3012 och kandidaten finns separat på3013: produktrevision `88145bcec46317929dcd9383d3fe8c80195e6415`,201 byggfiler, artefakt-SHA256 `5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c`. Inga senare provverktygsändringar ändrar produktbygget.

## OIDC-bevis och databevarande

Varje autentiseringsomgång förbereds före navigation/knapptryck med en privat hållbar audit-ID-baslinje. Exakt en callbacknavigation ska bindas till faktisk browserretur, cookie/API-verifierad identitet och session samt en unik ny lyckad worker-login-audit. Step-up kräver samma session/epok och accepterad MFA. Ett observerat HTTP-fel nekas alltid.

WebKit har i ett minimalt verkligt prov utelämnat callbackens Response trots två lyckade serverinloggningar. Därför redovisas beviset som `browser-return-and-server-audit`; HTTPstatus är null där den inte observeras. Ingen302 fabriceras. Diagnosens observermål förblir FAIL, medan dess separata normala FK-cleanup passerade. Detta är lokal verklig OIDC med syntetiska identiteter, inte simulerade inloggningssvar eller en kommunanslutning.

Nya API-/browserfixturer sparar63-tabellsbaseline inklusive `auth.mfa_amr_claims` samt fem identitets-/audittabeller före mutation. Cleanup tar endast egna journalbundna verksamhetsrader/sessioner/claims och IdP-konton. Audithistorik och nödvändiga identitetsankare bevaras. Gamla klassdatum, medlemskap, elever och versionslänkar ändras inte för provets skull.

Två historiska bevisgränser består:

- Första SQL-körningens92 egna auditrader har exakt PK/antal/PK-hash, men den osorterade ursprungliga värdehashen kan inte användas för ny ordningsoberoende värdejämförelse. Återupptagningen använder en separat kanonisk före/efter-baslinje.
- Telefonens tidigare cleanupfel saknade sparad före-körningen-baseline för alla ankare. Exakt återhämtning återställde föregående desktopbaselines62 verksamhets-/sessionstabeller; fem ankartabeller och244 övriga MFA-claims bevarades mot återhämtningens egen baseline. Ingen äldre värdejämförelse påstås för dessa ankare/claims. Återhämtning PASS, SHA256 `61d0905bc10364e401033110f4c775e9d093bd63ca4b8670602b6f2df08f1560`; originalets FAIL består.

## Kravspårning och standard

| Krav | Paketets stöd | Kvarstående gräns |
| --- | --- | --- |
| ADMIN-03 | Ny kull får egna planutkast utan gamla klass-ID:n, elever eller länkar. | Kopieringen är redan mänskligt godkänd och ska inte provas om; fullkravet bedöms separat. |
| ADMIN-04 | Tidiga tomma klasser, aktuella skolmandat, datum, atomisk batch och ID-bunden timplanskoppling. | Nytt mänskligt begriplighetsprov. Historisk05-22-avvikelse kvarstår. |
| PLANERING-04 | Exakt utbildningsstart, första läsår och separat tillämpningsläsår; stabil klass över planversioner. | Nytt mänskligt prov av klassflödet efter leverans. |
| PLANERING-05 | SQL, samtidighet, faktisk Worker/OIDC, bevarande och byggd handbok. | Avgränsat mänskligt utfall. |

[SS12000-mappningen](05-CLASS-COHORT-SS12000.md) utgår från SS12000:2024/OpenAPI2.1.0: stabilt klass-ID till Group.id, klass till groupType Klass, skola till organisation och klassgiltighet skild från medlemsperiod och registreringstid. Tom klass skapar ingen person, placering eller medlem. Timplansversion och tillämpningsläsår är inte gruppidentitet.

En utbildning per intern klass, okända äldre datum/tidsstämplar och kvarvarande namnnyckel är uttryckliga begränsningar. Externa ID:n och käll-/skrivansvar behöver ett separat integrationskontrakt. Ingen standardexport, standardcertifiering eller faktisk kommunanslutning har verifierats.

Aktuell browserrapport SHA256 `9d2c0f9a92106729e9c4251f5170d9fcf6940425f5b8a6339be9f5428efb97bc`; samlad08-grind SHA256 `e4b9780373485ac5d100039196a80895e9319bb20d75c36f1db20e4b97474c33`. Telefonens fokushopplänk överlagrar viss metadata i fullsidesbilderna; ingen felfri UI påstås.

Leverans09 slutbevis SHA256 `427a9f15463303d5ec3773b03ff2d3768575f9826308cd4597be1d93ffdc700b`. Tokenbunden kontroll av endast egna authmetadataiat/exp har48 negativa/positiva prov PASS och full privat före-bild. Första leveransens exakta historiska egna metadatadiff saknas; avgränsning och återhämtning finns i [09-SUMMARY](05-CLASS-COHORT-09-SUMMARY.md).

Plan10:s syntetiska vårkull är förberedd med83 tabellers originalrader bevarade,0klasser/0länkar initialt och läsande återöppning PASS. [Användarprovet](05-CLASS-COHORT-USER-TRIAL.md) är erbjudet2026-10-15 och inväntar mänskligt svar; detta är inte full krav-/fasacceptans.
