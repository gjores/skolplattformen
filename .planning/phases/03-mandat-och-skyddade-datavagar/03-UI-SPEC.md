# Fas 3 — avgränsat UI-kontrakt

Utgå från befintliga `protected-home.tsx`, `context-switch.tsx`, `kund-workspace.tsx`, `logg-workspace.tsx`, server-client och session-channel. Återanvänd Sidebar, Button, Dialog och nuvarande typografi/färger. Ingen ny navigationsram eller ombyggnad av gymnasieflödet behövs.

- Lägg Mandat, Syntetiskt elevprov och Lokal anslutning i befintlig navigering när serverns aktuella funktion tillåter åtgärden. Menyn är bekvämlighet; servern gör säkerhetskontrollen. Visa alltid vald kund/skola/uppdrag och märk provdata tydligt.
- Mandatlistan visar mottagare, funktion, omfattning, giltighet och status. Tilldelningsdialog har etiketter, mottagare ur tillåtet urval, skolor/scope, datum och supportens syfteskod/sluttid. Serverns fel står vid fältet och i läsbar felregion; osparad inmatning bevaras. Avslut visar vem/vad som upphör och en tydlig bekräftelse.
- Elevhälsa visar Skola, Tilldelade elever eller Tilldelade ärenden enligt faktiskt scope. Ingen klienthämtad total elevlista att filtrera. Support visar godkännare och exakt sluttid; vid utgång töms data och ett begripligt meddelande ersätter innehållet.
- IT kan pausa/aktivera den lokala anslutningen och köra ett märkt syntetiskt test; inga elevkolumner. Versionskonflikt ska ge möjlighet att hämta aktuellt läge utan att skriva över det.
- Laddning, tomt tillåtet urval, 403/404, gammal epoch och loggfel har separata begripliga texter. Loggfel: Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig. Visa korrelation men ingen teknisk interntext.
- Vid kontextbyte/utloggning/spärr rensas elevinnehåll och pågående svar ignoreras genom befintlig epoch-/sessionkanal, också mellan flikar. Inget förbjudet innehåll i DOM eller nätverk.
- Dator: befintlig arbetsyta och sidomeny. Telefon: enspalt, kort/rader utan horisontell sidoscroll och dialog inom viewport. Minst 44px pekyta, synlig fokusmarkering, tangentbord, tillgängliga etiketter, korrekt dialogfokus och meddelanden som annonseras.

Plan 07 provar hela flöden med rollbyte, återkallelse, telefon/dator och byggd Worker. Skärmbilder kompletterar men ersätter inte nätverks- och beteendeprov. Användarcheckpointen ligger efter automatisk verifiering och får endast avse den körbara syntetiska leveransen.
