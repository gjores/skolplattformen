---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "06"
status: complete
completed: 2026-09-30
requirements: [ADMIN-02, ADMIN-04]
source_commit: 7776f41087c63501511ea4e963d3e7f2de88b4e7
proof_commit: d63ebf2541705f1e533deed5fce0592340f21588
---

# 05-06 — skyddad timplansvy med uttrycklig celländring

Huvudman och rektor kan nu välja befintliga grundskole-/IM-timplaner i skyddat läge. Listan visar utbildning, skola, kull, version och status. Matrisen följer faktiskt sparad årskursordning; IM visar timmar per vecka. Saknade rader visas som Saknas, inte noll. Okända rader stänger redigeringen. Telefonen har årskursval och ett avgränsat rullbart tabellområde.

Huvudman och låsta versioner är läsvyer. Rektor väljer en befintlig tillåten cell i utkast/återsänd, anger heltal och väljer Spara ändring med aktuellt MFA-bevis. Klienten validerar cellsvaret och läser om innan sparbekräftelse. Inget autosparande eller automatiskt nytt skrivförsök infördes. DB-/Worker-loggfel återställer ändringen, visar fel och bevarar förslaget i giltig kontext.

Vid konflikt eller osäkert nätutfall läser vyn automatiskt om planen och döljer tidigare matris under tiden. Det avviker från plantextens manuella Läs om-steg: obligatorisk färsk läsning sker direkt, medan nytt skrivförsök alltid kräver uttryckligt Använd min ändring. Om det egna värdet redan finns efter ett tappat svar behövs ingen ny skrivning. Om kolumnunderlaget ändrats kan det gamla förslaget inte sparas på fel kolumn. Misslyckad omläsning håller matrisen dold och erbjuder Läs om planen.

Förslaget registreras i gemensamt osparat skydd. En modal dialog med fokusfälla blockerar bakomliggande plan-, sid-, vy-, uppdrags- och utloggningsval tills dialogen stängts; Avbryt/Escape kräver uttryckligt val om förslaget ska lämnas. Browserprovet bevisar modalspärren och accepterat/avböjt discard, inte separata aktiva kontextbyteskommandon genom dialogen. Verkligt sessions-/mandat-/epokbortfall rensar innehåll utan discard. Abort, generationskontroll och arbetsytans uppdrags-/epoknyckel hindrar sena svar från att återinföra uppgifter. Plan-ID:n finns bara i arbetsytans minne, inte adress eller browserlagring.

## Bevis och användarhandbok

UI-källa och aktuellt skyddat bygge: 7776f41. Serverns 05-05-preflight/slutprov gäller 93ceb4e med prov/grant i 612523c; UI-rättningen ändrar inget serverkontrakt. Provtarget är isolerat protected med egna syntetiska kunder och verklig PostgreSQL/byggd Worker. Sessionscookies mintas lokalt med testrealmens bevisprofil; ingen interaktiv IdP eller faktisk kommunanslutning påstås.

| Kontroll | Resultat |
| --- | --- |
| UI-hjälpare | PASS 9/9 |
| Appmodell/server | PASS 430/430; inga skip |
| Typ/lint | PASS, även efter etikett-/hjälptexträttningen |
| Skyddat bygge | PASS 7776f41 |
| Browser desktop Chromium / telefon WebKit | PASS 18/18 (9 desktop + 9 phone), inga skip eller omförsök |
| Handboksbygge | PASS, aktuell timplanstext/navigation/regler |

Browserfallen prövar faktisk kolumnordning/IM/saknat underlag, en cell med revision och sessionskopplad dubbel audit samt omläsning, huvudmannens/låst versions läsvy, två sessionskontexters konflikt och uttryckligt omförsök, modal/osparat skydd, MFA och båda auditfel, session/epok/återkallad givare med sent verkligt svar, pagination/tom lista/okänd rad samt tappat svar efter committad ändring. Fördröjning/abort används bara efter verkliga backendanrop; inga affärssvar ersätts med påhittad framgång.

Alla browserfall och cleanup passerade på aktuellt bygge. Dator-/telefonbilder av grundskola, IM och ändrings-/konfliktdialog granskades visuellt. Pekytorna i arbetsyta och dialog mäts efter faktiska animationer, utan sänkt 44 px-gräns; inget globalt horisontellt overflow. Egna kund-/sessions-/verksamhetsrader och provtriggers städades, säkerhetsloggar bevarades. Oberoende GSD-verifierare bekräftade 05-05:s fyra must-haves och 05-06:s fem konkreta implementationer; det färska fullprovet sluter återstående automatisk evidens. Detta är delplansverifiering, inte full fasverifiering.

Handboken beskriver det öppna beteendet och begränsningarna, engångskod, sparstatus, omläsning och konfliktval. Sidebar länkar timplaner och rollreglerna är uppdaterade. Ingen publicering gjordes.

## Avvikelser och gränser

Browserfixturen rättades efter befintliga SQL-guards: celler får inte sättas efter fastställande och pagineringsversioner är ersatta med beslut. Provhjälpen måste invänta laddad session innan den bedömer om navigationen behöver öppnas. Fältets hjälptext flyttades från label till aria-describedby, planvalets tillgängliga namn inkluderar skolan och dialogen fick explicit aria-modal. WebKit-provet hittade en för liten native-årskursväljare; explicit 44 px höjd och appearance:none rättar pekytan i avgränsad CSS. Inga tillämpade migrationer ändrades; inga provavbrott räknas som PASS.

Den skyddade navigationen använder Programplaner. Bredare termbyte och samlad UI-genomgång ligger kvar i befintliga todos. Skapande, nya versioner, förslag/beslut, fullmatris-/totalramkontroll, gymnasiets programplansgrund, kullkopiering och klasskoppling är fortsatt stängda. ADMIN-02/04 och hela fas 5 är inte slutverifierade; fas 4:s mänskliga checkpoint/datumanmärkning och separat verifiering kvarstår.
