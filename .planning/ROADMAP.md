# Roadmap: Skolplattformen

**Användarprov rapporterat klart 2026-10-23:** Användaren meddelar ”användarprovet är klart” efter lägesgenomgången av tjänstefördelningens etapp 1. Provet registreras som användarrapporterat klart och ska inte efterfrågas igen som ett väntande helhetsprov. Roller, enheter, enskilda steg och särskilda gränsfall särredovisas inte i svaret; inga nya tekniska provresultat tillskrivs det. TJANST-06 (etapp 2) och granskningspunkterna, däribland WR-10 och WR-11, kvarstår. Fasstatus är fortsatt gaps_found, 6/7. Nästa steg är att hantera granskningspunkterna och planera etapp 2 enligt D-18.

**Nya faser 05.1–05.8 inlagda 2026-10-19:** Användaren godkände faslistan för tjänstefördelning, schemaläggning med Rust-schemamotor som egen tjänst, klassorganisation, lärarbehörigheter, interkommunal ersättning, köpbara moduler, SPAR-synk samt stark identitet och BankID. Faserna ligger mellan fas 5 och faserna 6–8, som behåller sitt innehåll. Tjänstebedömningen är utflyttad till repot `tjanstebedomning`; se [beslutsdokumentet](phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md). Vid införandet var inget planerat eller genomfört i de nya faserna. Aktuellt läge för 05.1 finns ovan och i framstegstabellen. Fas 5 är fortsatt öppen, och historiska 88/100 och 3/8 består. Senaste leverans är gaprättelsen i 05.1 Tjänstefördelning 2026-10-22 (05.1-13: migration 20261021120000 installerad lokalt), och 3012 kör 7d31489.

**Examensform för HT2028 levererad2026-10-18:** Rektor dokumenterar yrkesprov när tillämpligt prov finns, annars gymnasiearbete, med källa och kontrolldatum före inskick till huvudmannen. Ingen automatisk verifiering av nationellt provutbud påstås.100-poängsraden och frysta beslut bevaras; ny kull eller ändrat innehåll kräver ny kontroll. Modell201/server98/UI20/SQL25/actual20 och lokal installation/efterprov PASS.3012 kör7102cf8 med79 originaltabeller bevarade vid installation och76 verksamhetstabeller vid appbytet. [Verifiering och användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-EXAM-2028-VERIFICATION.md). Mänsklig begriplighet och bredare mobilöverlappning kvarstår; historiska88/100 och3/8 består. Äldre leveransnoteringar nedan är historik.

**Timkontroll levererad2026-10-18:** Timplanen visar planerat, miniminivå och saknade timmar för GUT/yrkes-APL. Otillräckliga utkast får sparas men inte skickas eller godkännas. UI14/SQL17/actual18 och lokal leverans PASS;3012 körbc1378e. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-HOURS-CHECK-VERIFICATION.md). Ingen ny full fas-/pilotacceptans.

**Enklare planeringsflöde levererat2026-10-18:** Program-/timplanstabeller i fokus, tydligare knappar och separat APL-planering. Huvudmannen godkänner timtabellen före perioderna; rektor bekräftar senare APL och huvudmannen granskar den separat. Ämnen/årsram återanvänds efter uttryckligt terminsval. Node146, UI86, SQL32, faktisk OIDC/browser14 och lokal installation/efterprov PASS. En migration bevarade77 originaltabeller; appbytet bevarade76 verksamhetstabeller. Exakt testad3a2edf3/213-fils kandidat kör på3012. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-VERIFICATION.md) och [arbetsgång](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-RELEASE.md). Fullständigt centralt innehåll och genomförandeuppföljning är fortsatt avgränsade; ny mänsklig begriplighetsbedömning återstår. Historiska88/100 och3/8 samt tidigare godkännanden består. Äldre noteringar nedan är historik.

**Års-APL levererad 2026-10-17:** Timplanen har Skola HT/VT och separat APL per årskurs. Årsramen sparas utan perioder; senare förläggning förbrukar ramen utan dubbelräkning. Högskoleförberedande program saknar APL-funktion. SQL48, faktisk Worker/OIDC14 på dator/telefon, tolv granskade bilder och lokal installation/överföring PASS. Två migrationer bevarade originalkolumnerna i 74 tabeller; appbyte/läsprov bevarade 74 verksamhetstabeller. Samma testade 2cd3ad0/213-fils kandidat kör på 3012. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-VERIFICATION.md) och [arbetsgång/användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-RELEASE.md). Mänsklig begriplighet och full fas-/pilotacceptans återstår; historiska 88/100 och 3/8 består. Äldre noteringar nedan är historik.

**APL-handledning och kalender levererade 2026-10-16:** Handledning med regler, appens arbetsgång och skolans genomförandeansvar samt svensk kalender med ISO-veckor i alla 19 datumpositioner. Komponentprov, typ/lint, skyddat bygge, handboksbygge och 8 faktiska dator-/telefonkontroller PASS; 14 bilder granskade. Exakt c02e600/210-fils kandidat kör nu på 3012, utan migration och med 71 verksamhetstabeller bevarade. [Samlad verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-GUIDE-DATES-VERIFICATION.md). Referensbildernas **skola HT/VT + APL per årskurs, perioder senare** är [planerade i fyra steg](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-PLAN.md), ännu inte implementerade. Mänsklig begriplighet och full fasacceptans kvarstår. Äldre leveransnoteringar nedan är historik; pilotantal 88/100 och 3/8 består.

**Autofördelning levererad 2026-10-16:** Timplanens nya dialog frågar efter total timmar och visar GUT, bevarar befintliga värden eller fördelar om hela planen och skyddar sparad APL-tid. Modell/server90, UI24, faktisk Worker/OIDC14 och lokalt appbyte PASS. Exakt testad a55a15a/210-fils kandidat kör på3012, utan migration och med71 verksamhetstabeller bevarade. [Resultat och användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-AUTO-SUMMARY.md). Mänsklig begriplighetsbedömning, tidigare APL-UX-prov och full fasacceptans kvarstår. Historiska88/100 och3/8 består.

**APL-UX levererad 2026-10-16:** Årskurs och termin kan väljas och sparas först; datum/omfattning och ämnen/tid preciseras senare. Tre avgränsade planer klara. Modell/SQL, dator/telefon, faktisk Worker/OIDC och bevarandekontroller PASS. Samma c739bb3/209-fils kandidat kör på 3012 efter additiv migration, med 74 originaltabeller bevarade vid installation och 71 verksamhetstabeller vid appbyte/läsprov. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-VERIFICATION.md) och [leverans/användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-RELEASE.md). Ny mänsklig begriplighetsbedömning väntar; genomförandeetapper och full pilot-/fasacceptans kvarstår. Historik nedan ändras inte.

**APL-UX beställt 2026-10-16:** Användaren rapporterar att APL-funktionen fungerar mycket bra men att datum-/terminshanteringen behöver förenklas. Vald riktning är **årskurs och termin först; exakta veckor eller datum senare**. [APL-10](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-10-SUMMARY.md) avslutas med öppet APL-UX-01, inte full begriplighetsacceptans. De elva ursprungliga paketuppgifterna är redovisade. Nuvarande lokala leverans består medan förenklingen genomförs; etapp 2–3 och full fasacceptans kvarstår.

**APL-etapp1 levererad2026-10-16:** Användaren godkände tre migrationer och3012-byte. [APL-09](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-09-SUMMARY.md) verifierar installation, originalbevarande och riktig läsande OIDC/MFA. Samma testade68cecb4/209-fils kandidat kör lokalt. 10/11 paketplaner klara; [begriplighetsprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md) väntar. Etapp2/3 och full fasacceptans kvarstår. Äldre APL-status nedan är historik.

**APL-etapp1 verifierad2026-10-16:** 9/11 paketplaner klara. [APL-08](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-08-SUMMARY.md) passerar34 faktiska API-/browserkontroller med riktig lokal OIDC, dator/telefon och full cleanup. Samma68cecb4-kandidat och tre migrationer är förberedda för [konkret installationsbeslut](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md); läsande förkontroller PASS. Aktiv3012/databas är oförändrade. Installation, mänsklig begriplighet och etapp2–3 kvarstår. Pilotens42 krav, åtta faser och historiska88/100 planer/3 verifierade faser ändras inte. Äldre APL-status nedan är historik.

**APL-riktning godkänd 2026-10-16:** Användaren svarade ”låter som en bra lösning” på [researchens](research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) tre etapper och rekommenderade start i timplanen. [Kontext](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md), [kontrakt](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md) och [planpaket](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md) konkretiserar etapp 1: perioder, innehåll, total/varav APL och separata rektors-/huvudmannabeslut. Elva planer i åtta vågor har passerat [oberoende plancheck](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-PLAN-CHECK.md); nästa steg är APL-01. Inga produkt-/databasändringar eller nya verifierade krav följer av planeringen. APL1-01–08 är paketets lokala acceptanskriterier; pilotens 42 krav, fasantal och tidigare bevis består. [APL-gapet](phases/05-bevarade-utbildnings-och-klassfloden/05-APL-GAP.md) är öppet tills implementering och verifiering är gjorda.

**Rektors programplaner 2026-10-16:** Rektor kan nu skapa programplansutkast och kopiera till nästa kull för vald egen skola. Huvudmannen godkänner fortfarande. SQL45, faktiskt API/browser23 och lokal leverans på 3012 med bevarade data PASS. [Resultat och kravspårning](phases/05-bevarade-utbildnings-och-klassfloden/05-RECTOR-PROGRAMPLAN-SUMMARY.md). Avgränsat delbevis för ADMIN-02/03/04 och PLANERING-01; full fasacceptans, historiska 88/100 planer och 3/8 faser består.

**Namngivna timplaner och klassflöde 2026-10-16:** NAMED-TIMPLANS-UX01–12 är tekniskt klara och samma verifierade bygge kör lokalt på 3012 efter uttryckligt godkänd migration. Paketet berör ADMIN-02/03/04 och PLANERING-01/04/05 inom fas 5. [Verifieringsresultat](phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md) och [lokal leverans](phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-12-SUMMARY.md). Användaren svarade ”funkar bra” efter leverans och provuppgifter. [Begriplighetsprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-USER-TRIAL.md) registreras som användarrapporterat godkänt och CLASS-COHORT-UX-01 avslutas. Enhet och delsteg särredovisades inte; inget fullständigt krav- eller fasgodkännande antas. Historiska 88/100 planer och 3/8 faser består. Äldre noteringar nedan är historik.

**Klassorganisationens användarprov2026-10-15:** Användaren bekräftar ”ok allt funkar” och efterfrågar smidigare UI med färre tekniska knappar. CLASS-COHORT-10 avslutas;11/11 paketplaner klara. Funktionsgodkännandet särredovisar inte enhet/delsteg. UI-anmärkningen finns i [samlad UI-genomgång](todos/pending/2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md). Fulla krav/fas5 och historiska88/100 samt3/8 består. Äldre lägesnoteringar nedan är historik.

**Klassorganisationens nästa etapp 2026-10-15:** Användaren har bekräftat oförändrade mandat: rektor/skoladministratör arbetar med klasser inom samma skola, utbildning och kull; huvudmannen får inget nytt klassmandat. [Genomförandepaket](phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-IMPLEMENTATION.md) är färdigt med elva granskade planer i nio vågor, utifrån aktuell kod och [SS 12000-mappning](phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md). Kopieringsprovet är redan användarrapporterat godkänt. Äldre noteringar nedan är historik; ingen ny implementation eller fasacceptans följer av planeringen.

**Klassorganisation 2026-10-15:** Användaren beställer research om tidigare läsårsval och klassval/skapande vid ny programplan. [Research](research/KLASSER-KULLAR-OCH-PLANER-2026-10-15.md) och [planeringspunkt](todos/pending/2026-10-15-klassorganisation-vid-utbildningsstart.md) är klara. Den visade timplanens frysta start är 2027-08-01, så 2027/28 är giltigt i just exemplet; ingen sparad förtidig koppling är belagd. Förslag: tidigt frivilligt klasssteg per utbildning/kull, separerat från timplansversion och med oförändrade mandat i första etappen. Ingen implementation eller kopieacceptans följer av researchen.

**Aktuell fasbedömning:** Skolflödets användarprov är godkänt och den äldre registeradapterns Workerfel är rättat. [Samlad kravbedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md) pekar ut endast [kullkopieringens mänskliga prov](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-REMAINING-USER-TRIAL.md) som nästa användartest. Godkända skol-/års-/besluts-/versionsprov ska inte upprepas. Bygge `f4987b6` kör på 3012; API-adapterprov, 27 Node-prov och fem läsande OIDC-kontroller passerar. Prestandabacklogg och historiska integritetsavvikelser består; fasen är inte slutgodkänd.

**Skolimport och registeruppdatering 2026-10-14:** ADMIN-01:s skyddade huvudmannaflöde är implementerat och lokalt verifierat: SQL62, Node23, UI24, faktisk Workerpreflight25/slut25 samt läsande lokal OIDC5 PASS. Samma 197 byggfiler från `970782f` kör på 3012. Rektor, lokala årskurser, elevregisterkälla och mandat bevaras; import tilldelar inga uppdrag. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-VERIFICATION.md). Nästa steg är [det avskilda användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-USER-TRIAL.md), **awaiting_user**, med simulerade skolor på 5198. Fullt krav-/fasgodkännande, historiska avvikelser och prestandabacklogg består. Tidigare versionsbytesprov är användarrapporterat godkänt; kullkopiering/mobil saknar separat resultat. Äldre noteringar nedan är historik.

