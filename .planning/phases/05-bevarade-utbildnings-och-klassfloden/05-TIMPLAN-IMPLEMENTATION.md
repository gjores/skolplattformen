# Timplaner — sammanhållen arbetsyta och analys

**Planerat 2026-10-04. Ingen implementation eller nya produktprov utförda.** Förlagan är programplanernas aktuella tabell i 05-19 och Claudes pågående livscykelarbete. Alla arbetskopieändringar bevaras.

## Så ska användaren arbeta

**Timplaner → välj skola/utbildning/kull → fördela tid i tabellen → analys → lämna förslag → huvudmannen fastställer.**

Från en godkänd och fastställd programplan får rektor eller skoladministratör välja **Skapa timplan** för sin skola. Programplanens ämnen, nivåer, block och poängterminer följer med som underlag. Timmarna fylls separat. Nya gymceller börjar ofördelade med en separat tilldelningsmask; uttrycklig 0 skiljs från blankt och saknad rad. Gamla GR/IM-/cellkontrakt består genom en bevarandeadapter. Samma programplan kan ge olika skolors timplaner.

Arbetsytan följer programplanerna:

- En lugn startlista med skola, utbildning, elevkull och versionsstatus.
- Års- eller stadiekort med totalsummor, marginal och vad som återstår att kontrollera.
- En sammanhållen tabell: gymnasiets åk 1–3 HT/VT, grundskolans årskurser, IM:s veckotid.
- Radvis autospar med synlig sparstatus. Eget osparat värde, sparad revision och konflikt skiljs åt.
- Separat analys med fungerande länkar tillbaka till exakt rad/termin.
- Underlag, versioner och historik öppnas vid behov, utan att tabellen försvinner eller egna ändringar tappas.

På telefon visas gymnasiets valda årskurs med HT/VT. Läsbara källpoäng och redigerbara timfält ska gå att skilja direkt.

## Analysen ska hjälpa till att göra rätt

| Kategori | Användaren ser | Påverkan på beslut |
|---|---|---|
| Fel | Konkret avvikelse, faktiska och förväntade timmar samt regelkälla | Blockerar |
| Risk | Planeringsrisk, förklaring och synlig lokal bedömningsgrund | Redovisas vid granskning |
| Att kontrollera | Det som underlaget inte kan avgöra, med konkret kontrollinstruktion | Obligatoriska obesvarade kontroller blockerar; allmän information gör det inte |
| Uppfyllt | Vad som faktiskt kan bevisas av planens data | Begränsat till den beskrivna kontrollen |

**Visa raden** ska byta till rätt tabellrad och mobilår och ge fokus på rätt fält. Det ska fungera även när egna ändringar ännu inte sparats. Analysen visar tydligt om den gäller egna värden eller sparad revision. Beslut läser alltid färskt serverunderlag.

Exempel som måste provas:

- HKK:s 40 timmar tillsammans i låg- och mellanstadiet; NO/SO utan dubbelräkning.
- IM med mer än 23 timmar totalt men för lite bekräftad undervisning.
- Gymnasieblock där eleven väljer ett paket: alternativens tid summeras inte som om eleven läste alla.
- Timfördelning utanför programplanens terminer, ändrat skolutbud och okänd regelprofil.
- Egna osparade värden kontra aktuell sparad revision och obligatoriska kontrollpunkter.

Poäng är inte timmar. En gemensam timplan är inte bevis för faktiskt genomförd undervisning eller individuellt IM-beslut. 0,9 timmar/poäng, 36 veckor och procenttrösklar från demomodellen blir inga dolda produktregler.

## Skydd och bevarade flöden

**Användarbeslut 2026-10-05:** Analysen ska vara sammanhållen mellan programplan och timplan och senare visa sambandet med schemat. APL behöver en egen genomgång över samma kedja. Se [registrerad todo](../../todos/pending/2026-10-05-samordna-plananalys-schema-och-apl.md) för avgränsning, ansvariga planeringssteg och verifieringsmål. Precisera detta i återstående 05-29/05-31 och slutprov 05-34/05-35 före genomförandet; bevara separata beslutsstatusar och kopplingen till exakt källversion. Schemakorrelation och full APL-placering/uppföljning kräver egna senare steg. Detta tillägg är planeringsinriktning, inte ett nytt genomförandebevis.

Rektor och serverfunktionen `administrator` får skapa, redigera och lämna förslag inom sina aktuella skolmandat. HM granskar, återremitterar och fastställer den gemensamma planen. Admin får ingen HM-beslutsrätt eller programplansredigeringsrätt genom denna leverans.

Timplanens version fryser programplanens ID/revision, katalog, exakta rader/block, poängterminer, juridisk profil och skolans paketrevision. Paketutbudet får ändras enligt 05-23 D-11, men ändringen får inte skriva om timplanens historiska underlag. Ny källa visas för explicit jämförelse.

Befintliga `ar1/ar2/ar3`-klasskopplingar behålls med en adapter till HT/VT. Ny timplansversion flyttar aldrig klasser automatiskt. Timplaner får inte ärva programplanernas särskilda datumlås; ändring av fastställd timplan sker genom nytt utkast och nytt beslut.

## Genomförandesteg

