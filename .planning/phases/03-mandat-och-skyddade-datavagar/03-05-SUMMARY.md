---
phase: 03-mandat-och-skyddade-datavagar
plan: "05"
status: partial
completed: false
requirements_completed: []
updated: 2026-09-24
---

# 03-05 — avgränsad mandat- och IT-vy

Genomfört: mandatkort med mottagare, skolor, omfattning, giltighet/status och bekräftat avslut; IT med namngivet skolval, paus/aktivering, märkt syntetiskt test och versionskonflikt som kräver omläsning. Vyerna återanvänder aktuell session/epoch och ignorerar sena svar efter avmontering. Navigation visar endast relevanta funktioner. Inga elevvägar eller elevgrants har öppnats.

Migration22 förbereder namngiven metadata endast för redan administrerbara mandat samt skolurval för aktuellt IT-mandat. API GET/kund/anslutning utan unitId returnerar detta skolurval. Befintliga behörighetskontroller är kvar. Metadata- och skolgränsprov tillagda i SQL-sviten.

Verifiering: tsc och lint PASS. Fyra isolerade Playwright-komponentprov PASS på Desktop Chrome/iPhone WebKit: namngivna mandat, mobilbredd,44px knapp, bekräftat avslut samt IT409 med obligatorisk omläsning. Dessa använder uttryckligen mockade svar och bevisar INTE backendbehörigheter, full sessionsintegration eller OIDC. Separat konfiguration playwright.mandate-ui.config.ts; detta får inte ersätta plan07:s fulla browserprov. Telefonskärmbild granskad.

Miljö: tidigare Dockercontainrar/volymer saknades i båda tillgängliga kontexter. Användaren godkände uttryckligen återskapande av separat syntetisk provmiljö och nya testkonton. Etablering via prepare-local påbörjad; nya faktiska databas-/API-resultat måste antecknas separat, gamla rapporter är historik.

Återstår: behörigt mottagarurval/tilldelningsformulär, elevprov och export efter komplett audit, distinkt audit_unavailable-serverkod (nu generiskt500), full backendanslutning och dator-/telefonprov med faktisk session. Plan04:s källluckor kvarstår. Ingen plan eller fas markeras klar.

Commits:83d2698(UI),38b5079(metadata/testharness). Intern testharness är ingen produktvy.