**Fasgenomgång och kullkopiering 2026-10-14:** Två verkliga luckor identifierades: huvudmannens skyddade skolimport/registeruppdatering (ADMIN-01) och delkopiering vid avbrott (ADMIN-03). Kopieringen är rättad: ram, terminer och skolor sparas atomärt med requestbundet statuskvitto. SQL44, Workerpreflight16/slut16, UI18, faktisk browser2, Node41, typ/lint/bygge/handbok PASS. 3012 kör prövat `2836908`, 192 bytekontrollerade filer. [Nytt användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-CLASS-USER-TRIAL.md) för kopiering och klass/läsår/version väntar; befintliga SAM_TEST-utkast behöver först granskas/fastställas för klassprovet. [Kravgenomgång](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-AUDIT-20261014.md) redovisar ADMIN-01, historisk 05-22-avvikelse och 1 827 äldre saknade loggankare som öppna. Inga nya saknade ankare i kopieringsproven. Fulla krav/fasacceptans och historiska 88/100 samt 3/8 består. Äldre noteringar nedan är historik.

**Beslutskedjans användarprov godkänt 2026-10-12:** Användaren svarade ”Allt funkar” efter provet med rektorns inskickande, huvudmannens återsändning, rättning och fastställande. Registrerat som användarrapporterat godkänt för den lokala stödda gymnasiekedjan; planobjekt, roller, enheter och enskilda steg särredovisades inte. Det tidigare överlämnings-/godkännandegapet är därmed levererat och godkänt inom denna avgränsning. Klasskoppling, kullkopiering och fulla krav/fasacceptans får inga nya godkännanden. Nästa steg är en sammanställning av fas 5:s återstående krav mot verifieringsbevisen, före eventuell ny plan eller användarprov. Historiska 88/100 planer och 3/8 verifierade faser består. Se [användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-USER-TRIAL.md). Äldre lägesnoteringar nedan är historik.

**Användarprov05-43 godkänt2026-10-09:** Användaren svarade ”allt fnukar” efter årsplaneringens femstegsprov. Registrerat som användarrapporterat godkänt; enhet, uppdrag och enskilda steg särredovisades inte.88/100 planer och3/8 verifierade faser består. Fulla krav,05-17, fas5 och rektors färdigmarkering/huvudmannens godkännande förblir öppna. Nästa arbete behöver planeras inom kvarstående gap; detta svar startar ingen ny implementation. Se [användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-USER-TRIAL.md).

**UI43 levererad för användarprov:** SlutC16, läsande release och exakt3012-överföring med18 före/efter är accepterade. Samma prövade build179,180 filer och15 hela verksamhetstabeller bevarade; handbok byggd en gång.88/100 planer,3/8 verifierade faser. Mänskligt prov är awaiting_user; fulla krav och formella beslut kvarstår. Se [slutredovisning](phases/05-bevarade-utbildnings-och-klassfloden/05-43-SUMMARY.md) och [femstegsprov](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-USER-TRIAL.md).

**UI42 färdigt 2026-10-08 — avgränsat PASS:** Full O01–18 på dator och telefon, ROOT42476 känd exit0/rå `c39fa94964b254adaa7f141c1d6dd8b5b091b3e50334653af31233092dffa901`, source `ac41d6c3ed9cdd9977bee6a9207fa30a146ad165`, spec `93c6b4e06eca6563059b9cb5f877a818a44ba9b553e6ee184125969998b0e639` och bevarat bygge `17924ff417899dd5863c394bb4496a5bf22865bd`. 36/36 PASS utan skips/omprov/flaky; 36 normalcleanup/full15 exakt SEARCH/sex avslutsflaggor/egna16 samt foreignverksamhet/DDL0. 20 explicita/49 skyddade/241 produktfiler/båda parsers och fyra historiska C16/extraC04/L36/G38-kedjor matchar; inget nytt appbygge. Terminal audit197363/114cc50c och auditerade identiteter5387/3ebcec87. 16 geometrier minst44×44/contained och16 PNG/14 unika ROOT-granskade; telefonens fokushopplänk över text och O05:s svaga dialogtext redovisas, ingen felfriUI- eller orsaksförklaring. Oberoende full fil-/3/3-målgranskning PASS: `work/pilot/results/phase5-42-seventh-independent-full-file-review-20261008.json` · SHA `281713e9082cb51ecae6d61559df54c1660b5f62cae9cfcf5e81bb8df75867cc`. 87/100 planer,3/8 verifierade faser; nästa [05-43](phases/05-bevarade-utbildnings-och-klassfloden/05-43-PLAN.md) med separat slutC16/release/3012 och konkret användarprov. Alla första fel och recoveries består; fulla PLANERING-/ADMIN-krav/fas5/05-17/formell rektors färdigmarkering och HM-godkännande kvarstår. Ordinarie3012/5dd7baf är inte överförd av detta steg.

**UI41 färdigt2026-10-08 — avgränsat PASS:** [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-41-SUMMARY.md) och oberoende3/3-verifiering. FullG38 på ursprungligf355/G4b rå9a28 består. Efter exakt tvåfilsrättning på6e51629 passerar separat G13/G14×2 rå411346b2 och oförändrat C73-C04×2 rå229b1f3c; samtliga6normalcleanup/full15 exaktSEARCH/6flaggor/own16+foreignDDLzero/241produktbytes/44px-geometri PASS. Ingen historik märks om, första C04FAIL9354 består. Literal2027/start2026→åk2/fullsexindex/frystkälla/returcache och held/unknownspärr verifierade på dator/telefon. ProviderWAIT borta efter accepterat lokalt årsval; separat uppdragsnotis/fokushopplänk och C04:s inläsande slutbild är begränsningar.86/100,3/8; nästa42 GR/IM→43 handbok/slutprov/konkret användarprov. Fulla krav/formella beslut består; vanlig3012 fortfarande5dd7baf.

**Sökbara årstabeller2026-10-08 — avgränsat PASS:** [05-40-SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SUMMARY.md). FullL36 dator/telefon source/build1f3e6b2; faktisk sök/filter/sort/50+2/exakt äldre skolversion/skapandemandat/årsöverblick samt full15/audit-/identitetscleanup/geometri PASS. Första fel bevarade.85/100 planer,3/8 verifierade faser; nästa41–43 och användarprov. Fulla krav/formella beslut/mobilårsknappar kvarstår; vanlig3012 oförändrad.

**Planeringskontext2026-10-07 — avgränsat PASS:** [05-39-SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-39-SUMMARY.md). FullC16 dator/telefon, separata registerår/filter, retur/Back/reload, scopebyte och pågående/okända writes PASS. Samma source/build07737ba, full15/audit-/identitets-/owncleanup, kontrollstorlek44px och containment PASS. Alla första fel/egna recoveries bevarade. 84/100 planer,3/8 verifierade faser; nästa05-40–43 och konkret användarprov. Fulla krav/formella beslut/mobilårsknappar kvarstår; vanlig3012 oförändrad. Äldre besked nedan är historik.

**Kod-/benämningssökning2026-10-07 — avgränsat PASS:** [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SEARCH-DETAILS-SUMMARY.md). Fullrollback/exakt apply/applied271/38/23, oförändrade93/18×2 ochAPI15/247, faktisk sökning19/204 och12HTTP-svar under4,884s PASS. Endast privatrows/journal06123000 ändrade, samma28grants/full15/råACL/audit-/identitetsankare/cleanup. Första fel och exakt egen återhämtning bevarade.83/100 planer,3/8 verifierade faser; nästaUI05-39–43 och konkret användarprov. Fulla krav/verksamhetsgap/mobilgap består; vanlig3012 fortsatt5dd7baf. Äldre pågående SEARCHbesked nedan är historik.

**Prestandakorrektiv 2026-10-07 — avgränsat PASS:** [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-SUMMARY.md) och oberoende3/3-verifiering avslutar05-38-READ-PERFORMANCE. Fullrollback/apply/applied143/46+93/18, faktisk förbättring7,68–15,21× och oförändradAPI15/247/full15/ACL28/auditbevarande PASS. 82/100 planer genomförda; verifierade faser fortsatt3/8. Nästa SEARCH, sedanUI05-39–43 och konkret användarprov. Fulla krav och båda verksamhets-/mobilgapen är fortfarande öppna. Äldre pågående korrektivbesked nedan är historik.

**Färsk genomförandeprecisering 2026-10-07:** Kod-/benämningssökningen som 05-40 redan kräver saknas i dagens SQL/PlanningRow. [05-40-SEARCH-DETAILS](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SEARCH-DETAILS-PLAN.md) är en avgränsad teknisk förutsättning efter prestandakorrektivet och före UI05-39–43; samma privata hjälpare/28 grants, ingen ny verksamhetsregel. Dessutom är sparstatus-/Back-gränser, exakt versionsöppning, 44px mobilknappar och GR:s okända kolumnkarta preciserade efter färsk kodgranskning. Planerna är ännu inte genomförda eller verifierade. Paketet har tio sekventiella waves; kör endast dess uttryckliga dependencykedja, inte hela fasens äldre planer.

**API-läsning 2026-10-07 — avgränsat PASS:** [05-38](phases/05-bevarade-utbildnings-och-klassfloden/05-38-SUMMARY.md) har faktisk preflight och permanent slutmatris 15 fall/247 kontroller vardera PASS. Exakt tre läsgrants ger 28 Worker-entrypoints; 11 hjälpare är fortsatt stängda. Alla 15 hela originaltabeller/tidsstämplar, audit/identitetsankare och övriga definitioner/rättigheter bevarade. Nästa är [05-38-READ-PERFORMANCE](phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-PLAN.md) för uppmätt långsam 52-raderslistning, därefter UI 05-39–43. 81 av 100 planer är genomförda; fulla PLANERING-/ADMIN-krav, fas 5 och båda gapen är fortsatt Pending. Ordinarie 3012 är oförändrad.

**SQL-läsgrund 2026-10-07 — avgränsat PASS:** [05-37](phases/05-bevarade-utbildnings-och-klassfloden/05-37-SUMMARY.md) är genomförd och exakt tillämpad i isolerad lokal protected-databas. Både rollback och applied: 93 SQL-prov, 18 faktisk kontraktsparitet och 3 verkliga kundlåsväntor PASS; Node 6 och riktade lås 9 PASS. Alla 15 hela originaltabeller/tidsstämplar, säkerhetsaudit, gamla ACL/funktionsdefinitioner och journal bevarade. Tre nya läs-RPC och elva hjälpare är fortsatt stängda; samma 25 befintliga Worker-entrypoints. GR-originalkartor saknar proveniens och ger okända årstimmar. [Exakt inventering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-FUNCTION-INVENTORY.md). Nästa plan är **05-38, skyddad API-läsning och exakt läsgrant**; 80 av 98 skrivna planer är genomförda. PLANERING-01–05/hela fas 5 och övriga gap är fortsatt Pending. Ordinarie 3012 är oförändrad.

**Läsårsmodell 2026-10-06 — avgränsat PASS:** [05-36](phases/05-bevarade-utbildnings-och-klassfloden/05-36-SUMMARY.md) är genomförd: källstyrt GY-/GR-/IM-årssnitt, strikta läskontrakt och skilda poäng-/tim-/klassmått. 70 riktade Node-prov, 20 oberoende verifierarprober och typ/lint PASS. Ingen ny SQL/API/UI eller serverändring följer av modellsteget. PLANERING-01–05 och hela fas 5 är fortsatt Pending. Nästa plan är **05-37, stängd SQL-läsgrund**; 79 av 98 skrivna planer har SUMMARY.

**Teknisk slutverifiering 2026-10-06 — PASS:** 05-23 A–E är avslutad enligt aktuell ram. [E-verifieringen](phases/05-bevarade-utbildnings-och-klassfloden/05-23-E-VERIFICATION.md) visar 149 dator-/telefonfall, 170 API-fall/1 077 kontroller, 2 512 SQL-prov och 674 modell-/serverprov PASS. Sju uttryckliga skips gäller sex borttagna paketeditorfall och ett telefonfall på dator. 150 fixturer städade; 14 hela verksamhetstabeller inklusive tidsstämplar, ACL/funktionsfingeravtryck och samma 18 befintliga scenarier/44 auditpar före och efter bevarade. Programplanssvitens tidigare nio fel sammanfaller med datorvila; oförändrad återkörning ger 40/40 PASS. Felhistoriken består. Samma separata bygge `e9ca1e7`; vanlig 3012 behåller `5dd7baf`. Grundflödet är användarrapporterat godkänt. ADMIN-02/03/04, hela fas 5, historisk 05-22 metadata PARTIAL och båda nya gapen kvarstår. Läsårsmodellen 05-36 är därefter färdig; nästa plan är 05-37; äldre 05-25–35 kräver omplanering.

## Overview

**Kompletterat beslutsbehov 2026-10-06:** Rektorn ska uttryckligen kunna färdigmarkera program-/timplansarbete och huvudmannens behöriga representant ska kunna godkänna det. [Gap och verifieringsmål](todos/pending/2026-10-06-rektor-fardigmarkerar-och-huvudmannen-godkanner-planarbete.md) ska in i omplaneringen av 05-25/26 och 05-32/33. Automatisk ”Klar för beslut” är ingen överlämning. Behovet är pending; grundflödets godkända användarprov nedan kvarstår.

