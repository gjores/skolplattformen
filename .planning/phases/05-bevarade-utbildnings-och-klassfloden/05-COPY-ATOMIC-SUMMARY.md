---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: COPY-ATOMIC
status: complete-local-bounded
completed: 2026-10-14
requirements_addressed: [ADMIN-03]
requirements_finally_verified: []
worker_build_revision: 2836908f810dd89c6135126b6cb766b32ac30783
human_acceptance: awaiting_user
---

# Komplett kullkopiering med säkert kvitto

Huvudmannen får ram, terminer och skolor i en enda transaktion eller ingen kopia. Begäran binder exakt källplan-/utbildningsrevision och senare kullstart. Status/replay återautentiserar verkliga aktuella mandat och samma hela request. Klienten behöver inga kompletterande writes efter kvittot. Kvittot är initial revision 0; exakt återläsning visar den sparade planens revision 1. Elever, klasser, timplaner, tidigare beslut och skolpaketsval kopieras inte.

Commits: `4b26085` plan, `8d55232` kopieringsväg/SQL/UI/prov/handbok, `2836908` strikt HTTP-statusrundresa, `ccf4ae6` aktivering/inventerad auditbaslinje/aktuellt browserurval och `5463354` utkaststatus skild från analysberedskap. Slutlig knappetikett i F03 följer den aktuella huvudmannauppgiften.

Färska 41 modell/server, 8 offlinegrindar, SQL44, Workerpreflight16, slutWorker16, UI18 och verklig browser2 PASS; typ/lint/separat protected bygge/handbok PASS. Fulla originalrader, audit/identiteter, rättigheter och journal bevarade enligt [verifieringen](05-COPY-ATOMIC-VERIFICATION.md). Samma prövade bygge med 192 filer är levererat på 3012, föregående bygge bevarat. Inget nytt huvudkopiebygge eller extern publicering.

Utöver ursprungliga delkopieringsfelet hittades och rättades ett kvitto-/läsåterhämtningsfel och ett verkligt HTTP-statusfältfel. Första fel, provverktygsanpassningar och historiska loggankare redovisas i verifieringen. Ingen historisk avvikelse reparerades tyst.

Nytt [användarprov](05-COPY-CLASS-USER-TRIAL.md) gäller kopiering samt klassens läsår/exakta timplansversion. Befintliga SAM_TEST/ESESM är syntetiska exempel med 2 500 programplanpoäng och ifyllda aktiva timfält; deras planer är ännu utkast. Huvudmannens granskning/fastställande är därför ett uttryckligt förberedelsesteg före klasskoppling, inte något root har gjort åt användaren. Full fasacceptans och ADMIN-01:s skolimport återstår enligt [kravgenomgången](05-CURRENT-AUDIT-20261014.md). Historiska 88/100 och 3/8 räknas inte om.

Avvikelse från planens nya OIDC-prov: inga identitets-/inloggningskällor ändrades. Slutligt browserprov använder syntetiska servermintade sessioner, tidigare riktiga lokala OIDC-bevis är historik. Ingen ny OIDC-, fysisk mobil- eller verklig kommunanslutning påstås.
