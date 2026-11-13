# Designvyer för schemaläggningen (kopia)

Kopia 2026-11-13 av designytan [Schemaläggning – vyer](https://claude.ai/artifact/WhNPFpntdZs9eT3tZyAcfL) (version `1794591829-ef0b`). Designytan är källan; kopian finns här så att den som bygger kan läsa markup, mått och texter utan inloggning. Syntetiska namn och exempeldatum. Skisser, inte byggt. Ändras designytan ska kopian uppdateras i samma förändring.

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