**Användarresultat 2026-10-06:** Grundflödet programplan → rätt skolas timplan → timinmatning/återöppning är användarrapporterat godkänt. Se [omfattning och avgränsning](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-USER-TRIAL.md). Teknisk 05-23/E är därefter PASS; fulla krav/fasstatus och genomförandet av 05-36–43 kvarstår; äldre provstatusar längre ner beskriver respektive dåvarande omgång.

**Milestone:** v1.0 — Säker administration inför en pilot

**Status:** Godkänd av användaren 2026-09-11 — 42 detaljkrav och åtta faser är fastställda. Fas 1–3 är genomförda och verifierade lokalt syntetiskt; fas 4 genomförs (24 av 25 planer klara; mänskligt användarprov och fasverifiering återstår).

**Granularity:** standard

Den befintliga appen utvecklas stegvis till en avgränsad pilot: först en återställbar baslinje, därefter verifierad åtkomst och spårbara mandat, beständiga elever och en avstämd registerimport. Gymnasiets utbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar bevaras och prövas vid berörda förändringar. Faktisk kommunanslutning och beslut om verkliga elevuppgifter har egna godkännandegränser.

## Phases

Heltalsfaser är planerad milstolpeomfattning. Eventuella decimalfaser förs in mellan sina omgivande heltal. Fas 1 är genomförd (alla 10 planer körda, användarens checkpoint godkänd 2026-09-12) och verifierades 2026-09-12 i `01-VERIFICATION.md`; fas 2 verifierades 2026-09-21 och fas 3 stängdes efter mänsklig verifiering 2026-09-28. Fas 4 genomförs; faserna 5–8 är inte genomförda. Decimalfaserna 05.1–05.8 infogades 2026-10-19 efter användarbeslut och körs före fas 6.

- [x] **Phase 1: Baslinje och avskild pilotmiljö** - Befintliga arbetsflöden går att pröva och återställa inom en tydlig pilotgräns. (completed 2026-09-12)
- [x] **Phase 2: Verifierad kontoåtkomst** - Konton, arbetskontext och sessionsspärr styr den första spårbara skyddade operationen.
- [x] **Phase 3: Mandat och skyddade datavägar** - Huvudman, rektor och personal får endast sitt aktuella mandat med kontrollerbar säkerhetslogg. (completed 2026-09-28)
- [ ] **Phase 4: Beständigt och skyddat elevregister** - Behörig administration kan söka, ändra, följa och exportera rätt elever.
- [ ] **Phase 5: Bevarade utbildnings- och klassflöden** - Uppskattade skol-, utbildnings- och kullflöden fungerar med den nya säkerhetsgrunden.
- [ ] **Phase 05.1: Tjänstefördelning** (INSERTED) - Rektor fördelar undervisning och uppdrag, fastställer och publicerar; läraren ser sin tjänst.
- [ ] **Phase 05.2: Schemaläggning med Rust-schemamotor** (INSERTED) - Schemat beräknas i en egen Rust-tjänst och granskas och publiceras i appen.
- [ ] **Phase 05.3: Klassorganisation** (INSERTED) - Klassers livscykel, delning, sammanslagning och importerade klasser med bevarad historik.
- [ ] **Phase 05.4: Lärarbehörigheter** (INSERTED) - Skolverkets behörighetsunderlag matchas mot tjänstefördelning och schema.
- [ ] **Phase 05.5: Interkommunal ersättning** (INSERTED) - Granskningsbart, attesterat ersättningsunderlag per hemkommun.
- [ ] **Phase 05.6: Köpbara moduler** (INSERTED) - Moduler köps, kombineras och avslutas var för sig; komponenter kan bytas.
- [ ] **Phase 05.7: SPAR-synk** (INSERTED) - Folkbokföringsuppgifter hålls aktuella med synliga avvikelser och bevarade rättelser.
- [ ] **Phase 05.8: Stark identitet och BankID** (INSERTED) - BankID och Sverige-id vid inloggning och inför känsliga åtgärder, skilt från mandat.
- [ ] **Phase 6: Avstämd registerimport** - En begränsad anslutning kan granskas, köras om och följas i användbara dator- och telefonflöden.
- [ ] **Phase 7: Verifierad kommunanslutning** - Faktiska identitets- och registeranslutningar har godkända prov och uppmätt kontolivscykel.
- [ ] **Phase 8: Prövad pilotdrift och informationshantering** - Kunden kan fatta pilotbeslut med provad återställning, incidenthantering och avveckling.

## Phase Details

### Phase 1: Baslinje och avskild pilotmiljö

**Goal**: Projektansvarig kan bedöma och återställa den befintliga appen, medan pilotens provdata och öppna kundbeslut hålls tydligt avgränsade.
**Depends on**: Nothing (first phase)
**Requirements**: BASE-01, BASE-02, PILOT-01
**Success Criteria** (what must be TRUE):

1. Projektansvarig kan återgå till en versionshanterad baslinje och läsa aktuella regressionsresultat för gymnasieutbildning, kurs-/nivåtillägg, kullkopiering och klass–timplanskoppling. Tidigare tester är identifierade som historik. (BASE-01)
2. Pilotansvarig kan använda en avskild testmiljö där demoinloggning, installerad demoetablering och automatisk exempeldata inte ger åtkomst till skyddade driftvägar. (BASE-02)
3. Pilotansvarig kan granska en daterad anslutningsprofil med organisation, elevfält, originalkälla, skrivansvar och volym; ännu ej valda kund- och leverantörsuppgifter framgår som öppna beroenden. (PILOT-01)

**Plans**: 10 plans

Plans:

- [x] 01-01-PLAN.md — Git-baslinje med tagg `fas1-baslinje` och återställningsprov (verify-baseline.mjs)
- [x] 01-02-PLAN.md — Daterad anslutningsprofil docs/pilot/connection-profile.md (PILOT-01)
- [x] 01-03-PLAN.md — Runtime-läge stängt som standard, klientgräns utan klient, laddare utan demoinloggning/seed, exempelskript med tom Supabase-miljö
- [x] 01-04-PLAN.md — Pilotfixtur: en huvudman, grundskola + gymnasium, 2 klasser × 6 elever per skola (TDD)
- [x] 01-05-PLAN.md — Disponibla lokala Supabase-mål med målskydd, karantänmigration och pgTAP-prov
- [x] 01-06-PLAN.md — Negativa API-prov (tre identiteter, rader oförändrade) och positiva baslinjeflöden mot baseline-målet
- [x] 01-07-PLAN.md — UI: blockerad start, Provmiljö-märkning, skolväljare Exempelskola, sann lagringsstatus, gatad telefonstart
- [x] 01-08-PLAN.md — Playwright 1.63.0 med projekt dator/telefon/blockerad/byggd; browserprov av bevarade flöden, skolföljande Elever-vy och isolering
- [x] 01-09-PLAN.md — Baslinjerapport docs/pilot/baseline.md, startanvisning, valideringskarta och användarens checkpoint på dator/telefon (kravstatus uppdateras först efter checkpointen)
- [x] 01-10-PLAN.md — Sparordningsreproducerare som KNOWN-ISSUE (ägare fas 5) och sammanställare verify:phase1

**UI hint**: yes

### Phase 2: Verifierad kontoåtkomst

**Goal**: Personal kan arbeta i en verifierad och återkallningsbar arbetskontext, med kundavgränsning och spårbarhet från den första skyddade ändringen.
**Depends on**: Phase 1
**Requirements**: IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01
**Success Criteria** (what must be TRUE):

1. En verifierad företrädare kan etablera kundens första medlemskap; enbart organisationsnummer eller e-postdomän räcker inte för att få behörighet. (IAM-01)
2. Personal kan välja bland sina giltiga uppdrag utan sammanblandade rättigheter och nekas annan kunds objekt och metadata även vid direkta anrop, sökning, export och tillgängliga filvägar. (IAM-03, ACL-01)
3. Efter utloggning nekas den avslutade appsessionen skyddad åtkomst; vid utloggning och kontextbyte rensas föregående elevinnehåll även mellan flikar. (IAM-04)
4. En administratör kan spärra medlemskap eller avsluta uppdrag så att nästa skyddade anrop nekas med en redan utfärdad token. (IAM-05)
5. Behörig granskare kan följa beständiga ändringar med serververifierad aktör, faktiskt uppdrag, tid, källa, objekt och resultat; manipulerad klientroll kan inte förfalska historiken. (AUDIT-01)

**Plans**: 12 planer i 11 vågor — granskade och redo att genomföras 2026-09-13

- [x] 02-01-PLAN.md — Lokal testidentitet och skyddad körmiljö
- [x] 02-02-PLAN.md — Databasens identitets- och sessionsgrund
- [x] 02-03-PLAN.md — Tidigt prov av databasanslutning och OIDC i Worker
- [x] 02-04-PLAN.md — Körbevis och kontrollpunkt för inloggningsflödet
- [x] 02-05-PLAN.md — Kund-, uppdrags- och loggmodell
- [x] 02-06-PLAN.md — Serverns behörighets- och sessionskontroller
- [x] 02-07-PLAN.md — Personbundna inbjudningar, spärr och avslut
- [x] 02-08-PLAN.md — Granskarlogg och första skyddade ändringen
- [x] 02-09-PLAN.md — API-prov av åtkomst och kundisolering
- [x] 02-10-PLAN.md — Uppdragsväljare, flikrensning och administrationsvyer
- [x] 02-11-PLAN.md — Webbläsarprov på dator och telefon
- [x] 02-12-PLAN.md — Samlad fasgrind, bevisrapport och användarbedömning

**UI hint**: yes

Prov mot en avskild testidentitet kan utveckla och verifiera appens kontrakt. Den faktiska IdP-anslutningen och fördröjningen från extern kontokälla godkänns i fas 7; de får inte markeras uppfyllda här. Sessions- och cookieflödet provas tidigt i byggd Worker innan elevlagringen bygger vidare på det.

### Phase 3: Mandat och skyddade datavägar

**Goal**: Varje personalroll kan utföra sitt tillåtna uppdrag, och pilotens åtkomst går att granska utan att alternativa datavägar kringgår skydd eller loggning.
**Depends on**: Phase 2
**Requirements**: ACL-02, ACL-03, ACL-04, ACL-05, AUDIT-02, AUDIT-03
**Success Criteria** (what must be TRUE):

1. Huvudmannen kan utse rektor inom sin organisation; en rektor kan inte skapa rektorsmandat för sig själv eller någon annan. (ACL-03)
2. Rektor kan tilldela och avsluta läraruppdrag bara inom sina aktuella skolenheter och giltighetstider; huvudmannens vanliga roll nekas samma tilldelning. (ACL-02)
3. Lärare och skoladministratör kan endast utföra elev- och administrationsåtgärder enligt den fastställda uppdragsmatrisen; okänd eller saknad rättighet nekar åtkomst även vid direkt anrop. (ACL-04)
4. Kommunens IT-funktion kan hantera anslutningen utan generell elevinsyn; eventuell supportåtkomst upphör efter sin tilldelade tid och går att följa. (ACL-05)
5. Behörig säkerhetsfunktion kan följa de syntetiska elevläsningar, exporter och nekade försök som loggpolicyn kräver, även genom alternativa datavägar. Pilotansvarig kan kontrollera loggarnas begränsade åtkomst, minimerade innehåll, beslutade lagringstid och provade beteende vid loggbortfall. (AUDIT-02, AUDIT-03)

**Plans**: 7 planer i 7 sekventiella vågor — granskade 2026-09-22. Se 03-PLAN-REVIEW.md och 03-EXECUTION-CONTRACT.md för verifieringsgrindar och kvarstående risker.
**UI hint**: yes

Den första syntetiska elevoperationen används för att bevisa hela skydds- och loggkedjan. Elevregistret i fas 4 får inte öppna en dataväg som saknar samma kontroller; kvarvarande direkt databasåtkomst måste omfattas eller stängas. Dessa kontroller följer varje senare ändring och import.

### Phase 4: Beständigt och skyddat elevregister

**Goal**: Behörig administratör kan administrera en elev från sökning till sparad ändring och omläsning, med historik, informationsursprung och skyddade uppgifter.
**Depends on**: Phase 3
**Requirements**: STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

1. Administratören kan återfinna samma elev och sparade basuppgifter efter utloggning och omläsning, med stabilt internt elev-ID skilt från inloggningskonto. Sökning per skola/läsår, åtskillnad av namnlika elever och återgång till samma urval fungerar med tillåtna uppgifter. (STU-01, STU-05)
2. Administratören kan se aktuell, framtida och avslutad skolplacering samt hantera tillåtna datumsatta klasstillhörigheter. Klassbyte bevarar historik och byter inte automatiskt utbildning. (STU-02, STU-03)
3. Administratören kan se uppgiftens ursprung och rätta i ansvarig källa; konkurrerande källor och två samtidiga ändringar kan inte tyst skriva över nyare uppgifter utan ger begriplig konflikt. (STU-04, STU-06)
4. Behörig personal kan genomföra pilotens fastställda arbetsfall med en skyddad syntetisk elev. Obehöriga läsvägar, sökträffar, fel och aviseringar röjer varken skyddade uppgifter eller metadata. (DATA-01)
5. Administratören kan exportera ett uttryckligt elevurval med endast tillåtna fält. Serverns behörighetskontroll, aktuella spärrar, skyddsregler och loggning gäller även om exporten anropas direkt. (DATA-02)

