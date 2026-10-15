# 05-NAMED-TIMPLANS-UX-08 — namngivna arbetsytor

Implementerat och verifierat med isolerade syntetiska komponent-/browserprov. Gemensam verklig SQL/Worker/OIDC-paritet och hela programplansflödet verifieras separat i 11; inget godkännande av hela fas 5 eller faktisk lokal leverans följer av detta resultat.

## Beteende

- Skolans översikt visar alla namngivna timplaner och separata versionshistoriker. Två planer kan båda vara version 1.
- Skapa ny timplan kräver namn och kan kopiera exakt vald plan/version efter återläsning av revision, skola, utbildning och namndata. Oförändrad poäng-/terminsram behåller tid; ändrade rader återställs.
- Skapa ny version söker endast den egna serien. Befintligt öppet eget utkast återöppnas. Ändrad programkälla kan uttryckligen bli en ny version även från eget utkast/återsänd version; inskickat förslag måste först återtas.
- Byt namn ändrar benämningen. Historiken visar namnet vid beslut när det är känt, annars uttrycklig upplysning om att historiskt namn saknas.
- Programplanens utkast har neutral status, inte grön färdigmarkering. Arbetsmoment programplan, frivilliga klasser, timplaner och klasskopplingar visas utan att göra klasssteget obligatoriskt. Programrader med flera timplaner väljer ingen godtycklig första plan; explicit referens kan öppnas efter medlemskontroll mot raden.
- Ny separat komponent och strikt sessionsjournal hanterar skapa/version/namnbyte. Kund, medlemskap och uppdrag avgränsar journalen; det lagrade kommandot innehåller exakt skola, utbildning, källa/föregångare och revisioner. Epoch ingår inte i nyckeln så legitim MFA-retur/reload återfinner samma begäran. Inga andra uppdrags begäranden återanvänds.
- Journalens exakta bytes skrivs och återläses före POST. Rensning verifieras efter kvitto och färsk planläsning. Förlorat svar, MFA och reload behåller samma commandId. Felaktig lagring stoppar före skrivning; okänd sparstatus spärrar navigation. Fryst kvitto återställer aldrig senare namn. Namnkonflikt behåller inmatningen och kräver ny granskning.
- 09:s scopeKey/returnTo för klasskomponenten är bevarade. Timredigerarens autospar och spärrar består.

## Filer och avgränsning

Planens arbetsytor/CSS/beslutspanel samt `docs/handbok/timplaner.md`. Tillagda filer är `web/app/named-timplan-actions.tsx`, `web/lib/named-timplan-journal.ts`, dess test, `web/e2e/named-timplans.spec.ts`, två `named-timplan-preview`-fixturfiler och `web/playwright.named-timplans.config.ts`. Två tidigare gymversionsfall i `operational-class-timplan.spec.ts` uppdaterades till namnmetadata och granskningsknappar; klassproven ändrades inte. `plan-decision.css` behövde ingen ändring.

## Verifiering

- `node --test lib/named-timplan-journal.test.mjs`: 2/2 PASS, inklusive fel scope, fel skola, fel serie, extra fält, ofullständig kopia och saknad föregångare.
- `tsc --noEmit`: PASS efter slutändringen.
- Riktad oxlint på alla ändrade produktfiler: PASS.
- `playwright test --config playwright.named-timplans.config.ts --grep 'named-timplans.spec.ts|ny version använder'`: **36/36 PASS**, Desktop Chrome och iPhone 13/WebKit, separat port 5196. 32 nya fall och 4 tidigare versionsregressioner. Inga databasanrop eller identitetsleverantörer används av dessa mockprov.
- Rapport `/private/tmp/named-timplans-ui.json`, SHA-256 `63db560a36ad2adea47eda1bb3b8c4d555cafd6a64a6483f70ce2653f666a86c`.
- Dator-/telefonbilder i `/private/tmp/named-timplans-ui/` granskade. Dokumentbredd kontrollerad, dialogmål minst 44px, fokusretur efter Avbryt verifierad även på iPhone.
- Första omgångens fel gällde modalens gömda bakgrund i accessibility-selektorer och centralt felmeddelande; prov korrigerades. Extra fokusprov fann faktisk iPhone-avvikelse, åtgärdad med explicit fokusmål. Granskningen fann behov av lagringens write/read-back och remove/read-back; båda korrigerade och negativa prov passerar.
- `npm run docs:build`: PASS. Docusaurus kunde inte kontrollera uppdateringar i lokal konfigurationskatalog; själva dokumentationsbygget lyckades. Ingen publicering.
- `git diff --check` för ägda ändringar: PASS.

Appbygge görs en gång samlat av samordnaren efter UI/serverändringarna. Port 3012/3013 har inte startats om. Ingen DB, verkliga användarklasser, länkar eller originaldata ändrades. Ingen commit/push av underagenten.

## SS 12000 och kvarvarande verifiering

SS 12000:2024/OpenAPI 2.1.0 enligt paketmappningen: UI skickar stabila plan-/serie-/klass-/skol-ID:n. Interna timplansnamn ändrar inga organisationer, klassidentiteter, medlemskap eller giltigheter. Namnserien är intern och bevisar inget standardutbyte.

Verklig server-/SQL-paritet, hela nyutbildning→programplan→klasser→timplan→beslut-flödet med huvudmannaläsning och kontextbyten samt kontrollerad lokal leverans återstår i 11/12. Det syntetiska UI-resultatet ska inte beskrivas som migrerad verklig användardata eller riktig kommunanslutning.
