# Docusaurus som del av projektet

Användarens instruktion: ”vill att Docusaurus är en naturlig del av projektet”.

## Genomfört 2026-09-22

- Docusaurus 3.10.2 i `docs-site/`, med egen låsfil och fyra granskade svenska handbokssidor i `docs/handbok/`.
- Rotkommandon: `npm run docs:install`, `docs:dev`, `docs:build` och `docs:serve`. Lokal adress http://127.0.0.1:3003.
- AGENTS.md, GSD-guiden och fas 3:s slutplan omfattar dokumentationsuppdatering och bygge. GitHub Actions kontrollerar dokumentationsbygget vid berörda ändringar; arbetsflödet är ännu inte kört på GitHub.
- Endast handboken byggs. Intern planering, lokala testkonton och privata miljöfiler importeras inte. Ingen extern publicering utförd.

## Verifierat

Ren installation från låsfil (`npm run docs:install`) och statiskt produktionsbygge passerar. Fyra sidor provade i Chromium med datorstorlek 1440×1000 och telefonstorlek 390×844: HTTP 200, inga sidfel och ingen horisontell överbredd. Mobilmenyn navigerar till användarhandledningen. Skärmbilder granskade visuellt. Detta är webbläsaremulering, inte ett nytt prov på fysisk telefon.

Äldre research- och pilotdokument återanvänds efter innehållsgranskning. När en text blir ordinarie handbok ska källan ersättas med hänvisning för att undvika dubbla sanningar. Handboken beskriver dagens verifierade omfattning; mer funktionsdokumentation följer genomförandet.

Användaren utökade arbetsutrymmet med ytterligare tio procentenheter; arbetet begränsades till högst 20 procent på veckomätaren.