**Plans**: 25 planer i 15 vågor, 24 genomförda — planstrukturen granskad 2026-09-28; 04-23 tillagd efter våg 7 (användarbeslut 2026-09-28); 04-24 och 04-25 tillagda efter våg 8 för luckorna skyddad export och Worker-avbrott. 04-21:s handbok och förnyade fullgrind är klara; 04-22:s användarprov och separat fasverifiering återstår.

- [x] 04-01-PLAN.md — Fastställ registerkontrakt och rena datumregler (våg 1)
- [x] 04-02-PLAN.md — Bygg registerschema och referensdata (våg 2)
- [x] 04-03-PLAN.md — Flytta provrelationer och inför huvudmannens skyddsbehörighet (våg 3)
- [x] 04-04-PLAN.md — Implementera serverurval och fältprojektion (våg 4)
- [x] 04-05-PLAN.md — Spara datumändringar med konflikter och historik (våg 5)
- [x] 04-06-PLAN.md — Skydda lokal rättelse mot simulerad källa (våg 6)
- [x] 04-07-PLAN.md — Transportera säkra fel och stoppa gamla svar (våg 2)
- [x] 04-08-PLAN.md — Utöka obligatorisk minimerad registerlogg (våg 2)
- [x] 04-09-PLAN.md — Koppla läs-API till registerprojektionen (våg 5)
- [x] 04-10-PLAN.md — Öppna ändring, personnummer och export via skyddat API (våg 7)
- [x] 04-11-PLAN.md — Gör skyddsbehörighet hanterbar för huvudmannen (våg 4)
- [x] 04-12-PLAN.md — Bygg lista, läsår och säkert urval (våg 6)
- [x] 04-13-PLAN.md — Bygg elevkort och ändringsdialoger (våg 8)
- [x] 04-14-PLAN.md — Porta första delen av SQL-regressionen (våg 7)
- [x] 04-15-PLAN.md — Porta resterande SQL och lokala fixturer (våg 8)
- [x] 04-16-PLAN.md — Skapa fullständiga registerprov och syntetiska scenarion (våg 10)
- [x] 04-17-PLAN.md — Avveckla elevprovet utan alternativa datavägar (våg 9, körs sist i vågen)
- [x] 04-18-PLAN.md — Porta tidigare API- och browserbevis (våg 11)
- [x] 04-19-PLAN.md — Verifiera hela elevflödet i webbläsare (våg 12)
- [x] 04-20-PLAN.md — Bygg fullständig fasgrind och beviskarta (våg 13)
- [x] 04-21-PLAN.md — Uppdatera handboken med prövat registerbeteende (våg 14)
- [ ] 04-22-PLAN.md — Genomför användarprov och redovisa fasens gräns (våg 15)
- [x] 04-23-PLAN.md — Öppna Worker-körrätt för registrets skriv-, personnummer- och exportfunktioner (våg 8, körs först i vågen)
- [x] 04-24-PLAN.md — Visa skyddade elever för behörig administratör i lista och export (våg 9, efter 04-25 och före 04-17)
- [x] 04-25-PLAN.md — Utred och åtgärda lokala Worker-avbrott på nekade anrop (våg 9, körs först i vågen)

Granskningsrapport: `04-VERIFICATION-CHECKER.md`.
**UI hint**: yes

### Phase 5: Bevarade utbildnings- och klassflöden

**Goal**: Behörig personal kan fortsätta skolans befintliga planeringsarbete med riktiga medlemskap och explicita, beständiga klasskopplingar.
**Depends on**: Phase 4
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):

1. Huvudmannen kan lägga till skola via organisationsnummer eller skolenhetskod med adress och skolform från registret; en registeruppdatering bevarar lokalt tillsatt rektor. (ADMIN-01)
2. Behörig personal kan skapa gymnasieutbildning och lägga till kurser/nivåer med befintliga planversioners beslutsregler efter bytet av identitet och åtkomst. (ADMIN-02)
3. Huvudmannen kan kopiera utbildningsupplägg till en senare elevkull och få egna planutkast utan att elever, klasser eller tidigare beslut kopieras. (ADMIN-03)
4. Behörig personal kan koppla en beständig klass till en fastställd timplansversion och se rätt läsårsunderlag; en ny version flyttar inte den befintliga kopplingen. (ADMIN-04)

**Plans**: Senare DECISION/VOCATIONAL/OPERATIONAL, årsplanering 05-36–43, COPY-ATOMIC och SCHOOL-REGISTRY ersätter flera äldre delplaner. [Aktuell målspårning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md) skiljer ersatt plan från genomförd körning. Nästa checkpoint är endast kullkopieringens mänskliga prov. Full fasacceptans och historiska integritetsavvikelser kvarstår; historiska totalsiffror räknas inte om.

- [x] 05-01-PLAN.md — Kodförankrat mandat-/bevarandekontrakt och verifieringsmatris; inga skyddade vyer öppnade
- [x] 05-02-PLAN.md — Lokal sparordning/databas-ID rättade med ordinarie regression; 346/346 tester, typ/lint/bygge PASS; inga skyddade vyer öppnade
- [x] 05-03-PLAN.md — Stängd mandatavgränsad timplansläsning/celländring med revision och atomisk DB-audit; SQL 77/77, lås 4/4 PASS; session/API/UI återstår

- [x] 05-04-PLAN.md — Sessionskopplad timplans-API, MFA/konflikt/audit, preflight/final 29/29 PASS och exakt två Worker-grants; UI/gymnasieskrivning stängda

- [x] 05-05-PLAN.md — Auditerad GR/IM-lista och kolumnmetadata, API preflight/final 39/39, SQL 59/77/27, lås 4/4 och exakt tre Worker-entrypoints
- [x] 05-06-PLAN.md — Skyddad timplansvy med celländring, osparat skydd/konflikt/rensning, browser 18/18 och byggd handbok; övriga planeringskommandon stängda
- [x] 05-07-PLAN.md — Reproducerbart katalogartefakt, exakta program-/ämnes-/nivåreferenser och serverintegritet; 451/451 prov, typ/lint/skyddat bygge PASS; inga gymnasieskrivningar öppnade

- [x] 05-08-PLAN.md — Oföränderlig SQL-katalog och stängda sessions-/mandatbundna utkast med CAS/audit; 632 SQL, 455+5 Node, 42 paritet och 6 observerade låsväntansfall + rollback PASS; inga API/grants/beslut öppnade

- [x] 05-09-PLAN.md — Skyddad programplans-API, preflight/final 48/48, SQL 663, gamla timplans-API 39 och oberoende granskning 6/6 PASS; exakt fem nya grants efter återställd preflight
- [x] 05-10-PLAN.md — Gymnasieurval och verifierat katalogunderlag; preflight/final 38/118, SQL 443 och tidigare API 48/39 PASS. Exakt två nya läsgrants; totalt tio Worker-signaturer.
- [x] 05-11-PLAN.md — Skyddad programplansvy och utkast/kloning, programbrowser 30/30 + timplan 20/20 PASS, handbok och fyra beständiga exempel verifierade på 3012. Mänsklig begriplighet underkänd; rättas i 05-13.
- [x] 05-12-PLAN.md — Regelhandledning i befintlig timplansvy och dialog, GR/IM-källor och handbok; 20/20 browserprov och skyddat bygge PASS. Mänsklig förståelsebedömning följer med 05-11.
- [x] 05-13-PLAN.md — Direkt aktuell plan, ämnes-/nivåvy, tydlig nästa åtgärd och guidad källbindning efter användarfynd. Senast pedagogiskt fördjupad med tre dialogsteg/fälthjälp: färska 30+20 browser, typ/lint/bygge/handbok och bevarad current-läsning på vanlig 3012 PASS (e077e81). Tidigare 25+4 Node-prov är historik. Ny mänsklig begriplighetsbedömning väntar.
- [x] 05-14-PLAN.md — Granskning, ämnessökning, fem fler program och visuell karta över sex delar/val. Färska 32+20 browser, 27 Node, typ/lint/bygge/handbok och nio bevarade exempel PASS (b4c26f3). Gemensamma paket pending todo; ny mänsklig bedömning väntar.
- [x] 05-15-PLAN.md — Skyddade program-/inriktningsval och atomiskt HM-skapande av utbildning med första utkast, replaykvitto och riktiga SQL/API-prov.
- [x] 05-16-PLAN.md — Samma program → inriktning → fördjupningsarbetsyta för nytt och befintligt, ämnesgrupperade nivåval och nytt begriplighetsprov.
- [ ] 05-17 (planeras) — Yrkesprogrammens poängsumma (2 700 för BF/HT/VO, 2 800 för övriga, skollagen bilaga 2) så att ramen för programfördjupning kontrolleras. Markera Svenska/SvA nivå 2–3 och Engelska nivå 2 som ”ingår – eleven kan välja bort” med undantagen för BF/VO (Svenska 2) och HT (Engelska 2), gymnasieförordningen 4 kap. 23 §. Riksrekryterande utbildningar förblir okontrollerade. Elevens bortval hör till STUDY-01. Underlag: `research/YRKESPROGRAM-BORTVAL-2026-10-03.md`.
- [x] 05-18-PLAN.md — Poängfördelning över sex terminer i exakt programplansversion, årskursöversikt och mobilinmatning. Terminer 16/16, API 31/31 och SQL 236/236 PASS; program 40/40 och timplan 20 beteenden över 19+1. Mänskligt prov väntar, setupfel särredovisade i 05-18-SUMMARY. Administratörsdelegation och skapande av timplan har egna todos.
- [x] 05-19-PLAN.md — Sammanhållen programplan: en tabell med ämnen, programfördjupning och sex terminer, klick- och förslagsfördelning, autospar, kopiering med fördelning och framräknad Klar för beslut (användarbeslut 2026-10-04). Node 535, tabell 15/15, program 38/40 (känt utloggningsfall), timplan 20/20; mänskligt prov återstår
- [x] 05-20-PLAN.md — Programplanens livscykel (D-01/D-02/D-04): status räknad i SQL, ändra och ta bort framtida plan, arkivera övriga, stängda direkta tabellskrivningar. SQL 1863/1864 (känt fas 2-fall), API 29/48/31, browser livscykel 12/12, program 40/40, terminer 15/15, timplan 20/20 på ae41a03. Mänskligt prov väntar.
- [x] 05-21-PLAN.md — Programplanens skolor (D-03/D-05): samma plan/versioner över valda gymnasieskolor, huvudskolan bevarad, alla skolors mandat vid skrivning, skolval i kullkopiering. SQL 54/54, API 39/39, lås 3/3, browser livscykel 18/18, program 39/40 + 1/1 omprov, terminer 14/15 + 1/1 omprov och timplan 20/20 PASS; full SQL 1917/1918 med äldre fas 2-fel. Mänskligt prov väntar.
- [x] 05-22-PLAN.md — Full skolkoppling för klasser, elevplaceringar och timplaner (D-06/D-07), genomförd/verifierad lokalt 2026-10-05. SQL 46/46; API 39/39, 39/39 och 18/18; 137 browserbeteenden och ett hoppat fall med separat phone14-omprov. Full SQL 1963/1964 FAIL på äldre auditfall; första backfillens fyra updated_at-avvikelser kvar PARTIAL, korrigerad migration rollbackprovad. Mänsklig bedömning och full ADMIN-04 väntar; skapa klass/timplan/koppla klass återstår. Nästa 05-23.
- [x] 05-23-PLAN.md — A–E avslutade enligt aktuell ram 2026-10-06. [E-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-23-E-VERIFICATION.md): 149 browserfall (+7 skips), 170 API-fall/1 077 kontroller, SQL 2512, Node 674 och full bevaring PASS på samma e9ca1e7-artefakt. Grundflödet användarrapporterat godkänt. ADMIN-02/03/04, nya gap, yrkesram och 05-22 metadata PARTIAL består. Nästa 05-37; modellen 05-36 genomförd; äldre 05-25–35 kräver omplanering.
- [x] 05-24-PLAN.md — Regelförankrad GR/IM-analys (ren funktion `timplan-analysis.ts`, 2026-10-05): HKK 40 timmar gemensamt för låg-/mellanstadiet, NO/SO utan dubbelräkning, IM räknar bara profilklassificerad undervisning, blocksDecision skilt från kategori. 25/25 nodprov, tsc/oxlint PASS; syntetiska data, ingen vy/API/SQL kopplad
- [x] 05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md — Avgränsad skolvis timutkastövergång från komplett sparad högskoleförberedande programram, genomförd/verifierad 2026-10-06. Fryst källa, separata timmar, rätt skola/källretur, CAS/replay och uttrycklig ny version med bevarade klasslänkar. SQL37, Worker11/157, browser60 och 14-tabellsbevarande PASS; lokal 3012 på 3ae5fe5. Se separat SUMMARY/VERIFICATION. Fulla huvudkrav/fas 5 och mänskligt prov är öppna.

**Kompletterande läsårsplanering — beslutad 2026-10-06, modellsteget genomfört:** [05-36–43](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md) samordnar den äldre läsårstodon och nya sökbara tabellöversikter. Planeringsåret följer med inom planeringen, elevregistret behåller sitt eget år. Gymnasiets nya/fortsättande kullar, GR-årsbindningar och IM:s skilda underlag ska visas utan automatiska elev-/klassflyttar eller nya planbeslut. PLANERING-01–05 är kompletterande Pending-krav; v1:s 42 krav/åtta faser består. 05-23/E avslutades separat genom teknisk regression; tidigare omplaneringsgrindar avslutas inte av detta paket. Välj bara dessa planer vid paketets genomförande, inte samtliga äldre fasplaner med samma wave-nummer.

