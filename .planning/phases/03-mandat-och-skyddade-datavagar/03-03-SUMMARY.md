---
phase: 03-mandat-och-skyddade-datavagar
plan: "03"
status: partial
completed: false
requirements_completed: []
updated: 2026-09-24
---

# 03-03 — servervägar, delvis genomförd

## Genomfört

Nya funktioner bevaras i sessionen utan bred äldre appRole. Aktuell SQL-giltighet avgör om ett uppdrag kan väljas. Kundlås tas före medlemslås; direkt låsning av uppdragsrader som krävde återkallade UPDATE-rättigheter är borttagen.

GET/POST mandat, personbunden rektorsutnämning, inbjudan/inlösen och avslut använder kontrollerade SQL-funktioner. Kundadmin kan inte utse rektor. SQL binder inbjudan till aktuell utfärdare och återkontrollerar denne vid inlösen. Avslut anropar mutationen exakt en gång, följt av en separat läsning i samma transaktion; första integrationsprovet fångade upprepad funktionsutvärdering i ett WHERE-uttryck, vilket rättades.

IT har lokal läsning/ändring/prov av enabled/version med konfliktkontroll. Inga externa anrop eller hemligheter ingår. Nya mandatoperationer spärras utanför lokalt syntetiskt protected-mål. Mutationer har serveridentitet, MFA, CSRF och befintlig atomär audit. Elevläsning har inte öppnats.

## Verifiering

- 272 modell-/serverprov PASS, inklusive fem nya kontraktsprov och utökade roll-/sessionsprov.
- Typkontroll, lint och protected-bygge PASS.
- 410 SQL-prov totalt PASS, inklusive 13 lokala IT-prov; se 03-02-SUMMARY och resultatfiler.
- Samtidiga riktiga Worker-anslutningar: väntande anrop nekades efter avslut, PASS.
- Isolerad byggd protected-Worker: 15/15 API-fall PASS, inklusive sju nya mandat-/IT-kontroller. Resultat: work/pilot/results/phase3-server-access.json. Byggartefakten skapades före servercommitten med samma serverkällor; verifieringsfilen beskriver detta.

## Avvikelser och återstående arbete

03-02 är ännu PARTIAL. Serverarbetet genomfördes mot dess inkopplade kontrakt för sammanhängande växling av äldre endpoints; detta innebär inte godkänd beroendeplan.

SQL är auktoritativ policy. currentMandateDecision kan läsa serverkontext men anropas ännu inte av rutterna; modell/SQL-paritet och full namngiven matris återstår. Äldre appoint_school_principal har stängts helt och ersatts av phase3_grant_mandate i stället för planens äldre RPC-länk.

API-prov för elevhälsa, tidsgränser/support, scopeförändring och verksamhetsinbjudan med ändrat utfärdarmandat måste kompletteras. Nuvarande API-prov använder syntetiskt utfärdade sessioner och ersätter inte OIDC-/browsergrinden. Ingen ny mandat-UI är byggd; gammalt rektorsformulär måste anpassas till personbundet kontrakt i 03-05.

En utvecklingsserverkörning gav 14/15 API-fall PASS men eget Origin nekades av CSRF-kontrollen på localhost:3000. Detta är en kvarstående dev-/originfråga och får inte döljas av den byggda Workerns resultat. Browserkontroll på dator/telefon krävs innan användarflödet godkänns. En annan provkörning avbröts när utvecklingsservern startades parallellt; den är inte PASS.

Tekniska auditobservationer ligger i docs/pilot/phase3-audit-source-notes.md. Docusaurus ändrades inte. Inga fasägda krav har markerats verifierade.

Kodcommits: 4706843, 93ce97a. SQL-agentens commits: df87ca6, b71412b. Användarens config.json/spike.json lämnades utanför.

Appen kör som byggd protected-preview på port 3000. Startsidan gav HTTP 200 och ett separat CSRF-prov på exakt http://localhost:3000 gav 2/2 PASS. Dev-originfrågan kvarstår separat.

## Komplettering efter utökad budget 2026-09-24

Commit fb6e6be rättar dubbel JSON-kodning i verksamhetsinbjudan: postgres-klienten får nu objektet via tx.json. Nytt API-prov var rött för giltig utfärdning före rättningen och grönt efter. Full API-svit 15/15 PASS, mandatfallet nu 19/19 kontroller. Bygge, typkontroll och lint PASS.

Tillkommande bevis: elevhälsa får explicit elevurval men kan inte delegera lärare; klienten kan inte ange parent; rektor får inte utse rektor; IT får varken verksamhetsdelegering eller läsa annan skolas anslutning; support över 60 minuter nekas och ett utgånget supportmandat blir ovalbart i befintlig session; personbunden verksamhetsinbjudan löses exakt en gång; avslutad utfärdare stoppar inlösen utan nytt mandat och spärrar underordnad elevhälsa.

Supportprovet flyttar endast det egna slumpgenererade testmandatets tidsfönster till dåtid. Det bevisar omprövning vid nästa anrop, inte exakt millisekundgräns. Ändrad scope/tid mellan utfärdande och inlösen och elevhälsoansvarigs fulla API-matris återstår. PARTIAL-status kvarstår. Inga UI-ändringar eller nya browserbevis.
