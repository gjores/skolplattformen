# Överlämning till och från Workshopportalen

Använd den portaladress som användaren anger. Den lokala utvecklingsadressen är [127.0.0.1:3025](http://127.0.0.1:3025). Portalen ligger i det separata projektet `../workshopportal` bredvid Skolplattformen.

## Underlag till ett workshoputkast

Förbered fälttexter för **Workshops → Ny workshop**.

| Fält | Innehåll |
| --- | --- |
| **Namn** | Kort namn som beskriver arbetsmomentet, högst 160 tecken. |
| **Typ** | Workshop. Använd en annan typ om användaren valt det. |
| **Agenda** | Ren text för deltagarna med arbetsreferens, syfte, scenario, mötets delar och önskat resultat. Högst 8 000 tecken. |
| **Pilotgrupp**, **Tid i Sverige**, **Möteslänk**, **Deltagare** | Fylls i när användaren angett uppgifterna och bett om det. |

Efter **Skapa workshop**, lägg diskussionsfrågorna under **Frågor att diskutera → Lägg till fråga**. Använd en post per fråga. Sätt referensen först i **Fråga** (max 160 tecken). Lägg sammanhanget och vad deltagarna ombeds beskriva eller pröva i **Beskrivning** (max 8 000 tecken). Formulera frågorna öppet och konkret.

Kontrollera befintligt utkast med samma arbetsreferens före ny registrering eller omprov. Spara verifierad portalreferens i underlaget när den finns. Använd den faktiska adressen eller workshopens namn och arbetsreferens för att hitta den senare. Portalen öppnar en befintlig workshop via `/?workshop=<id>` om dess verkliga id är känt.

Agenda återges i kalenderinbjudan. Använd deltagaranpassad text och håll intern research i projektets underlag. Använd fiktiva personer om scenariot behöver visa elev- eller personaluppgifter. Kalenderinbjudan är en separat åtgärd och skickas på uttrycklig beställning. Använd portalens ordinarie inloggning och arrangörsbehörighet för skrivning.

## Utfall och uppdrag

- Workshopens frågor och uppdrag finns i workshopens detaljvy. Pilotdeltagare lämnar feedback i **Piloter → [pilotgrupp]**, så kontrollera att en feedbackpost faktiskt gäller den aktuella workshopen innan den används.
- Portalen saknar eget resultatfält och innehållsexport. Använd tillgängliga, avidentifierade mötesanteckningar eller återgiven feedback för analysen. Om arrangören vill lägga resultatet i portalen, spara en ny post under **Frågor att diskutera** med den ursprungliga frågereferensen i namnet, exempelvis `Utfall F2 – Salsbyte`. Använd **Beskrivning** för sammanfattningen.
- När en konkret insats ska läggas i portalen på användarens uppdrag, använd **Skapa uppdrag från frågan** eller **Skapa uppdrag från feedbacken** på den relevanta posten. Portalen kopierar namn och beskrivning och bevarar kopplingen till källposten. Kontrollera om ett uppdrag redan finns. För ett resultat som ska bli ett uppdrag, formulera resultatpostens insats före konvertering eftersom vyn för ett skapat uppdrag bara kan ändra status.
