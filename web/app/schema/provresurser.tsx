'use client';

import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import type { NationellaProvUnderlag, NationellProvbokning } from '@/lib/nationella-prov.ts';

type Resurser = Pick<NationellaProvUnderlag, 'salar' | 'vakter'>;
type Resursval = Pick<NationellProvbokning, 'salId' | 'vakter'>;

export function Provresursstatus({ val, salar, vakter }: Resurser & { val: Resursval }) {
  return <>
    <p>{val.salId === null ? 'Sal föreslås i Schema' : salar.find(sal => sal.id === val.salId)?.name ?? 'Vald sal saknas i underlaget'}</p>
    <p className="text-muted-foreground">{val.vakter.length === 0 ? 'Provvakter föreslås i Schema'
      : val.vakter.map(ref => vakter.find(vakt => vakt.ref === ref)?.name ?? 'Vald provvakt visas inte i underlaget').join(', ')}</p>
  </>;
}

type FaltProps = Resurser & {
  sparat?: Resursval | null;
  valdaVakter: string[];
  disabled?: boolean;
  fokus?: 'sal' | 'provvakt';
  onVakt: (ref: string, checked: boolean) => void;
};

export function Provresursfalt({ sparat, salar, vakter, valdaVakter, disabled, fokus, onVakt }: FaltProps) {
  const id = useId();
  const tidigareVakter = valdaVakter.filter(ref => !vakter.some(vakt => vakt.ref === ref))
    .map(ref => ({ ref, name: 'Tidigare vald provvakt saknas' }));

  return <div className="min-w-0 space-y-2">
    <p className="text-sm text-muted-foreground">Schema föreslår sal och provvakter. Öppna alternativen om du behöver låsa en resurs.</p>
    <details open={Boolean(fokus || sparat?.salId || sparat?.vakter.length)} className="min-w-0 rounded-md border border-border px-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring">Ange sal eller provvakter</summary>
      <div className="grid min-w-0 gap-3 pb-3 sm:grid-cols-[1fr_2fr]">
        <Field>
          <FieldLabel htmlFor={`${id}-sal`}>Lås sal</FieldLabel>
          <NativeSelect className="min-w-0 w-full [&_select]:min-h-11" name="sal" id={`${id}-sal`} defaultValue={sparat?.salId ?? ''}
            data-prov-resurs="sal" disabled={disabled}>
            <option value="">Föreslå sal i Schema</option>
            {sparat?.salId && !salar.some(sal => sal.id === sparat.salId) && <option value={sparat.salId}>Tidigare vald sal saknas</option>}
            {salar.map(sal => <option key={sal.id} value={sal.id}>{sal.name}</option>)}
          </NativeSelect>
          {salar.length === 0 && <FieldDescription>Skolans salregister har inga valbara salar.</FieldDescription>}
        </Field>
        <fieldset className="min-w-0 rounded-md border border-border px-3 pb-2 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring"
          data-prov-resurs="provvakt" tabIndex={fokus === 'provvakt' ? -1 : undefined}>
          <FieldLegend variant="label" className="px-1">Lås provvakter</FieldLegend>
          <div className="flex max-h-32 flex-wrap items-center gap-x-4 overflow-y-auto">
            {[...vakter, ...tidigareVakter].map(vakt => <label key={vakt.ref} className="inline-flex min-h-11 min-w-0 items-center gap-2 break-words">
              <Checkbox disabled={disabled} checked={valdaVakter.includes(vakt.ref)} onCheckedChange={checked => onVakt(vakt.ref, checked)}/>
              {vakt.name}
            </label>)}
            {vakter.length === 0 && tidigareVakter.length === 0 && <p className="text-sm text-muted-foreground">Inga provvakter finns i underlaget.</p>}
          </div>
        </fieldset>
      </div>
    </details>
  </div>;
}
