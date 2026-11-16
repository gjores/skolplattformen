# Designvyer för schemaläggningen (kopia)

Kopia 2026-11-13 av designytan [Schemaläggning – vyer](https://claude.ai/artifact/WhNPFpntdZs9eT3tZyAcfL) (version `1794591829-ef0b`), kompletterad 2026-11-16 med omgång 1 (version `1794864525-e753`). Designytan är källan; kopian finns här så att den som bygger kan läsa markup, mått och texter utan inloggning. Syntetiska namn och exempeldatum. Skisser, inte byggt. Ändras designytan ska kopian uppdateras i samma förändring.

Filerna är Design Component-sidor (`.dc.html`): vanlig HTML med inline-stilar. De renderas inte fristående (de hänvisar till designytans `support.js`), men strukturen, texterna och CSS-värdena går att läsa direkt.

## Vy → arbetspaket

| Fil | Vy | Arbetspaket ([arbetsflödet](../05.2-SM-UTVECKLING-WORKFLOW.md)) | Research |
|---|---|---|---|
| `Main.dc.html` | Veckan med villkor, verktyg och högerklick | SM-YTA (rutnät, pass, teckenförklaring), SM-VILLKOR-SYNS (fält, band, lagerchips), SM-MENY (verktygsfält, passmeny), SM-VECKOVY (Grundschema / Vecka / Datumintervall) | M83–M94, D27, W6 |
| `Sparra.dc.html` | Spärra en tid direkt i schemat | SM-MENY | M89–M91, M94 |
| `Samlingsvy.dc.html` | Följ passet och möjlighetskarta | SM-LAGEN (data), SM-FOLJ (vy), SM-SAMLINGSVY (lägg till resurs, arbetsvy) | I51–I53, J61 |
| `Regler.dc.html` | Marginaler för pass | SM-MARGINAL | N95–N104 |
| `Fonster.dc.html` | Flera fönster som uppdateras live | SM-FONSTER | O105–O109 |
| `Aktiviteter.dc.html` | Aktiviteter utanför tjänstefördelningen | SM-AKTIVITETER (återkommande, formulär, lista, visning); förslagstabellen för inställda pass hör till senare paket med schema i tid | P110–P118 |
| `Lasar.dc.html` | Läsåret med nationella prov | Inte i denna spree: hör till läsårskalendern (05.1.1), kräver kontroll av Skolverkets underlag | P119–P120 |

### Omgång 1 till UX-researchen (2026-11-16, designytans version `1794861092-ef28`)

Sex nya vyer för kedjan i [UX-researchens](../05.2-SM-UX-RESEARCH.md) genomförandeföljd 1–2. Designhypotes, inte beslutad navigation eller implementation. Ytan Granska är inte ritad än (omgång 2).

| Fil | Vy | Vad den prövar |
|---|---|---|
| `Forbered.dc.html` | Förbered – överblick | Gemensam överdel (sparstatus, vad Ångra avser), nästa uppgift, fyra områden med människans genomgång skild från maskinens kontroll, föregående läsår som förslag, verkliga beroenden |
| `Salar.dc.html` | Salar – register och salbehov | Stabilt sal-ID, tre lägen för salbehov plus obesvarat, krav som snitt, önskemål skilt från krav, varför en sal är olämplig, okänd kapacitet, namngivet hinder |
| `Saltabell.dc.html` | Salbehov som tabell med massändring | Urval markerade rader eller alla filtrerade, blandade värden, undantag, ändringstyp, grundvärde skilt från befintliga, förhandsgranskning med antal |
| `Forutsattningar.dc.html` | Förutsättningar just nu – alla tillstånd | Fyra frågor med egna besked (uppgifter, utrymme, prövning, kvalitet), vad beskedet inte visar, prova alternativ utan att ändra regeln, ofullständig provsökning |
| `Salsattning.dc.html` | Tilldela salar och behåll tiderna | Omfattning, oförändrade tider/lås/datum, hinder när salar inte räcker, blockets salar, begränsat omtag med budget, helförslag åtskilt med hållpunkt |
| `Veckan2.dc.html` | Lägg schema – veckan med inspektör | Arbetsgrund Hela läsåret, visning HT/VT/faktiska datum, klick visar passet, sammanhängande lägesfält, exakt start 10:35 med 44px-stegning, inspektör som följer/fästs |
| `AktivitetFlera.dc.html` | Aktivitet för flera klasser | Gemensam aktivitet, en per klass eller en per lärare; urval av klasser; samma tid, motorn per klass eller egen tid; förhandsgranskning per klass med ansvarig, sal och krock; serie; klasser väljs med sökfält; lunch i matsal med sittningar och platser (kräver nytt motorstöd). Användarfynd 2026-11-16 |
| `Oversikt.dc.html` | Lägg schema – översikt över många resurser | Vyval Vecka/Översikt/Pass i tabell; verktygsfält för rader (klasser, lärare, salar, grupper), grundschema HT/VT, vecka eller datumintervall, dag med datum eller hela veckan, urval och sparade urval; faktiska tillfällen i vald vecka; tid i sidled, lediga salar per timme, pass utan sal, gemensam inspektör. Användarfynd 2026-11-16 |
| `NationellaProv.dc.html` | Välj nationella prov | Skolverkets underlag med hämtning och ändrade datum; prov per termin med krav, datum, föreslagna grupper, osäkra grupper och krockar; panel för det som kräver beslut; bokningar läggs i kalenderns utkast först när frågorna är besvarade. Hör till läsårskalendern (05.1.1). Användarbegäran 2026-11-16 |

Förbereds checklista har efter användarens granskning sex punkter: Underlag, Lektioner och block, Salar, Lärartider och fasta tider, Regler och önskemål samt Mål för schemat.

Statusytor `warning-surface` och `destructive-surface` används som i tabellen nedan. Inspektör, uppgiftsöversikt, återkopplingskort och Vad händer om är nya mönster som ska föras in i Skolplattan när beteendet bestäms.

## Färger i skisserna → appens variabler

Skisserna använder hexvärden. I koden används bara variabler (AGENTS.md, Skolplattan). Nya variabler läggs i `web/app/globals.css` av SM-YTA och förs in i designsystemet Skolplattan i samma förändring.

| Skissens värde | Betydelse | Variabel |
|---|---|---|
| `#f7f8fa` `#fff` `#202b3b` `#657185` `#e3e7ee` `#cbd2df` | bakgrund, kort, text, hjälptext, kant, fältkant | `--background` `--card` `--foreground` `--muted-foreground` `--border` `--input` |
| `#365ce6` `#2d4cc1` `#edf1ff` | primär, markerat, pass | `--primary` `--accent-foreground` `--accent` |
| `#edf0f6` `#25334a` | valt verktyg, marginal | `--secondary` `--secondary-foreground` |
| `#4f688b` | små rubriker | `--heading-accent` (finns i Skolplattan; lägg i appen om den saknas) |
| `#e4f3e9` `#29704c` `#9ccdb0` | fri tid, klart | `--success-surface` `--success-foreground` (+ kant som `color-mix`) |
| `#eaf0fe` `#4463a4` `#c9d6f7` `#8ea6e6` | går med ett byte, info | `--info-surface` `--info-foreground` (+ ränder som `color-mix`) |
| `#f6efe2` `#5c4214` `#d9bf8f` `#86601f` | bryter önskemål, varning | **ny** `--warning-surface`, befintlig `--warning-foreground` |
| `#fbeeee` `#efc6c6` `#d08b8b` `#b83737` `#8a2a2a` | regelbrott | **ny** `--destructive-surface`, befintlig `--destructive` |
| `#eef1f5` `#d7dde7` `#e1e6ee` `#8a95a8` | spärrad tid (skuggning), marginalens prickade kant | **nya** `--schema-hatch`, `--schema-hatch-line`, `--schema-hatch-border` |
| `#c3cff5` | passets kant | befintlig `color-mix(in srgb, var(--primary) 35%, var(--card))` i `schema.css` |

Mönster som inte bara bygger på färg (krav M86 och designsystemets tillgänglighetsregler): spärrad tid = diagonal skuggning + streckad kant; regelbrott = vågräta ränder + röd kant + text; går med byte = diagonala ränder; marginal = prickad kant + etikett; aktivitet = grå yta, mörk kant + typens namn; inställt pass = överstruket + streckad kant.

## Senare forskningsskiss 2026-11-16

[schema-ux-research-20261116.html](schema-ux-research-20261116.html) är en ny interaktiv principskiss till [den fördjupade UX-researchen](../05.2-SM-UX-RESEARCH.md). Den är inte en kopia från den äldre designytan ovan och ersätter inte de redan beslutade vyerna med en godkänd implementation. Den använder Skolplattans lästa färger, typografi och mått men kopplar inte till någon riktig app, motor eller databas.

Fragmentet visar Förbered/Lägg schema/Granska, ett salskrav via formulär/tabell, inaktuell bedömning och granskat/ångringsbart salbyte i samma exempelutkast. Chattens kopia har identisk källhash. [Klick-/layoutkontrollen](../../../../work/schema/results/ux-prototype-20261116.json) har 16/16 PASS och beskriver uttryckligen att det inte är produkt- eller användartestning. Full tillgänglighets- och användbarhetsverifiering återstår. Bara syntetiska exempeldata finns i filen; den ska inte importeras i handboksbygge eller publiceras automatiskt.
