---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: programplan-timplan-transition
status: completed
completed: 2026-10-06
requirements: [ADMIN-02, ADMIN-04]
verified_scope: local-synthetic-only
source_commit: 3ae5fe5a7f1c4a58c454d28d474a6cbaa9cd6c5b
worker_build_revision: 3ae5fe5a7f1c4a58c454d28d474a6cbaa9cd6c5b
full_phase_status: open
human_status: awaiting_user
---

# Programplan → skolans timutkast

**Den avgränsade övergången är genomförd, automatiskt verifierad och levererad på lokal 3012.** Användaren beställde utformning och genomförande 2026-10-05. En komplett sparad högskoleförberedande programram kan nu ge skolans beständiga timutkast, även före programbeslut. Formella beslut, garantikontroll och hela fas 5 är fortsatt öppna.

## Genomförd integration

Programplanens **Timplan** och **Timplaner → Gymnasium** leder till skolans versioner. En befintlig timplan med samma källa öppnas direkt när det finns en enda skola; vid flera skolor väljs skola. Retur till programplanen och tillbaka behåller samma timplans-ID och årval inom uppdraget. Sidomladdning återöppnar samma timplan via verifierade ID:n. Adressen ger ingen behörighet.

Exakt programplans-ID, version, revision, katalog, rader och sex poängterminer fryses. **Underlag** visar den frysta revisionen; **Öppna programplan** visar samma programversion med dess aktuella revision. Skolans sex timfält är separata från poängen. Blankt betyder ofördelat, explicit 0 betyder sparade noll timmar och en inaktiv poängtermin kan inte redigeras. Block och alternativa ämnen räknas en gång. Paket återinförs inte i programplanerna.

Rektor och skoladministratör ändrar sina egna nya gymnasieutkast med aktuellt skolmandat, MFA/CSRF, revisionskontroll och atomisk DB-/Worker-audit. HM läser. Endast utkast får dessa nya skrivförmågor. Gamla GR/IM-flöden finns i separat flik för HM/rektor; administratörens gymnasieåtkomst öppnar inga GR/IM-celler. Utbildningens start låser inte timplaneringen; arkivering stoppar ny skrivning.

**Spara timmar** sparar hela timraden. Egen inmatning under pågående sparning ligger kvar för nästa sparning. Revisionskonflikt hämtar sparad rad för jämförelse. Ett tappat skapandesvar återhämtas med samma kommando och skapar ingen extra version. Session-/uppdragsbyte rensar lokala uppgifter.

Ändrad programram skriver inte om timmar. Ett uttryckligt nytt timutkast får nytt ID/version; bara exakt samma radnyckel, totalpoäng och samtliga sex poängterminer bär timmar vidare. Ett tidigare utkast bevaras som ersatt med hela sin matris. En fastställd föregångare lämnas helt oförändrad. Klasskopplingar flyttas inte.

## Verifierat resultat

Alla DB-prov kördes sekventiellt i lokal skyddad miljö med ägda syntetiska fixturer, utan reset. Audit och identitetsankare bevaras. [Bevisindex](../../../work/pilot/results/phase5-gym-timplan-evidence-index.json) binder rårapporterna med SHA-256; [målverifieringen](05-PROGRAMPLAN-TIMPLAN-TRANSITION-VERIFICATION.md) kopplar kod och verkliga resultat till planens fem målsanningar.

