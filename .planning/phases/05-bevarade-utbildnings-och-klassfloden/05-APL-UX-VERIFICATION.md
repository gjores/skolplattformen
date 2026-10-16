---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL-UX
status: technically_verified_user_trial_pending
updated: 2026-10-16
---

# Verifiering av årskurs och termin först

Användarens val är årskurs och termin först, exakta veckor/datum senare. Den slutligt testade versionen c739bb3 är nu lokalt levererad på 3012 tillsammans med det additiva terminsfältet. Teknisk verifiering är klar; användarens nya begriplighetsbedömning väntar.

| Del | Aktuellt resultat |
| --- | --- |
| Modell och återhämtningsjournal | 44/44; gamla fasta hashvärden bevaras. |
| Samlade riktade Node-regressioner | 64/64 inklusive API, beslut och årsprojektion. |
| Faktisk SQL | 22 kontroller + en observerad tvåskrivarkonkurrens, 74 tabeller/199 syntetiska originalrader, full cleanup. Se UX-01. |
| Installerings-/leveranskontroller | 98/98 Node-prov, inklusive att fel paket, otillräckliga bevis, nya rättigheter och okänd commit inte godtas. |
| Själva delta-installationen i ägd schemakopia | Exakt kolumn/fem funktioner/journal PASS, upprepad installation nekas, full rollback och cleanup. |
| UI och handbok | 58/58 fulla APL-previewprov före sista dialogförenklingen, 12/12 riktade därefter och 26/26 beslutsregressioner, dator/telefon. Typ/lint/handboksbygge PASS. Se UX-02. |
| Faktisk Worker/OIDC, dator och telefon | PASS 11: dator 3 + telefon 3 + API 5, 71 API-anrop, 15 callbackar, 8 granskade bilder, full ägd cleanup. |
| Aktiv installation och lokal leverans | PASS: 74 originaltabellers kolumner/rader och rättigheter bevarade vid migration; 71 verksamhetstabeller bevarade vid appbyte/läsprov. Samma 209 byggfiler på 3012. |
| Mänsklig begriplighet | Awaiting_user; separat från tekniskt PASS. |

SQL-rårapport: `/private/tmp/apl-term-intent-fourth.json`, SHA-256 `371b2caee1a5f8da7a11fe9c773c62f81ff753961d677b7b7a21570fb3fb9a2d`. Gamla kvitton, bekräftelser och originalkolumner bevaras; detta är syntetiskt bevarande i ägd databas, inte bevis för migrerade aktiva rader. SQL-provet använder DBägare med faktiska appmandat; riktig Worker verifieras i det separata integrationsbeviset nedan.

Installationsverktygets eget prov: `/private/tmp/apl-ux-installer-isolated-third.json`. De två tidigare försöken stoppade på verifierarens felaktiga ACL-fältnamn respektive skillnaden mellan PostgreSQL Result-array och vanlig array. Verifieraren är rättad och båda första rapporterna har full cleanup. Produktdeltan ändrades inte. Ett regressionstest täcker nu den faktiska resultatformen. Inga aktiva data kopierades eller ändrades.

`deliver-apl-plan.mjs` återanvänds med ett uttryckligt, vitlistat paketval `apl-term-intent`. Det nya paketet har eget installationsverktyg, beviskontrakt och migrationsfil. Äldre tre-migrationsbevis kan inte godkänna nya bytes. Den gemensamma överföringen behåller kontroll av exakt kandidat, tidigare process, aktuell rektorsidentitet, skola, återställningsstatus och egna sessionsstädningen. Alla 69 äldre verktygsprov består inom totalsumman 98.

SS 12000-avgränsningen i UX-CONTEXT består: intern planeringsavsikt, inga påhittade kalenderhändelser, placeringar eller närvarouppgifter. Ingen extern standardanslutning eller full pilot-/fasacceptans påstås.

Slutlig separat skyddad kandidat: `c739bb38feadee27189cb2d44feb658ab5ee9585`, 209 filer, SHA-256 `db402038fc61a53d47b89ede8a799b453643ac81a21f950bd06f47b3ad42fc11`. Byggd i privat checkout med genererade CSS-verktyg kontrollerade; aktiv artefakt byteidentisk före/efter. Bevis `/private/tmp/apl-ux-candidate-build-final.json`. Tidigare dc47adc-kandidat är inte slutlig och ska inte levereras.

## Spårning till den avgränsade beställningen

| Kriterium | Verifiering och gräns |
| --- | --- |
| APLUX-01 Spara enbart årskurs/termin | Modell/SQL PASS; båda enheternas preview sparar och återläser samma period utan namn, datum, veckor, innehåll eller tidsfördelning. Faktisk HTTP/browser på båda enheter PASS, samma period-ID och tomma detaljfält. |
| APLUX-02 Härlett läsår | Fryst timplankälla används oberoende av vyns läsårsfilter. Vårstart verifierad. Okänd start är inte ett giltigt fullt timplanskontrakt och provas som läsfel utan skrivning; inte som fungerande sparflöde. |
| APLUX-03 Preliminärt först, precisering senare | Spargranskningen för terminsutkast är kompakt. Datum/omfattning och ämnen/tid utvecklas vid behov. Rektors befintliga bekräftelsekrav kvarstår. Handbok byggd. Mänsklig begriplighet återstår. |
| APLUX-04 Äldre underlag och behörighet | Fasta gamla hashvärden, kvitto-/journalreplay, flerminperiod, kopia/ny version, CAS, skolmandat och auditrollback verifierade i UX-01/02. Faktisk Worker/OIDC verifierar samma mandat, gamla kvitton, kopia/nyversion, MFA/journal och auditrollback. |
| APLUX-05 Exakt kandidat och ärlig status | Separat byggd slutlig kandidat och granskade previewbilder finns. Faktisk integration och lokal installation PASS för samma 209 byggfiler. Ny mänsklig bedömning väntar. |

Slutligt integrationsbevis och full testfelhistorik finns i [UX-03](05-APL-UX-03-SUMMARY.md). [Releaseunderlaget](05-APL-UX-RELEASE.md) binder faktisk installation, samma artefakt, läsande rektors-OIDC/MFA, originalbevarande och eget sessionsstäd. Samtliga APLUX-01–05 har tekniska bevis; APLUX-03:s mänskliga begriplighetsbedömning är fortfarande öppen.
