'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Disclosure med vanliga knappar: native tangentbordsstöd, inga nya behörighetsregler. */
export function TjanstActionMenu({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !ref.current?.open) return;
      ref.current.open = false; ref.current.querySelector('summary')?.focus(); event.preventDefault();
    };
    const choose = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (button && !button.disabled && ref.current?.contains(button)) ref.current.open = false;
    };
    const root = ref.current; root?.addEventListener('click', choose);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { root?.removeEventListener('click', choose); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  return <details ref={ref} className={`tjanst-action-menu ${className}`} onToggle={event => {
    if (!event.currentTarget.open) return;
    for (const other of document.querySelectorAll<HTMLDetailsElement>('details.tjanst-action-menu[open]')) if (other !== event.currentTarget) other.open = false;
  }}>
    <summary>{label}<ChevronDown size={16} aria-hidden="true"/></summary>
    <fieldset className="tjanst-action-panel"><legend className="sr-only">{label}</legend>{children}</fieldset>
  </details>;
}

/** Återgå till menyns kontroll när dialogen stängs, även om dess åtgärd är dold då. */
export function actionOrigin(button: HTMLElement): HTMLElement {
  return button.closest('details.tjanst-action-menu')?.querySelector<HTMLElement>('summary') ?? button;
}