- [x] [05-36-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-36-PLAN.md) — Ren läsårs-/kullmodell och kontrollerade års-/listkontrakt: 70 Node-prov, 20 oberoende prober, typ/lint PASS. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-36-SUMMARY.md). Ingen SQL/API/UI; fulla krav Pending.
- [x] [05-37-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-37-PLAN.md) — Stängd SQL-läsgrund genomförd 2026-10-07: 93 SQL/18 paritet/3 lås före och efter apply, 15 helradstabeller och ACL/journal bevarade. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-37-SUMMARY.md). Tre nya RPC fortsatt stängda; nästa 05-38.
- [x] [05-38-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-38-PLAN.md) — Preflight/slutmatris15/247 PASS; tre exakta läsgrants och full bevaring.
- [x] [05-38-READ-PERFORMANCE-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-PLAN.md) — Fullrollback/exakt apply/applied143/46+93/18, faktisk förbättring7,68–15,21×, oförändradAPI15/247 och full15/ACL28/auditbevarande PASS. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-SUMMARY.md). Nästa SEARCH, sedanUI39–43; fulla krav kvarstår.
- [x] [05-40-SEARCH-DETAILS-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SEARCH-DETAILS-PLAN.md) — Full271/38/23+93/18×2/API15/247+sök19/204,12HTTP<4,884s/full15/ACL28/auditcleanupPASS. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SEARCH-DETAILS-SUMMARY.md).
- [x] [05-39-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-39-PLAN.md) — FullC16 dator/telefon, separat planeringskontext/URL/elevregisterår och fullcleanup PASS. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-39-SUMMARY.md).
- [x] [05-40-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-40-PLAN.md) — FullL36/årsöverblick/exaktversion/skapandemandat/fullcleanup PASS. [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SUMMARY.md).
- [x] [05-41-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-41-PLAN.md) — Rätt relativår i öppnade gymnasieplaner, med oförändrade terminsindex och sparskydd.
- [x] [05-42-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-42-PLAN.md) — Årsbunden GR-/IM-överblick och planöppning utan gissad klassprogression.
- [x] [05-43-PLAN.md](phases/05-bevarade-utbildnings-och-klassfloden/05-43-PLAN.md) — Samlad automatisk verifiering, handbok och S1/S3-kontrakt; mänsklig begriplighet separat.

05-11 har öppnat programplansvyn efter 05-09/05-10:s verifierade API och förberett ett konkret samlat mänskligt prov på 3012. Användaren har 2026-10-01 godkänt automatisk fortsättning till nästa konkreta mänskliga prov. Programplanernas framtida direkta HM-fastställande ur utkast bevaras; nationella alternativ/ramar och historiskt obundna poster kräver uttrycklig kontroll. 05-15/05-16 har nu levererat gymnasieutbildningsskapande med första utkast för huvudmannen. Beslut, generellt GR/IM-skapande, kullkopiering och klasskoppling återstår som egna kontrollerbara steg. 05-12 genomfördes parallellt med 05-09 och utökar ingen regelkontroll eller beslutsrättighet.

**Senare avgränsning 2026-10-05:** paketen är borttagna från programplansarbetsytan enligt uttrycklig beställning. Programramen består och innebär inte automatiskt ett parallellt schemafönster. Separat skolutbud/elevval/skolorganisation måste planeras senare. Berörda 05-25–28 ska ompröva sina skolpaketsantaganden mot detta beslut före genomförande; denna rättning kringgår inte befintliga förutsättningsgrindar eller godkänner hela 05-23/E. Se REMOVE-PACKAGES-PLAN och SUMMARY.

**Förtydligande genomfört 2026-10-06:** ”Behåll blockramarna, ta bort blockhanteringen.” Programplanens sparade blockrader/poäng/terminer består, medan skapa/dela/ändra/ta bort block är borttaget. Avgränsade dator-/telefonprov 20/20 och färsk 14-tabellsbevaring PASS; lokal 3012 kör nu `a7c78e1`. Se [rättningen](debug/programplan-block-controls.md). Full 05-23/E, ADMIN-02/03/04 och separat skolorganisation förblir öppna.

**Direkta timceller genomförda 2026-10-06:** Gymnasiets skolutkast har terminsinmatning och radvis autospar som i programplanen. T01–T13 på dator/telefon 26/26 PASS, riktade modell/server 24 och typ/lint/bygge/handbok PASS. 3012 kör `5dd7baf`. 18 scenarier består; alla 14 hela tabeller från provstart till serverbyte bevarade. Initial FAIL från två före-prov-händelser redovisas separat. Se [rättning](debug/gym-timplan-inline-hours.md). Detta avslutar inte fulla krav/fas 5 eller den separata tabellöversikts-todon.

**Senare beställning 2026-10-05 — programplan till timplan:** [Övergångsplanen](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md) genomför en förberedande skolvis timplan från en komplett sparad högskoleförberedande programram, redan före programbeslut. Källa/version/revision och sex poängterminer fryses, timmar fylls separat, klasskopplingar bevaras. Ingen paketfunktion återinförs. Nya browser18/18, regression42/42 och verklig Worker11/157 på 3012 PASS; avgränsad leverans verifierad 2026-10-06. Se [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md). Detta ersätter det äldre paketets fastställd-/paketgrind endast för förberedande utkast; 05-25–35 har replan_required och deras migrationsnamespace måste omprövas. Beslut/garantikontroll, yrkesram, full 05-23/E och ADMIN-02/03/04 är öppna.

**Historiskt planeringspaket 2026-10-04 — timplaner (omplanering krävs):** [05-24–05-35](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md) planerar en sammanhållen timplanstabell och analys efter den aktuella programplanslösningen i 05-19. Startlista, årskurs-/stadieöversikt, gymnasiets sex terminer, radvis autospar och konkreta analysåtgärder ingår. Rektor/skoladministratör arbetar inom sin skola; HM beslutar. Gymnasieplaner får fryst koppling till exakt fastställd programplan och skolpaketsunderlag. Skyddat programfastställande är ett eget föregående steg. 05-20–05-23 är verkliga förutsättningsgrindar; yrkesprofiler kräver dessutom 05-17. Befintliga GR/IM-flöden och explicita klasskopplingar bevaras. 05-24:s rena GR/IM-analys är genomförd; övriga steg i paketet är **planerade, inte genomförda**, och utgör delarbete för ADMIN-02/ADMIN-04. Full ADMIN-03/kullkopiering och fasverifiering ligger kvar separat.

Fas 5 genomförs i avgränsade delplaner på användarens instruktion. Fas 4:s kvarstående användarprov/datumanmärkning och separata fasverifiering behålls öppna.

Planeringsgräns 2026-10-01: användarens [delprojekt för sammanhängande schemamoduler](research/SCHEMAMODUL-PROJEKT.md) ska beaktas i berörda återstående planer. Redovisa stabila ID:n, exakta plan-/katalogversioner, undervisningstidens enheter, giltighet, klasskopplingar och ändringsansvar så programplaner, timplaner och framtida studieplan/schema kan samverka. ADMIN-01–04 behålls; Rustmotor och nya schemafunktioner får egna genomförandeplaner. AI utvärderas separat; eventuell AI-koppling planeras bara efter införandebeslut.

Planeringsöversyn 2026-10-05: [Skolverkets undervisningsbehörigheter](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) behöver senare kunna jämföras med bevarade ämnes-/nivå-/skolreferenser. Program-/timplansanalys ska inte påstå verifierad lärarbemanning. Stabil lärarresurs, personmatchning och behörighetsimport hör till det separata föreslagna L1–L4-spåret och schemadelprojektet; de byggs inte in i nästa 05-22-plan.

**UI hint**: yes

Denna fas äger slutverifieringen av bevarandekraven. Referensflödena provas redan i fas 1 och vid varje berörd ändring i fas 2–4; regressionsskydd skjuts inte upp till fas 5. Grundskola och gymnasium provas där respektive arbetsflöde är tillämpligt.

### Infogade faser 05.1–05.8 — användarbeslut 2026-10-19

Användaren vill ha tjänstefördelning, schemaläggning med Rust-schemamotor och flera andra områden före faserna 6–8. Faslistan godkändes 2026-10-19 (”Ja, som föreslaget”), tillsammans med de tillagda faserna köpbara moduler, SPAR-synk och stark identitet. Faserna är infogade med GSD:s decimalnumrering. Faserna 6–8 behåller sitt innehåll och körs efter 05.8. Fas 5:s status och de historiska 88/100 planer och 3/8 verifierade faser ändras inte. Inga av faserna är planerade eller genomförda.

Tjänstebedömning (arbetstidsavtal, rektors individuella bedömning, undantag enligt 11 § och TID-01–12) hör inte till Skolplattformen. Den är utflyttad till ett eget repo, `tjanstebedomning`. [Beslutsdokumentet](phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md) redovisar vad som flyttades ur 05-TJANST, vart det tog vägen och varför.

### Phase 05.1: Tjänstefördelning (INSERTED)

**Aktuell riktning 2026-10-23:** [D-25–D-27](phases/05.1-tjanstefordelning/05.1-CONTINUOUS-PLANNING-CONTEXT.md) anger samma tjänstefördelning med förklarade förslag på raden och tomma lärarfält för nya behov. Plan 16–25 är omarbetad och plancheckad. 14/15:s avgränsade rättelser består. Genomförande14–21 och avgränsad produktverifiering finns nedan; faktisk provkedja22 pågår.

**Goal**: Rektor kan fördela skolans undervisning och övriga uppdrag på lärare för ett läsår, fastställa och publicera fördelningen, och läraren kan se sin egen publicerade tjänst. Underlaget kommer ur bevarade klass–timplanskopplingar.
**Depends on**: Phase 5
**Requirements**: TJANST-01, TJANST-02, TJANST-03, TJANST-04, TJANST-05, TJANST-06, TJANST-07
**Success Criteria** (what must be TRUE):

1. Rektor kan skapa, ändra och läsa om tjänsterader (kurs × klass × lärare × tid per termin) för sin skola och ett läsår, med exakt klass–timplansversion och ämnesrad som källa. Annan skola, annat läsår och annan kund nekas på servern, även vid direkt anrop. (TJANST-01)
2. Specialuppdrag som mentor, programansvar och speciallärare läggs med egen tid och skiljs från undervisningsrader. (TJANST-02)
3. Samläsning är en relation mellan rader. Två klasser med en lärare och en klass med två lärare visar rätt tid per lärare och klass utan dubbelräkning. (TJANST-03)
4. Rektor fastställer och publicerar en version. Huvudmannen följer bemanning och vakanser men har ingen beslutsknapp. Statusbyten loggas med aktör och tid, och ändring efter publicering blir en ny version med spår. (TJANST-04)
5. Läraren ser bara sin egen publicerade tjänst, utan elevregister eller kollegors underlag, och kan lämna kommentar eller kvittens. (TJANST-05)
6. Rektor planerar nästa läsår i samma arbetsyta med målårets behov, tomma lärarfält och förslag från tidigare planering som väljs aktivt. Påbörjat arbete bevaras. Flytt och massregistrering har förhandsvisning och atomär lagring; intern historik och tidigare beslut består. (TJANST-06, D-25–D-27)
7. Person, anställning, tjänstgöringsgrad och skoluppdrag hålls isär från systemmandat. En lärare på två skolor har en gemensam planerad kapacitet som inte förbrukas dubbelt. Arbetstidsram enligt avtal visas inte här. (TJANST-07)

**Plans**: Etapp 1 och gaprättelserna har 14 genomförda planer (inklusive 04B). Etapp 2 är planerad 2026-10-23 i [genomförandeordningen](phases/05.1-tjanstefordelning/05.1-ETAPP-2-PLANERING.md); 14–21 är genomförda och avgränsat verifierade. Nästa22 provar den sammanhållna arbetsytan med riktig Worker/OIDC i isolerad syntetisk miljö och uppdaterar handboken. Senaste tekniska fasbedömning: **gaps_found, 6/7** (2026-10-22). Etapp 1:s användarprov är rapporterat klart 2026-10-23. Lokal 3012 kör enligt senaste leveransnotering 7d31489. Underlag: [beslutsdokumentet](phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md), [kontext](phases/05.1-tjanstefordelning/05.1-CONTEXT.md), [research](phases/05.1-tjanstefordelning/05.1-RESEARCH.md) och [UI-kontrakt med etapp 2-tillägg](phases/05.1-tjanstefordelning/05.1-UI-SPEC.md).

Plans:
**Wave 1**

