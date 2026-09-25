---
title: Skriva i handboken
---

Sidan vänder sig till den som redigerar handboken.

## Köra handboken lokalt

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

Sidorna ligger i `docs/handbok/`. Konfiguration, sidmeny och låsta beroenden ligger i `docs-site/`. Dokumentationsappen har egna beroenden; skolappens paket ligger i `web/`.

En ny sida måste läggas till i sidmenyn för att synas. Brutna interna länkar stoppar bygget avsiktligt — kör bygget innan du lämnar ifrån dig en ändring.

## Vad som hör hemma här

Handboken innehåller **användarinstruktioner och de regler systemet tillämpar**. Inget annat.

| Hör hemma i handboken | Hör hemma i interna repodokument |
|---|---|
| Vad användaren kan göra och i vilken ordning | Tekniska API- och datakontrakt |
| Regler systemet prövar, och varför något nekas | Driftanvisningar och miljöuppsättning |
| Användarsynliga begränsningar | Planering, fasstatus och provresultat |
| Vad som är verifierat och vad som återstår | Testkonton och miljöfiler |

Skriv på svenska med verksamhetsord. Beskriv vad användaren faktiskt kan göra. Skilj tydligt på vad som är verifierat, vad som är byggt men oprövat och vad som är ett öppet beslut — förslag är inte leverans.

Kopiera aldrig in hemligheter, testkonton, personuppgifter eller utdrag ur planeringen. Befintliga research- och pilotdokument under `docs/` bevaras som underlag; när en granskad text ska bli ordinarie vägledning flyttas den hit och ursprungstexten ersätts med en hänvisning.

## När handboken ska uppdateras

Ändras det användaren kan göra, ska handboken ändras i samma arbete. Ange verifierat beteende och kvarvarande begränsningar, och kör dokumentationsbygget när handbok eller konfiguration ändrats.

Docusaurus-grunden följer [den officiella installationsanvisningen](https://docusaurus.io/docs/installation).
