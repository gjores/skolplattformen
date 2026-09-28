---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "12"
subsystem: register-list-ui
status: implemented-awaiting-browser
completed: 2026-09-28
requires: [04-09, 04-11]
provides:
  - Serverstyrd elevlista med säkert adressurval och sökning i komponentminne
  - Läsårsväljare och livscykelrensning i skyddad arbetsyta
requirements-addressed: [STU-01, STU-02, STU-05, DATA-01]
requirements-finally-verified: []
---

# Fas 4 plan 12: elevlista och läsår

**Elever ersätter elevprovet som startvy för personal med elevläsning. Listan använder serverns projektion, filteralternativ, antal och rättigheter; läsår och ofarliga urval går att återställa från adressen.**

## Genomfört

- `PupilRegisterWorkspace` skickar sökord enbart i POST-kroppen. Söktext ligger endast i komponentminne och aldrig i adress, webbläsarhistorik eller storage. Sökning sker uttryckligen, medan filter/sida hämtar nytt serverurval. Inga elevrader klientfiltreras och filteralternativ härleds aldrig från elever.
- Dator använder tabell; telefon högst 800 px använder kortlista. Fält renderas bara ur serverns projektion. Födelsedatum ingår i särskiljande rad endast när servern returnerar fältet. Anonym rad saknar markering när `canExport=false`; inget skyddsmärke läggs till. Markering töms vid ändrat urval.
- Skola, klass, utbildning, årskurs, status och sida får säkra URL-parametrar via modellens stängda parser/serialisering. Okända/otillåtna parametrar får samma generella text och första tillåtna skola. Bakåt/framåt återställer urval. Omladdning återställer inte fritext.
- Elevhälsans tilldelade ärende väljs uttryckligen före läsning; rätt skola följer ärendets servermetadata. Ärende-ID ligger i minne och requestbody, inte URL.
- `SchoolYearPicker` finns före uppdragsväljaren, med synlig etikett och föregående/nästa. Serverns bootstrap avgör år/aktuellt år och uppdragets referensurval; inget elevinnehåll behövs för bootstrap. Byte av läsår återställer sida 1. Transportfel återgår till senast lyckade läsår/lista; mandat-/loggfel lämnar inget gammalt listinnehåll.
- Arbetsytan nycklas på epoch och assignment. Avmontering/urvalsbyte använder verklig AbortSignal och ignorerar sena svar även om transporten inte avbryter. Transportens frivilliga signal är bakåtkompatibel med befintliga anrop.
- Kontextbyte, sessionförlust, lås och utloggning tömmer registeryta, år, dialog och URL. Gamla `sp_elevsok*`-nycklar rensas i båda storageformer, även när webbläsaren nekar storageåtkomst. Supportslut schemaläggs mot serverns tidsstämpel och rensar innan låsvyn visas.
- Vanlig flikväxling återkontrollerar session utan att montera om oförändrat uppdrag, så sökningen bevaras i flikminne. Fördröjd sessionskontroll kan inte återställa session efter lås/utloggning.
- Nya CSS-regler är avgränsade till registret/läsårsväljaren. Exempelläget behåller sin befintliga vy.

## Verifiering och kravspårning

| Kontroll | Resultat vid denna sammanställning |
|---|---|
| RED: arbetsytans egna AbortSignal | Förväntat rött före transportändring |
| `node --test lib/pupil-register-model.test.mjs lib/server-client.test.mjs` | PASS 35/35 efter ändring |
| `npx tsc --noEmit && npx oxlint app lib` | PASS under implementation; slutkontroll efter sista livscykelrättningar pågår hos orkestrator |
| Browser, dator/telefon | Väntar orkestratorns riktade prov; inte PASS |
| Full fasgrind/UI-grind | Kvarstår i 04-19/04-21 |

STU-01/STU-02/STU-05 kopplas till serverstyrt listurval, läsår, stabila ID och säker URL-parser i modellproven. DATA-01 kopplas till transportens abort/epoch-prov samt projektion och minnesbegränsningar. DOM, nätverk, faktisk layout och livscykel måste dessutom beläggas i browserprov. Ingen kravstatus är slutverifierad här.

## Avvikelser och avgränsningar

1. **Rule 2 — saknad startkontext:** Befintligt list-API kräver skol-ID/läsår men gav ingen bootstrap med serverns läsår och supportsluttid. Orkestratorn levererar separat auditerat `GET /api/elever/urval` och smal SQL-funktion. UI använder exakt avtalat kontrakt, ingen gissad behörighet eller klientkalender.
2. **Rule 2 — faktisk avbrytning:** `server-client.ts` fick frivillig signal för get/post; befintlig global epokhantering kvarstår. Riktat RED→GREEN-prov belägger att sent innehåll stoppas utan att andra aktuella anrop låses.
3. **Rule 1 — livscykel:** Den äldre shellen avmonterade vid varje synlighetskontroll och kunde därmed rensa fritext trots oförändrat uppdrag. Sessionsjämförelse och bootstrapnyckel är rättade.
4. Läsårskomponenten inkluderas i första uppgiftscommit för att listans typberoende ska vara komplett. Shellintegration ligger i egen uppgiftscommit.
5. Elevkort kopplas i 04-13 via `onOpenPupil` och valt elev-ID enbart i minnet. Förberett history.state innehåller bara `{pupilCard:true}` och samma adress. Nuvarande shell skickar ingen kortcallback, därför visas namnet som text och ingen låtsaskortvy. Exportdialog/-åtgärd kopplas i 04-17; inget ännu stängt export-API erbjuds som fungerande knapp. Samlade kort-/exportflöden är inte verifierade i denna plan.
6. Handbok, bootstrap och samlade browser-/byggkontroller ägs av orkestratorn. Inga verkliga elevregister ansluts och syntetiska prov godkänner ingen verklig drift.

## Commits

- `35d1863` — serverprojicerad lista, läsårskomponent, scoped layout och avbrytbar klienttransport.
- `1e6653a` — navigation, läsår, bootstrapkonsumtion och sessionslivscykel.
