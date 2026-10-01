# Tillfälliga knappar för lokal provinloggning

Aktiverade 2026-10-01 på användarens begäran för att slippa leta efter provkonton.

Öppna den lokala skyddade appen, välj **Logga in** och välj därefter roll under **Välj provkonto** på test-IdP:ns inloggningssida. Knappen fyller i användarnamn och maskerat lösenord. Välj sedan **Logga in** för vanlig OIDC-inloggning. Åtta provroller finns: rektor, huvudman, skoladministratör, lärare, elevhälsa, IT, granskare och support. Behörighet och aktuell uppdragsstatus styr fortfarande vad kontot får göra; en provknapp skapar inget mandat. Eventuell engångskod/MFA påverkas inte.

Aktivera: `node work/pilot/idp-test-buttons.mjs --enable`.
Stäng av: `node work/pilot/idp-test-buttons.mjs --disable`.

Skriptet kräver assertTarget('protected', requireIdp), den namngivna lokala testrealmen och en containerport bunden endast till 127.0.0.1. Bara loginTheme ändras; klienter, lösenord, användare och autentiseringsflöden ändras inte. Temat och lösenordsunderlaget genereras under gitignorerade work/pilot/targets/protected/idp, med privata filrättigheter på värddatorn. Inga inloggningsuppgifter skrivs i Git eller verktygsutdata. Det genererade temat levererar de syntetiska lösenorden till webbläsaren på den lokala IdP:n; detta är avsiktlig testhjälp och ska aldrig användas med verkliga konton eller på en externt åtkomlig tjänst. Avstängning återställer föregående tema och tar bort de genererade temafilerna.

Browserprov mot den riktiga lokala inloggningssidan PASS vid 1440×900 och 390×844: åtta knappar, byte mellan rektor och skoladministratör med rätt ifyllda värden, maskerat lösenord, minst 44 px höjd och inget horisontellt overflow. Provet skickade inte in lösenorden och utgör inget nytt fullständigt inloggnings-/MFA-prov. Den vanliga autentiseringen är oförändrad. Körloggen innehåller endast kontrollresultat.

En första metadata-/mallkontroll avvisades av automatisk säkerhetsgranskning på grund av möjlig autentiseringsinformation i utdata. Den ersattes med kontroll som inte skriver ut lösenord eller TOTP-material. Endast offentliga temamallar och tillåtna provkontons användarnamn visades.
