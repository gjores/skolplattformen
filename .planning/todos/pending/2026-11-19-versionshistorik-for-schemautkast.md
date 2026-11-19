---
created: 2026-11-19
title: Versionshistorik och återställning för schemautkast
area: schema
status: pending
phase: "05.2"
requirements: [SCHEMA-07, SCHEMA-08]
---

I användarprovet frågade schemaläggaren hur man går tillbaka till en tidigare sparad version. I dag visar sparbeskedet den senaste revisionens nummer. Äldre revisioner sparas på servern. Ångra gäller ändringar i det öppna utkastet och börjar om när sidan laddas om.

## Föreslaget beteende

- Lägg **Versionshistorik** vid sparbeskedet. Där kan behörig personal välja och förhandsgranska en tidigare sparad revision av samma utkast.
- Visa vad som ändras före återställning. Spara återställningen som en ny revision och behåll historiken.
- Kontrollera inför återställning att rätt skola, läsår och period är valda, att underlaget fortfarande gäller och att en nyare sparning hanteras som en konflikt.
