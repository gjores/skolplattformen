'use client';
// Regelavvikelser efter flytt för hand (05.2-SM-FLYTT) och schemamotorns förklaring. Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import { OppnaFonster } from './fonster';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { avvikelseNyckel, medvetenKrock } from '@/lib/schema-utkast.ts';
import type { SchemaForslag, SchemaKontroll, SchemaViolation } from '@/lib/schema-contract.ts';

export function Regelavvikelser({ kontroll, onOpen, intentional = new Set<string>(), onIntent, disabled = false }: { kontroll: SchemaKontroll | null; onOpen?: () => void;
  intentional?: Set<string>; onIntent?: (violation: SchemaViolation, on: boolean) => void; disabled?: boolean }) {
  const id = useId();
  if (!kontroll) return null;
  return <div className="schema-list"><div className="flex flex-wrap items-center justify-between gap-2"><h2>Regelavvikelser ({kontroll.total})</h2><OppnaFonster onOpen={onOpen} label="Regelavvikelser"/></div>
    {kontroll.total === 0 ? <p>Inga regler bryts av schemat som det ligger nu.</p> : <>
      <p className="schema-note">Schemat som det ligger nu bryter mot reglerna nedan. Passen är märkta i schemat. Flytta ett pass eller ångra för att rätta.</p>
      <p className="schema-note">En medveten krock är fortfarande en regelavvikelse. Markeringen godkänner inte schemat; avvikelsen måste rättas före publicering.</p>
      <ul>{kontroll.violations.map((v, i) => <li key={avvikelseNyckel(v)} className="flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1">{v.message}</span>
        {intentional.has(avvikelseNyckel(v)) && <span className="status-badge warning">Medveten krock · regelavvikelse kvar</span>}
        {onIntent && medvetenKrock(v) && <span className="flex items-center gap-2"><Checkbox id={`${id}-${i}`} checked={intentional.has(avvikelseNyckel(v))} disabled={disabled} onCheckedChange={on => onIntent(v, on === true)}/><label htmlFor={`${id}-${i}`}>Behåll som medveten krock</label></span>}
      </li>)}</ul>
      {kontroll.total > kontroll.violations.length && <p className="schema-note">Visar {kontroll.violations.length} av {kontroll.total}.</p>}</>}</div>;
}

export function Forklaring({ diagnoses }: { diagnoses: SchemaForslag['diagnoses'] }) {
  if (diagnoses.length === 0) return null;
  return <div className="schema-list"><h2>Schemamotorns förklaring</h2>
    <ul>{diagnoses.map((x, i) => <li key={i}>{x.message}{x.proof && ' (Bevisat: det går inte med det här underlaget.)'}</li>)}</ul></div>;
}
