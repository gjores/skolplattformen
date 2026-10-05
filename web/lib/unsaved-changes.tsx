'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type UnsavedRegistry = {
  dirtyIds: ReadonlySet<string>;
  setDirty: (id: string, dirty: boolean) => void;
};

const UnsavedContext = createContext<UnsavedRegistry | null>(null);

// Sätts när användaren uttryckligen väljer att lämna sidan (t.ex. verifiering med
// engångskod) så att webbläsarens egen lämna-sidan-fråga inte stoppar valet.
let leavingByChoice = false;

export function leaveWithoutPrompt(): void {
  leavingByChoice = true;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    // Återkomst via webbläsarens bakåtknapp (bfcache) ska åter skydda osparat innehåll.
    const reset = () => { leavingByChoice = false; };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  useEffect(() => {
    if (dirtyIds.size === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingByChoice) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyIds]);

  const value = useMemo(() => ({ dirtyIds, setDirty }), [dirtyIds, setDirty]);
  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

function useRegistry(): UnsavedRegistry {
  const registry = useContext(UnsavedContext);
  if (!registry) throw new Error('useUnsavedChanges kräver UnsavedChangesProvider.');
  return registry;
}

export function useUnsavedChanges(id: string, dirty: boolean): void {
  const { setDirty } = useRegistry();
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [dirty, id, setDirty]);
}

export function useHasUnsaved(prefix?:string): boolean {
  const ids=useRegistry().dirtyIds;
  return prefix?[...ids].some(id=>id.startsWith(prefix)):ids.size>0;
}

export function confirmDiscard(): boolean {
  return window.confirm('Du har osparade ändringar. Vill du lämna dem?');
}