| Plan | Leverans | Wave | Beroende |
|---|---|---:|---|
| [05-24](05-24-PLAN.md) | Regelförankrad analys för grundskola och IM | 1 | Oberoende; se förutsättningsgrind vid behov |
| [05-25](05-25-PLAN.md) | Serverfastställande av programplanens källa | 1 | Oberoende; se förutsättningsgrind vid behov |
| [05-26](05-26-PLAN.md) | Huvudmannens konkreta programfastställande | 2 | 05-24, 05-25 |
| [05-27](05-27-PLAN.md) | Fryst timplansgrund och skolmandat | 2 | 05-24, 05-25 |
| [05-28](05-28-PLAN.md) | Skapa gymnasiets timplan från fastställd programplan | 3 | 05-26, 05-27 |
| [05-29](05-29-PLAN.md) | Gymnasieanalys och säker radvis timsparning | 4 | 05-24, 05-27, 05-28 |
| [05-30](05-30-PLAN.md) | Startlista och sammanhållen timplanstabell | 5 | 05-28, 05-29 |
| [05-31](05-31-PLAN.md) | Analysvy med fungerande åtgärder | 6 | 05-30 |
| [05-32](05-32-PLAN.md) | Serverstyrt timplansbeslut och nya versioner | 5 | 05-27, 05-29 |
| [05-33](05-33-PLAN.md) | Granska, lämna förslag och fastställ timplan | 7 | 05-31, 05-32 |
| [05-34](05-34-PLAN.md) | Samlad timplansverifiering och användarhandbok | 8 | 05-33 |
| [05-35](05-35-PLAN.md) | Mänskligt prov av timplan och analys | 9 | 05-34 |

05-24 är tidig, oberoende GR/IM-analys. Därefter byggs programfastställande, timplansgrund och skolmandat innan gymnasieflödet öppnas. Tabellen och analysen blir en sammanhängande leverans; beslut och verifiering följer.

Varje plan har två uppgifter. 05-26, 05-28–05-30 och 05-33 innehåller fler än fem käll-/provfiler av ett konkret skäl: de kopplar en avgränsad verksamhetsfunktion över befintliga SQL/API/UI-gränser. Dessa scopevarningar är uttalade. Om inventeringen kräver ytterligare subsystem delas steget innan genomförandet.

## Hårda förutsättningar

- 05-20–05-22 ska vara levererade och verifierade för full skolkoppling och levande mandat. Nuvarande arbetskopiekod och PLAN-filer är inte slutbevis.
- **05-23 har bara CONTEXT.** Full Svenska/SvA-/valblocksmodell, skolpaketsrevisioner, genomförbar plan och verkliga TS/SQL/API/UI-bevis krävs innan full gymnasiegrund eller programfastställande öppnas.
- **05-17 är inte färdig.** Yrkesprogrammens poäng-/timprofil förutsätter dess leverans och prov. En okänd profil blir Att kontrollera, aldrig en gissad 2 500-poängs- eller högskoleförberedande ram.
- Saknade förutsättningar anges som `prerequisite_ready` och acceptansgrindar, inte som oexisterande plannummer i `depends_on`.
- HM:s skyddade programfastställande saknas i nuläget och ingår konkret i 05-25/05-26. Framräknat Klar för beslut är ingen fastställd källa.

## Kontroll och överlämning

Nya entrypoints prövas genom riktig lokal Worker och isolerad SQL innan exakta grants öppnas. 05-25 bygger ett säkert migrationsverktyg före första SQL-apply. 05-26 äger och bygger konkret preflight-harness och fixturer vid första API-entrypoint. 05-28/29/30/33 utökar samma fallregister sekventiellt före sina egna grants. 05-34 kör färdig harness och slutrelease; den skapar inget tidigare beroende. Detta är ingen separat provkampanj per kontraktslager.

Slutverifiering omfattar syntetiska skolor och alla roller, samtidighet/CAS, återkallning under låsväntan, MFA/CSRF, auditrollback, tappat svar, replay, källa/paket, oförändrade klasslänkar, dator/telefon och visuellt fokus. Uppdaterad användarhandbok byggs. Kända programplansfel försvinner inte genom omklassning eller tysta skips.

05-35 är ett separat mänskligt prov först efter automatiseringen. Ingen mänsklig acceptans, verklig kommunanslutning eller full fas 5 påstås av denna planering.

Kravspårning: **ADMIN-02**, och skol-/klassbevarande i **ADMIN-04**. Timplanskloning inom samma kull bidrar till versionsbevarande men full kopiering till ny elevkull (**ADMIN-03**) är en separat leverans. Schemaläggning, tjänstefördelning, elevval, faktisk tidsredovisning, programplansdelegation och nya klasskommandon ingår inte här.

Detaljer: [kontext](05-24-CONTEXT.md) och [kod-/källunderlag](../../research/TIMPLAN-ARBETSYTA-OCH-ANALYS-2026-10-04.md).

[Oberoende plangranskning](05-TIMPLAN-PLAN-CHECK.md): genomförbar med angivna förutsättningsgrindar, inga kvarstående blockerande eller större planeringsfel. Storleksrisker är redovisade. Granskningen gäller planernas kvalitet; den är inget genomförande- eller användargodkännande.
