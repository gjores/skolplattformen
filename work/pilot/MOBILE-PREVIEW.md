# Telefonprov på samma wifi

Mobilingången är en tillfällig lokal testhjälp beställd 2026-10-02. Den gäller enbart det isolerade `protected`-målet med syntetiska konton och uppgifter. Fysisk telefon och mänsklig begriplighet registreras först efter användarens prov.

## Start och användning

Den byggda skyddade appen på 127.0.0.1:3012, lokal test-IdP på 8180 och provkodshjälpen på 8181 måste köras. Starta separat från reporoten:

```sh
node work/pilot/mobile-preview.mjs --address <datorns privata wifi-IPv4>
```

Skriptet kontrollerar att adressen tillhör datorn och binder endast den adressen på port 3013. Det kräver verifierat lokalt provmål, rätt test-IdP och frisk Worker/DB. Ingen router, publik tunnel, IdP-klient eller produktkonfiguration ändras.

En ny privat åtkomstlänk sparas i den ignorerade filen `work/pilot/targets/protected/mobile-preview.json`, med filrättighet 0600. Dela länken eller dess privat genererade QR-kod med användaren. Nyckeln ska aldrig hamna i Git, rapporter eller driftloggar. Länken och ingångens separata HttpOnly-cookie gäller i två timmar; servern stannar sedan. Omstart skapar en ny nyckel och ogiltigförklarar den gamla länken. Stoppa tidigare med Ctrl-C.

Öppna åtkomstlänken på telefonen, välj **Logga in**, därefter **Rektor** eller **Huvudman** och **Logga in**. Välj **Fyll i provkod** och sedan **Logga in** igen. Öppna navigationen med knappen uppe till vänster och välj **Programplaner**. Utbildningarnas befintliga status och val bevaras. Telefonen behöver samma wifi och datorn behöver vara igång.

## Avgränsningar och autentisering

Ingången använder lokal HTTP, en slumpad åtkomstnyckel och två timmars livslängd. Den är inte en väg till verkliga elevuppgifter eller godkänd drift. Appens, IdP:ns och kodhjälpens ordinarie portar är fortfarande bundna till loopback. Endast den namngivna provrealmen och dess resurser nås via mobilingången; andra realmer och administrationsvägar nekas. Host, åtkomstcookie och anropets verkliga mobilursprung kontrolleras före vidarebefordran. Främmande/cross-site-anrop samt skrivningar utan rätt Origin nekas. Privata nycklar, lösenord och TOTP-underlag hämtas inte ur konfiguration eller returneras av gatewaykod.

Lokal test-IdP har redan ett genererat provtema som levererar syntetiska rollknappar till den inloggningssida användaren får läsa. Temat och kodknappen nås genom samma länkavgränsade mobilingång. Den är en uttrycklig utökning av den tidigare loopbackhjälpen till användarens wifi-prov, inte en publik tjänst. Kodanropet behöver ingångens cookie och använder därför `same-origin` i det omskrivna knappskriptet; den skickas inte vidare till OTP-hjälpen.

Synliga omdirigeringar, formulär och temaskript får mobilursprunget. Kodade OIDC-callbackparametrar behåller originalets URI. Appen gör fortfarande faktiskt kodutbyte, PKCE/state/nonce, identitetsregistrering, MFA-prövning, mandatkontroll och audit. Inget appkonto autentiseras av mobilnyckeln. Vid utloggning återkallas appsessionen och IdP-navigationen går genom mobilingången. Ursprungsöversättning gäller bara de fasta loopbacktjänsterna efter gatewayns eget nekande; ingen generisk proxy eller godtycklig upstreamadress finns.

## Verifiering

```sh
node --test work/pilot/mobile-preview.test.mjs
node work/pilot/verify-mobile-preview.mjs
```

HTTP-proven prövar åtkomstlänk, utgången cookie, explicit fel Host, främmande/saknat ursprung, andra realmer/adminvägar, kodväg, storleksgräns och bevarad OIDC-callback. Browserprovet använder den faktiska wifi-adressen och riktiga provinloggningar: dator rektor samt WebKit rektor/huvudman. Det läser befintliga SA-exempel, visar nytt VO-flöde för huvudman, kontrollerar MFA/mandat, frånvaro av främmande webbläsarursprung/horisontellt överflöde/verksamhetsskrivningar samt avslutad utloggning och 401 på session. Varje egen session återkallas; audit bevaras. Rapporten innehåller inga cookies, åtkomstlänkar, lösenord eller koder.

De första negativa omgångarna avgränsade mobilingångens referenspolicy: `no-referrer` på formulärsidan gav tomt Origin och korrekt 403 från gatewayn. Inloggnings-/resurssidor använder nu `same-origin`, medan den privata startlänken behåller `no-referrer`. Separata provassertions korrigerades för automatiskt valt ensamt uppdrag, faktisk avslutad utloggning och appens inloggningslänk. Inga produktkontroller försvagades. Slutresultat finns i `results/mobile-preview.json`; tidigare rapporter ligger privat under `/private/tmp/mobile-preview-*-failed.json`.

Prov på dator/WebKit över LAN-adressen verifierar inte telefonens faktiska nätverksåtkomst, Safari/Chrome på fysisk enhet eller mänsklig förståelse. Användarens återkoppling återstår.
