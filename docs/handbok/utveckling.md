---
title: Utveckla och verifiera
---

## Dokumentationsytan

Kör från projektroten:

```sh
npm run docs:install
npm run docs:dev
```

Handboken öppnas på http://127.0.0.1:3003. Bygg och förhandsvisa den med:

```sh
npm run docs:build
npm run docs:serve
```

Redigera sidorna i `docs/handbok/`. Konfiguration och låsta beroenden finns i `docs-site/`. Dokumentationsappen har egna beroenden; skolappens paket ligger i `web/`.

## Dokumentation i GSD

Varje berörd fasplan ska ange vilka handbokssidor som ändras och hur dokumentationen verifieras. Beskriv det användaren faktiskt kan göra, verifierat beteende och kvarvarande begränsningar. Kör dokumentationsbygget när handbok eller konfiguration ändras; brutna interna länkar ska stoppa bygget.

Planer och testbevis finns internt i `.planning/` och `work/pilot/results/`. Dessa kataloger ingår inte automatiskt i webbhandboken. Befintliga research- och pilotdokument under `docs/` bevaras som underlag; flytta en granskad text till handboken när den ska bli ordinarie vägledning och ersätt då ursprungstexten med en hänvisning.

## Appens kontroller

Appens utveckling använder Node 25 för den skyddade fasgrinden. Från `web/` körs relevanta modelltester, TypeScript, lint och bygge. `npm run verify:phase2` kräver den förberedda lokala testmiljön. Lokala konton och miljöförberedelser beskrivs i repo-filen `docs/pilot/account-access.md`.

Docusaurus-grunden följer [den officiella installationsanvisningen](https://docusaurus.io/docs/installation).
