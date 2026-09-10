# Concerns

Kartlagt 2026-09-10. Detta är planeringsunderlag, inte en fullständig säkerhetsrevision.

1. **Demoidentitet och seedning:** `supabase.ts` och datalagrens laddning skapar/tilldelar demoåtkomst. Produktionsvägar måste sakna både bootstrapfunktionens rättigheter och automatisk seedning. Att radera en gammal migrationsfil upphäver inte en redan applicerad funktion.
2. **För breda uppdrag:** `profiles` har en roll och huvudman; rektorspolicyerna för lärartilldelning kontrollerar inte ledning av den berörda skolan. HM:s äldre skrivpolicy kvarstår. Gränssnittskontroller ersätter inte dessa policyer.
3. **Sessionsbundet elevregister:** `page.tsx` startar `AdminState` lokalt. Elevrelationer behöver varaktiga ID:n och regler för tillhörighet innan verklig synk byggs.
4. **Konkurrerande sparningar:** `docs/granskning-2026-09-07.md` beskrev risk att ett äldre timplanssvar skriver över ett nytt. Status måste återkontrolleras och regressionsprov läggas där nya lagringsflöden byggs.
5. **Klientskriven händelseroll:** Exempelvis `savePointPlanEvent` tar rollen från klienten. En säkerhetslogg ska härleda aktörens mandat och den faktiska åtgärden på servern.
6. **Skolgränser i relationer:** Ny elevlagring, grupper och klasskopplingar behöver databasvillkor som förhindrar relationer över fel kund/skola, inte bara klientfilter.
7. **Dokumentation är delvis historisk:** README och byggstatus innehåller äldre uppgifter om import, lagring och rollansvar. Följ faktisk kod och daterade ändringsunderlag. Nya offentlighetsförslag ska rättsligt granskas.
8. **Drift och integritetsrisk:** Avtal, identitetsleverantör, pilotkund, logg-/backupflöden och hantering av skyddade uppgifter är inte beslutade. En databasregion räcker inte som besked om kommunal driftlämplighet.

Tidigare rättade fel ska inte återöppnas enbart från den gamla granskningen: klasskopplingarna dokumenterar rättat skolval, UUID-baserade registerförslag och mobilens tabellöverflöde den 2026-09-08. Prova dessa som regressionsfall när berörda flöden ändras.