| Kontroll | Resultat |
| --- | --- |
| Foundation före tillämpning | 37 pgTAP + 10 bevarandekontroller PASS. Ursprungliga hela rader/tidsstämplar, ACL, funktionsdefinitioner och migrationsjournal bevarade efter rollback. |
| Aktuell SQL efter grants | 37/37 PASS; 14 hela affärstabeller och ACL/journal/definitioner bevarade. |
| Byggd Worker | Preflight, slutbygge och vanlig 3012: vardera 11 fall/157 faktiska kontroller PASS. Samtidigt skapa, helrads-CAS, observerad mandatåterkallelse under låsväntan och sen auditfailure verifierade. |
| Nya användarflöden | T01–T09 på Chromium/dator och WebKit/iPhone: 18/18 PASS, inga retries/skips. Samtliga 18 fixturers originalhashar för 14 tabeller bevarade; 20 layoutgeometrier håller sidbredden. |
| Befintliga användarflöden | Legacy timplan 22, programram 10, valblock 6, skrivskyddade terminer 2 och delad plan L07 2: 42/42 PASS på vanlig 3012. Totalt 60 browserfall och 60 städningsbilagor utan kvarvarande ägda verksamhetsrader. |
| Modell/server/harness | 524 + 150 + 9 PASS. Typkontroll, lint, skyddat appbygge och handboksbygge PASS. |
| Lokal serverleverans | 174 prövade artefaktfiler byteidentiska; äldre klientfiler behållna. 18 befintliga scenarier/44 auditpar och 14 hela originaltabeller bevarade före/efter byte, även efter samtliga regressioner. |

Foundation `20261005110000` applicerades efter hash-/baselinegrind med exakt tidigare 21 Worker-vägar kvar. `20261005111000` öppnade exakt fyra nya RPC-vägar efter riktig tillfällig preflight och återställd ACL. Nu finns exakt 25 tillåtna Worker-entrypoints. Helpers, kvittenstabell och klientroller förblir stängda. Äldre tabellgrants bevaras, med restriktiv RLS som stänger nya gymnasierader för råa anrop.

Slutbygget är `3ae5fe5`. Ursprunglig implementation är `c6aaa78`; mobilrättningen är `3ae5fe5`. Handboken beskriver faktiskt beteende och begränsningar. Bilder/loggar ligger lokalt utanför Git; rå JSON-bevis innehåller granskad syntetisk metadata. Ingen verklig kommunanslutning påstås.

## Upptäckta avvikelser och korrigeringar

Första foundationförsöket stoppades av tvetydig `offering_id`-parameter. Felet rättades före tillämpning; dess original-JSON skrevs över innan bevarandeinstruktionen, så endast körutdata finns kvar. Nästa bevarade körning gav 34/35 och visade ett felaktigt testantagande om äldre Workers tabellgrants. Äldre ACL behölls; nya restriktiva RLS-policyer och faktiska rawread/write-prov verifierar skyddet. Aktuell SQL-svit är 37/37.

Första browseromgången gav nio dator-PASS och ett verkligt telefon-FAIL; åtta telefonfall kördes inte. Safari lät tabellens bredd påverka hela sidan. `contain: layout paint` håller rullningen inom tabellen, och nya knappar/fält har minst 44 px träffyta. Omprovet använder skärpt sidbreddskontroll och riktiga klick; 18/18 PASS. Originalrapport och bilder bevaras.

Legacyregressionens första försök nekades av källguarden före fixture: den gamla guarden läste rootens tidigare byggmarkör. Guarden ändrades inte. Efter byteidentisk leverans till 3012 kördes alla 22 riktiga legacyfall där med PASS. Första vägran är bevarad som uppsättningshinder, inte ett passerat beteendeprov.

## Planering och kvarstående gränser

05-25–35 har `replan_required`: deras gamla fastställd-/paketgrind ersätts endast för förberedande utkast, och upptagna migrationsversioner får inte återanvändas. Överlappande utkastarbete ska inte byggas igen. Full 05-23/E och 05-17:s yrkesram är fortsatt öppna, liksom program-/timplansbeslut, garanterad undervisningstid och nya klasskommandon. ADMIN-02/03/04 förblir Pending; mänsklig begriplighetsbedömning är awaiting_user.

Historisk full SQL-audit-FAIL och 05-22:s fyra `updated_at`-avvikelser är inte rättade eller omklassade av detta delarbete. Separat skolutbud, elevval, individuella studieplaner, kombinationer av språkgrupper/dagar och bemanning behöver planeras mot skolans resurser senare.
