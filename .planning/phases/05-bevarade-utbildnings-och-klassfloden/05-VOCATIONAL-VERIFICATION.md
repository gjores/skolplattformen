---
phase: 05-bevarade-utbildnings-och-klassfloden
scope: national_gy25_vocational_decisions_and_return_feedback
status: passed_local_synthetic_scope
verified: 2026-10-12
requirements: [ADMIN-02, ADMIN-04]
product_revision: 03698a219162c7aa77d4ad984d442f36e5b4bab1
---

# Yrkesprogrammens beslutskedja — lokal verifiering

Samtliga tolv nationella Gy25-yrkesprogram har en explicit programprofil. Programplanens poängram, behörighetsnivåer och terminsfördelning leder till en skolbunden timplan med fryst programkälla. Båda planerna kan skickas in, skickas tillbaka med obligatorisk kommentar, rättas, skickas in igen och fastställas. Godkända versioner förblir låsta.

Huvudmannen ser beslutsuppgifter på Start och i global **Att göra**. Efter återsändning visar huvudmannen **Inväntar rättning** utan ett nytt beslut i räknaren. Rektor får programplanens rättningsuppgift; rektor och skoladministratör får timplanens. Den senaste kommentaren visas direkt under **Det här behöver rättas**, medan tidigare kommentarer finns i historiken. Huvudmannen kan inte fastställa en återsänd plan innan den skickats in igen.

## Färska bevis

| Nivå | Resultat | Faktiskt prövat |
| --- | --- | --- |
| Modell och oberoende serverprojektion | 141/141 PASS | Tolv yrkesprogram och deras inriktningar, rätt ramar, nivåer, datum, timmar och negativa kontrakt. |
| SQL + oberoende TypeScript | 101/101 PASS | Båda yrkesramarnas hela kedja, alla tolv källprofiler, roller, revisionskonflikter, auditrollback och gamla HE-kvitton före/efter migration. |
| DDL-rollback och lokal installation | PASS | Tre ändrade funktioner, en stängd hjälpfunktion, journal och bevarade originalrader/ACL. |
| Utvecklings-Worker HTTP | BF25 25/25; BA25 25/25 PASS | Faktiska endpoints och lokal PostgreSQL med skolplattform_worker. |
| Slutbyggd Worker på 3012 | BF25 25/25; BA25 25/25; HE 19/19 PASS | Hela beslutskedjan, kommentarer/rättningar, rollernas faktiska inkorgar, negativa behörighetsfall, oförändrad originaldata och städade egna fixturer. |
| Isolerad UI på dator/telefon | 26/26 + 2/2 PASS | Båda plantyper, dubbla returcykler, senaste kommentar, väntelägesräknare, rätt nästa roll, blankkommentar och slutlås. Inga skips eller flakes. |
| Faktisk lokal OIDC | 6/6 PASS | Tre roller på dator/telefon; inkorg, räknare, listläsning och öppning av beslutsunderlag. |
| Typkontroll, lint, app- och handboksbygge | PASS | Slutliga produktkällor; känd exit 0. |
| Oberoende källgranskning | PASS | Inga öppna P1/P2. Samtliga nio dokumenterade produktfilshashar matchar leveransen. |

Byggd version `03698a219162c7aa77d4ad984d442f36e5b4bab1` kör på lokal port 3012. Installationen jämförde produktkällorna mot byggkatalogen och 183 installerade byggfiler byte för byte. Tidigare bygge är bevarat. Produktrevisionen är pushad och fjärrgrenen kontrollerad. Slutliga statusdokument får en separat commit utan ändring av produktbygget.

**Faktisk lokal OIDC: 6/6 PASS**, känd exit 0. Huvudman, rektor och skoladministratör har prövats på 1440 px och 390 px. Global räknare matchar inkorgens rollbundna uppgifter/beslut, Programplaner laddas, Att göra öppnar Start och första uppgiften öppnar verkligt beslutsunderlag. Inga pageerrors eller horisontell överströmning. Samtliga sex skärmbilder är visuellt granskade. Provet är läsande och skapar inga planer. Rapport `web/outputs/vocational-live.json`, SHA-256 `04ce35793815f5a3060b57e952d4de9dcce6f98bc6f63381964d2c87bddbf74e`.

UI-fixturernas syntetiska API-svar räknas inte som bevis för den verkliga inloggningen. HTTP-fixturerna ovan prövar riktig Worker och databas för yrkesövergångarna; OIDC-provet läser befintliga syntetiska planer. Ingen extern kommunanslutning påstås.

## Bevarande och spårbarhet

DDL- och yrkes-API-proven jämför alla rader och tidsstämplar i 19 befintliga verksamhets-/beslutstabeller. Gamla programplaner, frysta underlag, beslutskvitton och klasslänkar ändras inte. Egna syntetiska testobjekt städas; obligatorisk audithistorik bevaras. Databasrättigheter, funktionsfingerprint och migrationsjournal är återställda efter varje API-prov. Den avsiktligt installerade framåtmigrationen är den enda permanenta databasändringen.

Rårapporterna är privata lokala artefakter; inga hemligheter eller elevuppgifter versionshanteras. SHA-256:

| Privat rapport i `/private/tmp/` | Hash |
| --- | --- |
| `vocational-flow-final2.json` | `62a5861f72e87ecc9681c6b6cf6e7be1b78fd7202e560fdb49db5b630eb19269` |
| `vocational-ddl-verify.json` | `03b98f5444164c36b1a3d2751634f77fa20ee0cc3ac3b43a65818c0bb8d8b3e0` |
| `vocational-ddl-apply.json` | `ecb8f97b6d70a541c38cce777acb94b09eb56c61c5fdf0b022b7f6865c7e60b4` |
| `vocational-built-api-bf.json` | `b0c3336cb05e9e5c6a70e34b4aa92bac029c8041a1b19701236e995ece01ec18` |
| `vocational-built-api-ba.json` | `f09b6b791d0158d57d766084cdce05e98f20794252e7e3ffd4637f969b3e1bde` |
| `vocational-built-api-he.json` | `aa60f5cdcddc33256a21d7ed12e540d208636453d93da82e8ff418998444c80c` |

Relaterade resultat: [modell](05-VOCATIONAL-01-SUMMARY.md), [SQL](05-VOCATIONAL-02-SUMMARY.md), [UI](05-VOCATIONAL-03-SUMMARY.md), [leverans](05-VOCATIONAL-04-SUMMARY.md), [oberoende granskning](05-VOCATIONAL-REVIEW.md). Handbokens programplaner och timplaner beskriver samma roller och steg.

## Kvarstående gränser

- Gemensamma nationella Gy25-programramar stöds. Okända/särskilda profiler och individuella bortval är separata behov.
- APL-längd, lärlingsandel, faktisk organisation/närvaro och kontroll mot dubbelräknad tid kräver verksamhetens granskning; detta är ingen automatisk APL-kalender.
- Yrkeskullar med start från 2028-07-02 kan planeras men spärras för beslut tills yrkesprovsmodellen stöds. [Verifierade primärkällor](../../research/VOCATIONAL-RULES-2026-10-12.md).
- Återsändning gäller inskickade planer före fastställande. Ingen återöppning av fastställda versioner införs.
- Skyddad klasskoppling, GR/IM-beslut, fulla ADMIN-02/04 och mänsklig begriplighetsacceptans återstår inom sina egna avgränsningar. Ingen full fas- eller pilotacceptans markeras klar.
