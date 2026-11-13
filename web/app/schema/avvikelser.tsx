'use client';
// Regelavvikelser efter flytt för hand (05.2-SM-FLYTT) och schemamotorns förklaring. Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import type { SchemaForslag, SchemaKontroll } from '@/lib/schema-contract.ts';

export function Regelavvikelser({ kontroll }: { kontroll: SchemaKontroll | null }) {
  if (!kontroll) return null;
  return <div className="schema-list"><h2>Regelavvikelser ({kontroll.total})</h2>
    {kontroll.total === 0 ? <p>Inga regler bryts av schemat som det ligger nu.</p> : <>
      <p className="schema-note">Schemat som det ligger nu bryter mot reglerna nedan. Passen är märkta i schemat. Flytta ett pass eller ångra för att rätta.</p>
      <ul>{kontroll.violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
      {kontroll.total > kontroll.violations.length && <p className="schema-note">Visar {kontroll.violations.length} av {kontroll.total}.</p>}</>}</div>;
}

export function Forklaring({ diagnoses }: { diagnoses: SchemaForslag['diagnoses'] }) {
  if (diagnoses.length === 0) return null;
  return <div className="schema-list"><h2>Schemamotorns förklaring</h2>
    <ul>{diagnoses.map((x, i) => <li key={i}>{x.message}{x.proof && ' (Bevisat: det går inte med det här underlaget.)'}</li>)}</ul></div>;
}