- [x] 05.1-01-PLAN.md — GR/IM-klasser får skyddad, identifierad klass–timplanskoppling (D-21), våg 1. SQL 43/43 i tillfällig PostgreSQL från migrationerna, UI 18/18; ej installerad
- [x] 05.1-02-PLAN.md — Kontrakt och modell: typad behovskälla, behov, summor, samläsning, kapacitet, hash (våg 1). 37 tester

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05.1-03-PLAN.md — SQL: personal, delad kapacitet (D-12), mandatet Egen tjänst och elevspärr (våg 2). Beslut A 2026-10-19; SQL 77/77 i tillfällig PostgreSQL från migrationerna; ej installerad
- [x] 05.1-04-PLAN.md — Server och API: tjanst-rutter och adapter, engångskod enligt D-23 (våg 2). 17 adapter-/ruttprov mot simulerad DB/session
- [x] 05.1-05-PLAN.md — Rektors vy Tjänstefördelning: matris, vyer, dialoger, Fastställ och publicera (våg 2). Komponentprov 76/76 mot simulerade API-svar (telefon i Chromium)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05.1-04B-PLAN.md — Egen tjänst på servern: scopeKind, self nekas som standard, mandatregler (våg 3)
- [x] 05.1-06-PLAN.md — SQL: fördelning, behov Gy25/GR/IM, versioner, publicering, egen läsning (våg 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05.1-07-PLAN.md — Min tjänst, Personal, Bemanning, Egen tjänst i Mandat och navigering (våg 4)
- [x] 05.1-08-PLAN.md — SQL: specialuppdrag, samläsning, kvittens/kommentar och bemanning (våg 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 05.1-09-PLAN.md — Worker-rättigheter, faktiskt Worker/OIDC-prov på dator och telefon, handbok (våg 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 05.1-10-PLAN.md — Leverans: repetition, användarens godkännande, --apply och 3012-byte (våg 6). Svar A; --apply PASS 26/26, alla sju 05.1-versioner journalförda, 3012 kör d1cd981 med godkänd hälsokontroll

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 05.1-11-PLAN.md — Gap: ny framåtmigration för Egen tjänst på flera skolor (CR-01) och samläsningens regler vid radändring och publicering (WR-02), SQL-prov mot schemakopia av installerat mål (våg 7). Migration 20261021120000 implementerad och provad mot syntetiska data: verify-tjanst-gap PASS 44/44 i schemakopia och tillfällig PostgreSQL, regression 102/23/77/7/43 PASS; inte installerad

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 05.1-12-PLAN.md — Gap: Bemanning visar publicerad version (WR-07), faktiskt Worker/OIDC-prov av de tre flödena på dator och telefon (våg 8). Provat faktiskt mot syntetiska data på 7d31489: verify-tjanst-actual PASS 46 kontroller i 4 projekt, 0 ej körda, retries 0, pendingMigrations = rättelsen; inte installerat

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 05.1-13-PLAN.md — Gap: handbok efter det faktiska provet, leverans med repetition, användarens godkännande, --apply och 3012-byte (våg 9). Svar A; --apply PASS 31 kontroller, 20261021120000 journalförd, 0 self-mandat i målet och 0 reparerade kopplingar, 3012 kör 7d31489 med godkänd hälsokontroll; mänsklig bedömning återstår

**Etapp 2 — genomförande startat 2026-10-24, 8/12 genomförda**

**Våg 10**

- [x] [05.1-14-PLAN.md](phases/05.1-tjanstefordelning/05.1-14-PLAN.md) — Omkörbara före- och efterprov (WR-11)
- [x] [05.1-16-PLAN.md](phases/05.1-tjanstefordelning/05.1-16-PLAN.md) — Kontrakt för aktuell planering och aktiva lärarval

**Våg 11**

- [x] [05.1-15-PLAN.md](phases/05.1-tjanstefordelning/05.1-15-PLAN.md) — Gemensamma publiceringshinder (WR-10)

**Våg 12**

- [x] [05.1-17-PLAN.md](phases/05.1-tjanstefordelning/05.1-17-PLAN.md) — SQL-stöd för målbehov, lärarförslag och förhandsvisning

**Våg 13**

- [x] [05.1-18-PLAN.md](phases/05.1-tjanstefordelning/05.1-18-PLAN.md) — Atomär radlagring och intern arbetsrevision

**Våg 14**

- [x] [05.1-19-PLAN.md](phases/05.1-tjanstefordelning/05.1-19-PLAN.md) — API och status för löpande planering

**Våg 15**

- [x] [05.1-20-PLAN.md](phases/05.1-tjanstefordelning/05.1-20-PLAN.md) — Minsta Worker-rättighet för planeringsstöd

**Våg 16**

- [x] [05.1-21-PLAN.md](phases/05.1-tjanstefordelning/05.1-21-PLAN.md) — Sammanhållen arbetsyta och lärarval på raden

**Våg 17**

- [ ] [05.1-22-PLAN.md](phases/05.1-tjanstefordelning/05.1-22-PLAN.md) — Faktiska prov av sammanhållen planering och handbok

**Våg 18**

- [ ] [05.1-23-PLAN.md](phases/05.1-tjanstefordelning/05.1-23-PLAN.md) — Förbered konkret lokal leverans

**Våg 19**

- [ ] [05.1-24-PLAN.md](phases/05.1-tjanstefordelning/05.1-24-PLAN.md) — Beslut om konkret lokal installation

**Våg 20**

- [ ] [05.1-25-PLAN.md](phases/05.1-tjanstefordelning/05.1-25-PLAN.md) — Installera godkänd kandidat och förbered nytt användarprov

Plancheck av det reviderade paketet: [etapp 2:s granskning](phases/05.1-tjanstefordelning/05.1-ETAPP-2-PLAN-CHECK.md). Våg 10 har två oberoende planer; övriga följer beroendekedjan. Installationens förberedelse, beslut och genomförande är separata planer.

**UI hint**: yes

Arbetstidsavtal, individuell tjänstebedömning och TID-01–12 ingår inte. En senare koppling till tjanstebedomning-appen sker via ett SS 12000-liknande utbyte, inte via delad databas. Import från Plan Digital och BIA-export ingår inte.

### Phase 05.2: Schemaläggning med Rust-schemamotor (INSERTED)

**Goal**: Behörig schemaläggare kan beräkna, granska och publicera skolans schema från plan-, tjänste- och kalenderunderlag. Beräkningen körs i en egen Rust-tjänst; resten av appen ligger kvar i TypeScript.
**Depends on**: Phase 05.1
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05, SCHEMA-07, SCHEMA-08
**Success Criteria** (what must be TRUE):

1. En klass och en samläsningsgrupp kan följas från timplansversion och tjänsterad till schemapass. Ett nytt klassnamn eller en ny katalogversion bryter inte kopplingen. (SCHEMA-01)
2. Tilldelad schemaläggare arbetar inom sitt uppdrag. Annan skola, saknad publiceringsrätt och återkallat mandat nekas, även vid direkta anrop och för redan startade jobb. (SCHEMA-02)
3. Obligatoriska regler och prioriterade önskemål är versionsbundna data. Olösbart, nådd tidsgräns och saknat underlag visas som skilda besked, och ingen regel luckras upp tyst. (SCHEMA-03)
4. Rust-tjänsten tar emot ett versionsbundet, oföränderligt beräkningsunderlag. Den rapporterar jobbstatus, kan avbrytas, respekterar tids- och resursgränser, håller kunder isär och saknar generellt skrivmandat. Appen sparar resultatet först efter egen kontroll. (SCHEMA-04)
5. AI-stöd (Jev och minst ett alternativ) är utvärderat mot samma motor utan AI, med kriterier som bestämts i förväg. Rekommendationen att införa, avstå eller utreda vidare är dokumenterad; att avstå är ett godkänt utfall. (SCHEMA-05)
6. Ändrad timplan, tjänsterad eller kalender ger spårbar avvikelse i berörda utkast. Dubbelleverans, fel ordning och gamla körningar skriver inte över nyare ändringar. (SCHEMA-07)
7. Personal kan jämföra, låsa, granska och publicera rätt schemaversion på dator och telefon, och se undervisningsbehov, schemalagd, inställd och genomförd tid som skilda uppgifter. (SCHEMA-08)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.2`. Underlag: [schemadelprojektet](research/SCHEMAMODUL-PROJEKT.md), [schemaresearchen](research/SCHEMALAGGNING-2026-10-01.md) och [todon](todos/pending/2026-10-01-utvardera-automatisk-schemalaggning.md).
**UI hint**: yes

Det är ingen backendomskrivning. Rust-tjänstens driftplats och motorval (till exempel CP-SAT eller egen sökning) avgörs i fasens research. Komponentbyte och extern adapter (SCHEMA-06) ligger i 05.6. Tjänstebedömningens schemaandel (TID-11) ingår inte; schemat kan senare lämna schemalagd tid via ett kontrakt.

### Phase 05.3: Klassorganisation (INSERTED)

**Goal**: Rektor och skoladministratör kan ändra klassorganisationen över tid (livscykel, delning, sammanslagning, befintliga och importerade klasser) med bevarad historik och synliga konsekvenser för tjänstefördelning och schema.
**Depends on**: Phase 05.2
**Requirements**: KLASS-01, KLASS-02, KLASS-03, KLASS-04
**Success Criteria** (what must be TRUE):

1. En klass har en egen livscykel med giltighet och startdatum, skild från när den registrerades och från timplanens tillämpningsläsår. Läsår före start och utanför intervallet nekas på servern. (KLASS-01)
2. Behörig personal kan dela, slå samman eller byta klass med en tidsbunden relation. Elevtillhörigheter, timplanskopplingar och tidigare beslut skrivs inte om tyst, och klassens utbildning byts aldrig automatiskt. (KLASS-02)
3. En befintlig eller importerad klass kan kopplas till en utbildning först när informationsägare och externt ID är kända; namnmatchning räcker inte. Verklig registerimport hör till fas 6. (KLASS-03)
4. En ändrad klassorganisation visar konsekvenserna för tjänsterader och schemautkast och kräver uttrycklig ny tillämpning; inget fördelas om automatiskt. Dator, telefon och handbok ingår. (KLASS-04)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.3`. Underlag: [klassresearchen](research/KLASSER-KULLAR-OCH-PLANER-2026-10-15.md), etapp C.
**UI hint**: yes

Etapp A–B (CLASS-COHORT) är levererade i fas 5 och omprövas inte. Huvudmannen får inget nytt klassmandat utan separat beslut.

### Phase 05.4: Lärarbehörigheter (INSERTED)

**Goal**: Rektor kan se om tjänstefördelning och schema stämmer med lärarnas legitimation och undervisningsbehörighet enligt Skolverkets underlag, med okänt underlag skilt från konstaterad avvikelse.
**Depends on**: Phase 05.1, Phase 05.2
**Requirements**: LLEG-01, LLEG-02, LLEG-03
**Success Criteria** (what must be TRUE):

1. Lärarresursen från 05.1 kopplas kontrollerat till myndighetsunderlaget. Namnlika och omatchade personer, flera uppdrag och lärare utan konto hanteras utan att källa, lokalt uppdrag och systemåtkomst blandas ihop. (LLEG-01)
2. Behörig personal kan granska och tillämpa en versionsbunden XML-leverans med radfel, omkörning, historik och audit. En tom eller äldre leverans raderar ingenting och ger inget positivt besked. (LLEG-02)
3. Tjänstefördelning och schema visar behörighetsmatchning per skolform, ämne och årskurs. Ändrad källa gör en äldre kontroll inaktuell inför publicering, och inget fördelas om automatiskt. (LLEG-03)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.4`. Underlag: [lärarbehörighetsresearchen](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) och [todon](todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md).
**Ta med vid planeringen (användaren 2026-10-26):** I tjänstefördelningens matris (linser från 05.1-29) ska kolumnerna kunna begränsas till *behöriga i ämnet*. Ett exempel är linsen Ofördelat tillsammans med Engelska, som då visar lärare som är behöriga i engelska. Okänt underlag visas som okänt, aldrig som obehörigt. Behörighet blir också ett förklarat skäl i lärarförslagen ([todo](todos/pending/2026-10-26-smart-lararrekommendation-per-tjansterad.md)). Hör till LLEG-03.
**UI hint**: yes

Proven görs med syntetisk XML enligt publicerat format tills Skolverket har bekräftat XSD och leveransväg. LLEG-04 (faktisk leverans och drift) är kvar som föreslaget mål vid fas 7:s externa godkännandegräns; fas 7:s krav ändras inte. Den äldre todon om API för lärares behörigheter med statistik (2026-09-12) är en separat fråga.

### Phase 05.5: Interkommunal ersättning (INSERTED)

**Goal**: Huvudmannens ekonomiansvarige kan ta fram, granska, attestera och överföra ett reproducerbart ersättningsunderlag per hemkommun, utan att elevuppgifter sprids och utan att godkända belopp ändras tyst.
**Depends on**: Phase 5 (bygger på elevregistrets hemkommun- och placeringsperioder från fas 4); beror inte på 05.1–05.4 och kan köras parallellt med dem
**Requirements**: ERS-01, ERS-02, ERS-03, ERS-04, ERS-05, ERS-06, ERS-07
**Success Criteria** (what must be TRUE):

1. Processen för första skolform, huvudmannatyp och motpart är beslutad, med regelmatris och namngivna beslutsägare. Faktura och utbetalning hålls isär. (ERS-01)
2. Administratören väljer hemkommun ur en sökbar, daterad SCB-förteckning. Koden lagras som text (0180), och äldre okända koder visas som avvikelse. (ERS-02)
3. Ersättningsbeslut, betalande motpart, tariff och giltighetsperiod är versionsbundna. Saknad eller överlappande tariff stoppar beräkningen; den ger aldrig 0. (ERS-03)
4. Ekonomiroller får bara de elevuppgifter som behövs. Skyddad folkbokföring hanteras uttryckligen, och export, läsning och attest loggas. (ERS-04)
5. Samma indata ger samma belopp. Underlaget visar beräkningsgrund och källrevision, och luckor, överlapp och dubbla anspråk stoppas. (ERS-05)
6. Ett attesterat underlag är låst. En senare register- eller prisändring ger en spårbar differens och en rättelse eller kredit kopplad till ursprunget. (ERS-06)
7. Godkänt underlag överförs till ekonomisystemet med stabil nyckel och säkra omförsök. Export, mottagning, betalning och differens hålls isär. Här provas det syntetiskt; en verklig ekonomianslutning kräver eget bevis. (ERS-07)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.5`. Underlag: [ersättningsresearchen](research/HEMKOMMUN-ERSATTNING.md) och de sju todona från 2026-09-29.
**UI hint**: yes

Extern beslutsgräns: ERS-01 kräver huvudmannens ekonomiansvarige. Ingen kommun och inget ekonomisystem är kontaktat.

### Phase 05.6: Köpbara moduler (INSERTED)

**Goal**: Kunden kan köpa, aktivera, kombinera och avsluta moduler var för sig, och interna och externa komponenter kan bytas genom avgränsade kontrakt.
**Depends on**: Phase 05.2 (schemat är den första modulen som provas mot externt underlag)
**Requirements**: MODUL-01, MODUL-02, MODUL-03, MODUL-04, SCHEMA-06
**Success Criteria** (what must be TRUE):

1. Kund A använder bara schemat med externt planunderlag; kund B kombinerar våra planmoduler och schemat. Båda kan lägga till en modul utan att byta kundidentitet och utan dubbletter. (MODUL-01)
2. Modultillgång och personmandat kontrolleras var för sig på servern och i bakgrundsjobb, även i Rust-tjänstens jobb. (MODUL-02)
3. Varje modul redovisar sina datakrav. Kontraktsriktigt externt underlag accepteras, och saknat stöd visas. (MODUL-03)
4. Avaktivering och avslut stoppar funktionerna, bevarar ID:n och historik och hanterar export enligt beslut, utan radering. (MODUL-04)
5. Minst två komponentkombinationer, till exempel två schemamotorer, använder samma kontrakt, och saknat stöd upptäcks före användning. (SCHEMA-06)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.6`. Underlag: [schemadelprojektet](research/SCHEMAMODUL-PROJEKT.md), avsnittet om köpbara moduler.
**UI hint**: yes

Priser, betalning och beställningsprocess är öppna frågor; ingen kommersiell funktion utlovas.

### Phase 05.7: SPAR-synk (INSERTED)

**Goal**: Behörig administratör kan hålla elevers folkbokföringsuppgifter aktuella från en beslutad statlig källa, och vårdnadshavares där källan tillhandahåller dem, med synliga avvikelser och bevarade lokala rättelser.
**Depends on**: Phase 5 (bygger på elevregistret från fas 4)
**Requirements**: SPAR-01, SPAR-02, SPAR-03, SPAR-04, SPAR-05
**Success Criteria** (what must be TRUE):

1. Vald tjänst (SPAR eller en annan tjänst från Skatteverket), uppgifter, intervall och skrivansvar per fält är utredda och beslutade. Tjänsterna behandlas inte som utbytbara. (SPAR-01)
2. Synken matchar säkert mot registrets stabila elev-ID och visar skillnaden mot en lokal rättelse. Administratören väljer uttryckligen lokalt värde eller källans värde enligt beslutat skrivansvar. (SPAR-02)
3. Vårdnadshavarrelationer hämtas bara från en källa som bevisligen tillhandahåller dem. Saknas en sådan källa redovisas det, och ingen relation antas. (SPAR-03)
4. Skyddade personuppgifter, ändrade vårdnadsförhållanden, fel och återkommande leveranser hanteras med historik och utan att uppgifter röjs i loggar. (SPAR-04)
5. Ett anslutningsprov mot källans test- eller pilotmiljö redovisas skilt från syntetiska prov. Fas 4:s simulerade källa räknas inte som anslutning. (SPAR-05)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.7`. Underlag: [todon](todos/pending/2026-09-14-spar-synk-for-elever-och-vardnadshavare.md).
**UI hint**: yes

SPAR-synken är skild från fas 6:s registerimport och uppfyller inte INT-02–06. Verklig drift kräver kundens avtal och rättslig grund. GUARD-01 (vårdnadshavarportal) ligger kvar i v2.

### Phase 05.8: Stark identitet och BankID (INSERTED)

**Goal**: Personal kan styrka sin identitet med BankID, och med Sverige-id när det är tillgängligt, vid inloggning eller inför en känslig åtgärd. Den styrkta identiteten hålls skild från roll och mandat.
**Depends on**: Phase 5 (bygger på identitets- och mandatmodellen från fas 2–3)
**Requirements**: EID-01, EID-02, EID-03, EID-04, EID-05
**Success Criteria** (what must be TRUE):

1. Identitetskraven per känslig åtgärd och beslutsflöde är beslutade tillsammans med verksamhet, dataskydd och säkerhet. (EID-01)
2. BankID kan användas vid inloggning och som extra verifiering inför en vald åtgärd. Styrkt identitet ger aldrig roll, uppdrag eller mandat. Proven görs mot BankID:s testmiljö. (EID-02)
3. Ett konto länkas bara med en verifierad identifierare från rätt utfärdare. E-post räcker inte, och en kollision ger ingen åtkomst. (EID-03)
4. Sverige-id via Sweden Connect är utrett mot appens OIDC-flöde i en beslutsanteckning och ansluts när tjänsten är tillgänglig för förlitande part. (EID-04)
5. Personer utan e-legitimation och driftavbrott har ett beslutat alternativ. Aktör, tid och använt underlag loggas skyddat. Elektronisk underskrift utreds separat. (EID-05)

**Plans**: 0 plans — kör `/gsd-plan-phase 05.8`. Underlag: [BankID-todon](todos/pending/2026-09-13-planera-stark-identitetskontroll-och-bankid.md), [Sverige-id-todon](todos/pending/2026-09-26-utred-sverige-id-och-integration.md) och `docs/pilot/bankid-readiness-review.md`.
**UI hint**: yes

Fas 7:s IAM-02 (pilotens godkända faktiska identitetsanslutning) och IAM-06 ändras inte. 05.8 ger inget godkännande för verklig drift.

### Phase 6: Avstämd registerimport

**Goal**: Integrationsansvarig och administratör kan föra in överenskomna registeruppgifter, upptäcka avvikelser och följa omförsök utan att förlora eller dubblera elever.
**Depends on**: Phase 5; körs efter de infogade faserna 05.1–05.8 (användarbeslut 2026-10-19)
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, UX-01
**Success Criteria** (what must be TRUE):

1. Integrationsansvarig kan konfigurera och stoppa anslutningen med en separat maskinidentitet begränsad till rätt kund och objekt. (INT-01)
2. Administratören kan granska tillägg, ändringar och radvisa avvikelser före första införandet. Endast validerade elev-/placeringsobjekt med stabila externa ID:n och känd kontraktsversion förs in; SS 12000 används när motpartens relevanta stöd är verifierat. (INT-02, INT-03)
3. Integrationsansvarig kan köra om och återuppta leveranser utan dubbletter eller förlorade ändringar. Oväntat tom leverans eller föreslagen massborttagning ger en tydlig avvikelse och raderar inte registret tyst. (INT-04, INT-05)
4. Administratören kan se aktuell källa, senaste lyckade och avstämda synk, fel och inaktuella uppgifter samt följa ett kontrollerat omförsök. (INT-06)
5. Personal kan slutföra elev-, uppdrags- och importgranskning på dator, telefon och med tangentbord, med begriplig status, synligt fokus och kvarvarande inmatning vid rättningsbara fel. (UX-01)

**Plans**: TBD
**UI hint**: yes

Ett simulerat API kan användas för interna kontrakts- och felprov och redovisas som sådant. Val av verklig källa, skrivansvar och kontrakt behöver fastställas innan den verkliga adaptern godkänns. Faktiskt anslutningsprov har egen kravägare i fas 7. UX prövas vid varje berörd förändring; fasen äger den samlade verifieringen.

Lärarregisterspårets L2 kan återanvända dessa importmönster, men får eget person-/behörighetskontrakt, kund-/skolmandat och verifieringsresultat. INT-02–06 behåller elev-/placeringsavgränsningen; en lärarimport räknas inte som dessa kravs leverans.

### Phase 7: Verifierad kommunanslutning

**Goal**: Pilotansvarig kan skilja interna prov från godkända faktiska anslutningar för personalidentitet, kontolivscykel och elevregister.
**Depends on**: Phase 6
**Requirements**: IAM-02, IAM-06, INT-07
**Success Criteria** (what must be TRUE):

1. Personal kan logga in genom pilotens godkända faktiska identitetsanslutning med avtalade autentiseringskrav. Fel utfärdare, otillåten inloggningsväg och kontokollision ger ingen åtkomst. (IAM-02)
2. Pilotansvarig kan följa kontotilldelning och avveckling från den valda externa källan och jämföra uppmätt fördröjning till appens spärr med en överenskommen tidsgräns. (IAM-06)
3. Pilotansvarig kan granska ett dokumenterat godkänt anslutningsprov mot registerleverantörens faktiska test-/pilotmiljö. Rapporten skiljer detta från simulatorprov. (INT-07)

**Plans**: TBD
**UI hint**: yes

**Extern godkännandegräns:** Vald pilotkund, IdP, kontokälla, registerleverantör, tilldelad åtkomst och överenskomna acceptansvillkor krävs. Saknas de förblir berörda krav öppna och fasen får inte markeras genomförd. Anslutningsprov förbereds från fas 1 och får köras tidigare när deras förutsättningar är uppfyllda; fasen samlar deras slutliga godkännande.

Om Skolverkets lärarregister väljs får L4 eget bevis för faktisk XML-/API-leverans och egna acceptansvillkor. Det ersätter inte INT-07:s elevregisterprov eller IAM-02/IAM-06. Någon offentlig API-åtkomst till läraruppslag har ännu inte verifierats.

### Phase 8: Prövad pilotdrift och informationshantering

**Goal**: Kunden kan fatta ett underbyggt beslut om avgränsad verklig användning och kan återställa, utreda samt avsluta piloten med fortsatt kontroll över information och åtkomst.
**Depends on**: Phase 7
**Requirements**: INFO-01, OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):

1. Ansvarig funktion kan fastställa hur information återfinns, bevaras/gallras och lämnas ut, med hänvisning till kundens faktiska process eller diarium och ett genomfört syntetiskt arbetsprov. (INFO-01)
2. Pilotansvarig kan granska faktisk drift, personuppgiftsflöden, underleverantörer, avtal och bedömning av behovet av konsekvensbedömning innan beslut om verkliga elevuppgifter. (OPS-01)
3. Driftansvarig kan återställa avtalade data och relevanta filer i avskild miljö inom beslutade mål, avstämma resultatet och bevara aktuella spärrar innan åtkomst öppnas. (OPS-02)
4. Pilotansvarig kan följa ett genomfört incidentprov med utsedda kontaktvägar och granska oberoende säkerhetsprov samt kvarstående avvikelser inför pilotbeslut. (OPS-03)
5. Kunden kan få en avstämd export av överenskomna data och avsluta anslutningen med återkallad åtkomst samt dokumenterad fortsatt hantering enligt bevarande-/gallringsbeslut. (OPS-04)

**Plans**: TBD
**UI hint**: no

Informationshantering kan bygga på kundens etablerade process; en egen publik diarietjänst ingår inte. Drift- och avtalsfrågor förbereds från fas 1. Inga verkliga elevuppgifter får föras in innan kundens driftbeslut och tillämpliga godkännanden finns; ett godkänt syntetiskt prov ändrar inte denna gräns.

Inför faktisk användning av lärarregisterspåret kompletteras underlaget med personal-/personnummerflöden, ändamål för kontroll respektive löpande planering, åtkomst, källbevarande/gallring, färskhet, återställning och avslut. L4:s föreslagna gränser finns i researchunderlaget; ingen sådan drift är godkänd genom planeringsöversynen.

## Registrerat delprojekt: sammanhängande schemamoduler

**Placerat 2026-10-19:** S1–S3 genomförs i fas 05.2 och S4 (komponentbyte, köpbara moduler) i fas 05.6. Texten nedan är historik från 2026-10-01; uppgiften om att stegen inte är numrerade faser är ersatt.

Användarinriktning 2026-10-01. SCHEMA-01–08 finns bland senare produkt- och utvärderingskrav med verifieringsmål i [projektunderlaget](research/SCHEMAMODUL-PROJEKT.md). Föreslagen ordning: S1 gemensamma kontrakt/mandat/regler; S2 avskild Rust-/motorprototyp och jämförande AI-utvärdering med möjlighet att avstå från AI; S3 plan–grupp–schema med granskning och synk; S4 komponentbyte och vald extern adapter. Dessa är ej genomförda planeringssteg i delprojektet, inte nya numrerade faser i v1.0. Genomförandeplaceringen återstår; kompatibilitetsfrågorna ska beaktas redan i fas 5. Den befintliga schematodon är uppdaterad, inte duplicerad.

MODUL-01–04 kompletterar projektet med användarens beslut om separat köp av moduler. S1 ska definiera köpbara gränser, beroenden och kundens modultillgång skild från personmandat. S4 provar olika köpta kombinationer, externt planunderlag och tillägg/avslut med bevarad historik. Prissättning och betalningsväg är öppna; ingen kommersiell funktion är verifierad.

### Föreslaget lärarregisterspår — planeringsöversyn 2026-10-05

**Placerat 2026-10-19:** L1–L3 (LLEG-01–03) genomförs i fas 05.4. L4 (LLEG-04) är kvar som föreslaget mål vid fas 7:s externa gräns. Texten nedan är historik.

[Underlaget](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) och [uppgiften](todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md) beskriver L1 kontrakt/personmatchning tillsammans med S1, L2 skyddad XML-import, L3 tjänstefördelning och regelkontroll i S3 samt L4 faktiskt anslutnings-/driftprov kopplat till S4. S2 ska kunna pröva syntetiska behörighetsbegränsningar. LLEG-01–04 är föreslagna planeringsmål med ett ansvarigt steg och väntande verifiering, inte tillägg till pilotens godkända krav eller nya numrerade faser. Omfattning och genomförandeplaner återstår. Aktuell fas 5-ordning behålls.

### Lärartid och tjänstebedömning — research 2026-10-16

**Utflyttat 2026-10-19:** Användaren: tjänstebedömningen är ”en helt annan grej som bara råkade hamna i det här projektet. Det ska ha flyttats ut helt.” Avtal, individuell bedömning, undantag och TID-01–12 hör nu till repot `tjanstebedomning`. Tjänstefördelningen i 05-TJANST flyttas till fas 05.1. [Beslutsdokumentet](phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md) redovisar varje plan. Texten nedan är historik och styr inte längre Skolplattformens planering.

**Planbeställning senare samma dag:** [05-TJANST-paketet](phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md) samlar avtalsgrund, rektors individuella bedömning och tjänstefördelning inom befintlig fas 5. Huvudmannen väljer olika kollektivavtal; rektor fastställer och huvudmannen följer upp, enligt uttryckliga användarsvar. [Kontext](phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md) och [kontrakt](phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md) avgränsar första etappen till skyddad Gy25-grund, utan att utlova fullt schema, faktiskt arbetstidsutfall eller externa anslutningar. Alla TJ1-01–10 väntar på implementation och verifiering. Aktiv APL-plan i STATE behålls.

Användaren har beställt fördjupad research om kollektivavtal, individuell bedömning/motivering, lärarkategorier, reglerad tid/förtroendetid, mentorskap, uppföljning, dubbelräkning och schemaandel. [Underlaget](research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md) och den [uppdaterade planeringspunkten](todos/pending/2026-10-07-lararens-undervisningsuppdrag-enligt-sfs-2026-1487.md) föreslår T1 avtal/tidsgrund, T2 rektors bedömning, T3 schemakoppling och T4 uppföljning. TID-01–12 har en föreslagen ansvarig etapp och konkreta ännu ej genomförda verifieringsfall.

T1–T2 bör planeras tillsammans med den redan beställda tjänstefördelningen för Plan Digital-ersättningen; tidsmodellen ska inte läggas på i efterhand. T3–T4 kopplas till SCHEMA S3/S4, och SS 12000-kontrakt beaktas från T1/S1. Researchen rättar tidigare 20-procentsuppgift till gymnasiets 120 procent och begränsar lärarinitiativkravet till 11 § punkt 1. Förordningens ikraftträdande 2027-07-01 skiljs från dagens avtalsregler och framtidssimulering.

Inga nya numrerade pilotfaser eller färdiga produktfunktioner följer av detta. T1–T2 är nu planerade i 05-TJANST; faktiskt giltig avtalsversion för varje period måste fortfarande väljas och granskas före användning. T3–T4 återstår. Pågående APL-arbete och tidigare godkännanden består.

## Genomförande och verifiering

Varje fas följer GSD:s diskussion, planering, genomförande och användarverifiering. Fasplanen utgår från aktuell berörd kod och beskriver dagens beteende, önskat beteende, datavägar, migrering, återgång och användarprov. En dataväg växlas i taget med avstämda ID:n; återgång får inte återöppna demoåtkomst eller äldre överbehörigheter.

Kundavgränsning, aktuella mandat, spärr, skyddade syntetiska elever och obligatorisk audit är villkor för varje ny operation. Varje krav har en ansvarig fas nedan; senare beroendefaser bevarar skydden och utökar provunderlaget för sina datavägar. Verifieringsresultat länkas från kravens spårbarhet när de finns. Inga krav markeras färdiga genom enbart planering eller historiska appprov.

## Progress

**Etapp 2 genomförs 2026-10-24:** Plan14–21 klara. Plan20 verifierar exakt13 öppna Worker-entrypoints;21 ger sammanhållen arbetsyta och aktiva lärarval. Node84, typ/lint, isolerat bygge samt210 relevanta simulerade fall/profilkombinationer verifierade med redovisade avgränsade omprov; fyra Chromiumprofiler visuellt granskade. Nästa22: faktisk Worker/OIDC och handbok. Installation och nytt användarprov återstår. Ingen ny fasacceptans; äldre statusdetaljer kompletteras av respektive SUMMARY.

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 05.1 → 05.2 → 05.3 → 05.4 → 05.5 → 05.6 → 05.7 → 05.8 → 6 → 7 → 8. 05.5, 05.7 och 05.8 beror bara på fas 5 och kan köras parallellt med 05.1–05.4 om användaren vill. Förberedelser för externa anslutningar och drift löper från början; de ändrar inte godkännandegränserna.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Baslinje och avskild pilotmiljö | 10/10 | Complete    | 2026-09-12 |
| 2. Verifierad kontoåtkomst | 12/12 | Complete | 2026-09-21 |
| 3. Mandat och skyddade datavägar | 7/7 | Complete    | 2026-09-28 |
| 4. Beständigt och skyddat elevregister | 24/25 | In progress — våg 14 klar: 04-21 (handbok byggd, förnyad lokal syntetisk fullgrind PASS på 8923529, browser 39/39, SQL 17/17); nästa våg 15: 04-22 användarprov och fasverifiering | - |
| 5. Bevarade utbildnings- och klassflöden | 16/16 hittills skrivna automatiskt genomförda | In progress — samma nya/befintliga programflöde verifierat automatiskt och redo för nytt mänskligt prov; handledningsbedömning, utbildnings-/beslutsflöden och fasverifiering öppna | - |
| 05.1. Tjänstefördelning (INSERTED) | 22/26 | In progress — etapp 1 installerad lokalt 2026-10-21 (05.1-10, svar A). Gap 05.1-11 (CR-01, WR-02) provad i SQL och 05.1-12 (WR-07, CR-01, WR-02) provad faktiskt mot syntetiska data; 05.1-13 (svar A) installerade rättelsen lokalt 2026-10-22, och 3012 kör 7d31489. Omverifierad 2026-10-22: 6/7. Användarprov rapporterat klart 2026-10-23, utan särredovisning av delsteg/enheter. D-25–D-27 tillkom efter planeringen 2026-10-23: en sammanhållen fördelning med förslag på raden och tomma lärarfält för nya behov. Plan 16–25 är omarbetad; 14–21 är nu genomförda och avgränsat verifierade. Sammanhållen arbetsyta provad i simulator och separat bygge; plan22 genomför faktisk HTTP/OIDC-verifiering och handbok, därefter återstår installation och nytt användarprov | - |
| 05.2. Schemaläggning med Rust-schemamotor (INSERTED) | 0/TBD | Not started | - |
| 05.3. Klassorganisation (INSERTED) | 0/TBD | Not started | - |
| 05.4. Lärarbehörigheter (INSERTED) | 0/TBD | Not started | - |
| 05.5. Interkommunal ersättning (INSERTED) | 0/TBD | Not started | - |
| 05.6. Köpbara moduler (INSERTED) | 0/TBD | Not started | - |
| 05.7. SPAR-synk (INSERTED) | 0/TBD | Not started | - |
| 05.8. Stark identitet och BankID (INSERTED) | 0/TBD | Not started | - |
| 6. Avstämd registerimport | 0/TBD | Not started | - |
| 7. Verifierad kommunanslutning | 0/TBD | Not started | - |
| 8. Prövad pilotdrift och informationshantering | 0/TBD | Not started | - |

**Coverage:** 42/42 v1-krav har exakt en ansvarig fas; inga omappade eller dubbelt tilldelade krav. Detaljkraven och denna fördelning godkändes 2026-09-11. Fas 1:s tre krav är verifierade 2026-09-12 och fas 2:s sex krav är verifierade 2026-09-21. Fas 3:s sex krav är verifierade lokalt syntetiskt 2026-09-28. Övriga 27 krav väntar på genomförande eller slutverifiering. Fas 4:s åtta krav har gröna automatiska syntetiska bevis, men mänskligt användarprov och separat fasverifiering återstår.

**Infogade faser 2026-10-19:** 43 krav har exakt en ansvarig infogad fas: TJANST-01–07 (05.1), SCHEMA-01–05/07/08 (05.2), KLASS-01–04 (05.3), LLEG-01–03 (05.4), ERS-01–07 (05.5), MODUL-01–04 och SCHEMA-06 (05.6), SPAR-01–05 (05.7) och EID-01–05 (05.8). Alla är Pending. LLEG-04 är fortsatt ett föreslaget mål utan fas. De 42 ursprungliga v1-kraven och deras fördelning är oförändrade.

---
*Last updated: 2026-10-19 — infogade faser 05.1–05.8 enligt godkänd faslista; tjänstebedömningen utflyttad till tjanstebedomning. Tidigare: 2026-10-04 — 05-18 automatiskt verifierad.*

Aktuellt 2026-10-02: 05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

Aktuellt 2026-10-04: 05-18 levererar versionsbunden poängfördelning över sex terminer, årskurskort och mobilinmatning. Nya terminsflödet 16/16, program 40/40, API 31/31 och SQL 236/236 PASS; timplanens 20 beteenden PASS över 19+1, två externa setup-timeouts bevarade. Mänskligt prov och full ADMIN-02/fas 5 återstår; se 05-18-SUMMARY/REVIEW. Vanlig 3012 uppdaterad till d37f566.

## Senare beslutskedja och rolluppgifter — 2026-10-12

Användarbeställda [DECISION-01–05](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-PLAN.md) är lokalt genomförda för högskoleförberedande Gy25. Program och timplan kan skickas, återsändas, rättas och fastställas med historik och innehållslås. Aktuell roll får global **Att göra** och gemensam inkorg. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md): slutbyggd Worker 19/19, SQL/TS 34/34, DB-kontrakt 11/11 samt dator/telefon och faktisk lokal OIDC för tre roller PASS. 3012 kör 50fe013. Detta ersätter äldre föreslagna beslutsplaners omfattning för denna profil, utan att markera hela ADMIN-02/04 eller fas 5 klara. [Luckor och förslag](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-GAPS.md) består.

## Yrkesprogrammens beslutskedja — 2026-10-12

VOCATIONAL-01–04 kompletterar beslutskedjan för de tolv nationella Gy25-yrkesprogrammen. Poängram, behörighetsnivåer, timgräns och manuella APL-kontroller är bundna till den frysta programprofilen. Huvudmannen kan kommentera och återsända en inskickad plan; rätt roll får rättningsuppgiften och huvudmannen väntar på nytt inskickande. [Samlad verifiering och avgränsningar](phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-VERIFICATION.md) skiljer modell, SQL, riktig lokal Worker och browserprov. Lokal 3012 kör produktrevision 03698a2. Fyra nya avgränsade planer redovisas separat från historiska 88/100 och 3/8. Full fas 5, ADMIN-02/04, klasskopplingsflödet och verklig kommunanslutning markeras inte klara.

## Operativ kedja, inkorg och godkänd arkivering — 2026-10-12

OPERATIONAL-01–06 är lokalt genomförda för gymnasiet: beständig klass → uttrycklig fastställd timplansversion/läsår, nyversion utan automatisk klassflytt, egna rolluppgifter först med sökning/status/sidor och källvarning endast vid ändrat innehåll. Sex äldre testutbildningar är arkiverade enligt uttryckligt användarbeslut; historiken och fyra programplaner är kvar. [Samlad leverans](phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-06-SUMMARY.md) och [verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-VERIFICATION.md) skiljer riktiga SQL/API/OIDC-prov från simulerad UI-transport. 3012 kör0ab2064,188 byteverifierade filer, med SQL210000–240000 lokalt verifierade/installerade. Huvudman/admin har kvar märkbar läslatens trots förbättring. Sex nya planer redovisas separat från historiska88/100 och3/8. Äldre formuleringar om saknat klasskopplingsflöde är ersatta för denna avgränsning; full fas5, kravacceptans och 05-22:s historiska metadataavvikelse består.

## Fas 5: uppföljning efter genomgång 2026-10-14

[COPY-ATOMIC](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-SUMMARY.md) avslutar delkopieringsluckan inom ADMIN-03 med aktuella lokala syntetiska bevis. [Kopie-/klassprov](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-CLASS-USER-TRIAL.md) väntar. Nästa självständiga implementation efter användarprovet är ADMIN-01:s skyddade huvudmannaflöde; [genomgången](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-AUDIT-20261014.md) håller detta och historiska avvikelser isär från redan levererade beslut, klasskoppling och årsplanering. Gamla 05-25–35 markeras inte kollektivt färdiga och historiska totalsiffror räknas inte om.

## APL i autofördelningen —2026-10-18

**APL-autofördelning levererad2026-10-18:** Förval med GUT och minst345h års-APL inom totalen, ändringsbart ämnesurval och granskning före sparande. Befintlig APL bevaras; perioder planeras senare. Node45, UI22+24 samt slutligt mobilprov2, faktisk Worker/OIDC17 och lokal leverans med76 verksamhetstabeller bevarade PASS.3012 kör29b870f utan migration. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-APL-AUTO-VERIFICATION.md). Ny mänsklig begriplighetsbedömning återstår; historiska88/100 och3/8 består.
