export type SchoolAddress = {
  street: string;
  postalCode: string;
  locality: string;
  type?: string;
};

/** Prefer visiting address regardless of upstream array order. */
export function registryAddress(addresses: unknown): SchoolAddress | undefined {
  if (!Array.isArray(addresses)) return undefined;
  const rows = addresses.filter(
    (a): a is Record<string, unknown> => !!a && typeof a === 'object',
  );
  const row =
    rows.find((a) => a.type === 'BESOKSADRESS') ??
    rows.find((a) => a.type === 'POSTADRESS') ??
    rows[0];
  if (!row) return undefined;
  const fields =
    row.address && typeof row.address === 'object'
      ? (row.address as Record<string, unknown>)
      : row;
  const text = (key: string) =>
    typeof fields[key] === 'string' ? (fields[key] as string) : '';
  const address = {
    street: text('streetAddress'),
    postalCode: text('postalCode'),
    locality: text('locality'),
    type: typeof row.type === 'string' ? row.type : undefined,
  };
  return address.street || address.postalCode || address.locality
    ? address
    : undefined;
}
export function addressText(address?: SchoolAddress) {
  return address
    ? [
        address.street,
        [address.postalCode, address.locality].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ')
    : 'Adress saknas i registret';
}
