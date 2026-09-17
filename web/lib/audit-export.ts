export const CSV_HEADER = [
  'tid',
  'korrelation',
  'källa',
  'aktör_utfärdare',
  'aktör_subjekt',
  'uppdrag',
  'åtgärd',
  'objekttyp',
  'objekt',
  'resultat',
  'detaljer',
] as const;

const FORMULA_PREFIX = /^[=+\-@\t\r]/u;

export function csvCell(value: unknown): string {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = String(value);
  } else if (value instanceof Date) text = value.toISOString();
  else if (value !== null && value !== undefined) text = JSON.stringify(value) ?? '';
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[;"\r\n]/u.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(';');
}
