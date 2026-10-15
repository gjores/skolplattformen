# NAMED-TIMPLANS-UX-12 — installations- och leveransverktyg

Status: förberedda och lokalt enhetstestade; ingen liveinstallation eller leveranskörning har utförts av denna deluppgift. Samordnaren granskar och kör först efter slutligt plan 11-resultat med granskade dator- och telefonbilder. Detta dokument ersätter inte planens slutliga leveransresultat.

## Ändrade filer

- `work/pilot/apply-named-timplans.mjs`
- `work/pilot/deliver-named-timplans.mjs`
- `work/pilot/deliver-named-timplans.test.mjs`

## Verifierat

`node --test work/pilot/deliver-named-timplans.test.mjs`: 55/55 passerade. Ett test kör dessutom samtliga 48 tidigare snäva JWT-metadataprov mot **de nya leveransverktygets egna helperbytes** i en isolerad Node-process. Inga databas-, IdP-, webbläsar- eller runtimeanrop sker i dessa prov. Syntaxkontroll av båda verktygen passerade.

Negativa fall omfattar saknade/misslyckade samtidighetsprov, samma anslutning, utebliven observerad blockering, fel vinnare, endast authsmoke i stället för faktiskt API-prov, käll-/migrations-/artefaktdrift, saknade faktiska callbacks, ofullständig städning, telefonprov/bildhashar/visuell granskning som saknas, originalkolumn- och ACL-differenser, osäker committolkning, fel tidigare runtime, ändrade artefaktbytes, process-ID som återanvänts, oönskade processföräldrar, symlänkar, sökvägstraversering och fel filrättigheter. Rapporters kompletta atomiska ersättning med fsync och 0600 har filsystemprovats.

## Installationsgrindar

Exakt fem migrationer, i ordning: `20261015200000`, `20261015201000`, `20261015202000`, `20261015203000`, `20261015204000`. Plan 11:s SQL- och faktiska API-/browserrapporter måste vara aktuella, PASS, syntetiska/schema-only, helt städade och bundna till identiska migrationshashar och produktkällor. Bilderna kräver `browserEvidence[device].screenshotHashes` med exakt filuppsättning och verkliga SHA256-värden samt `visualReview: reviewed`. Verifieringskällor måste stämma både före/efter prov och vid användning. Endast privata 0600-JSON-filer i `/private/tmp` accepteras.

`--verify` utför en läsande transaktion; ingen live-DDL eller rollbackinstallation. `--apply` kräver samma förhandsrapport, verktygsbytes, mål, schema och provaspekt. Partiell/tidigare installation vägras. Liveinstallationen har 5 s lock_timeout, 25 s statement_timeout, 30 s transaction_timeout och explicita tabellås. Originalkolumner i samtliga befintliga public-tabeller hashjämförs före/efter under lås, inklusive tidsstämplar; bara de uttryckliga tilläggskolumnerna undantas. Gamla journalrader, tabell- och funktionsrättigheter, ägare och RLS-flaggor bevaras. Ingen radexport. Nya rader/kolumner valideras mot backfillkontraktet. Commitförsök och bekräftad commit journalförs atomiskt före nästa steg; osäker commit innebär uttryckligt återställningsbehov, aldrig blind nedmigrering. Exakta migrationsbytes synkroniseras därefter till den lokala målkonfigurationen.

## Leveransgrindar

Verifierad commitrapport krävs tillsammans med fortsatt aktuella plan 11-bevis och exakt kandidatartefakt. Kandidaten kopieras utan `.dev.vars`/`.dev.vars.lock`; alla övriga filbytes, inklusive build-mode, jämförs. Skyddad lokal målkonfiguration binds separat och måste vara exakt. Ingen ombyggnad eller extern publicering.

Förhandskontrollen kräver dessutom `--previous-runtime` med tidigare godkänd leveransrapport. Dess afterArtifact måste stämma med katalogen, och varje aktiv process måste matcha PID/starttid/kommandorad; endast managerprocessens normala omföräldring till PID1 tillåts. Detta hindrar att en byggnad som skrivit över en aktiv katalog accepteras som återställbar föregående version. Leveransens `--apply` hämtar denna referens från dess `--verify`-rapport.

Bara exakt observerad lokal 3012-processkedja stoppas. Föregående artefakt behålls, samma godkända kandidat startas och verklig läsande OIDC/MFA verifieras mot en redan befintlig syntetisk rektorsbehörighet. Klasser och namngivna gymtimplaner läses via API och DB-/Worker-spår jämförs. Inga nya verksamhetsobjekt skapas. Identitets-/sessionsrader jämförs endast i minnet; privata rapporter innehåller hashbevis, ingen full rådatabasdump. Bara bevisat egna sessionsrader och barn städas. Snäva, observerade JWT-tidsrotationer accepteras; okända originaldifferenser underkänns. Vid fel efter stopp återställs tidigare artefakt och lokala runtime; återställningsfel journalförs.

## Observerat och hanterat under förberedelsen

Read-only processinspektion visade att den aktiva 3012-processen faktiskt läste `web/dist-protected`, vars filer hade skrivits över av kandidatbygget. Exakt föregående 201-filsartefakt återfanns i `runtime/class-cohort-fixed-548857d1-c713-4a3e-a18d-d2d487948230/web/dist-protected`, SHA256 `5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c`. Tidigare PASS-leveransrapport binder dessa bytes till samma processkedja. Kandidatens 204 filer, SHA256 `9ef82e4d125e231082ec70e4ba2f1b3dd0df7a7d1dbed40a820a4eebc6871c2e`, fanns redan bevarade separat. Samordnaren återställde därefter gamla filer och exakt tidigare privata konfigurationshashar utan processändring; separat bevis `/private/tmp/named-active-baseline-restored.json`. Denna deluppgift utförde endast identifiering/hashkontroller, ingen återställning.

## Kvar inför körning

Samordnaren behöver slutföra plan 11:s faktiska dator-/telefonprov, granska bilder, lägga deras hashbindning och granska verktygen. Därefter körs läsande installationförhandskontroll, bounded installation, leveransförhandskontroll och exakt lokal leverans. Full plan 12 kräver även handboksbygge, faktisk leveranskontroll och mänskligt begriplighetsprov; inget av detta markeras klart här. SS 12000:2024/OpenAPI 2.1.0 påverkas inte av dessa driftverktyg; originalens stabila klass-/organisations-ID:n och giltigheter bevaras och inget externt standardutbyte påstås.
