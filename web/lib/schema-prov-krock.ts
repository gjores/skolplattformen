type Tid = { startMin: number; slutMin: number };
type Pass = Tid & { elever: ReadonlySet<string>; salId: string | null; lararRefs: readonly string[] };
type Prov = Tid & { elever: ReadonlySet<string>; salId: string | null; vakter: readonly string[] };

export function provTidOverlappar(a: Tid, b: Tid): boolean {
  return a.startMin < b.slutMin && b.startMin < a.slutMin;
}

export function provHarGemensammaElever(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const pupil of a) if (b.has(pupil)) return true;
  return false;
}

/** Prov tar den faktiska lektionstiden. Raster och marginaler prövas när resurser och ersättningstid väljs. */
export function provKrockarMedPass(pass: Pass, prov: Prov): boolean {
  return provTidOverlappar(pass, prov) && (
    provHarGemensammaElever(pass.elever, prov.elever)
    || pass.salId !== null && pass.salId === prov.salId
    || prov.vakter.some(vakt => pass.lararRefs.includes(vakt))
  );
}
