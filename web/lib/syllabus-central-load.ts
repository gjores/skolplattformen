/// <reference types="vite/client" />
// Webbläsarens laddning av genererad katalog för centralt innehåll. Varje
// ämnesversion blir en egen del som hämtas först när kursen öppnas.
import type { CentralSubject } from './syllabus-central.ts';

const files = import.meta.glob<CentralSubject>('./syllabus-central/*.json', { import: 'default' });

/** Okänd ämnesversion ger null, så att vyn kan visa att katalogen saknar den. */
export async function loadCentralSubject(code: string, version: number): Promise<CentralSubject | null> {
  const load = files[`./syllabus-central/${code}-${version}.json`];
  return load ? await load() : null;
}
