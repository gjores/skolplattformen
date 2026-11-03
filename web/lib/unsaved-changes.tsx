'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type UnsavedRegistry = {
  dirtyIds: ReadonlySet<string>;
  setDirty: (id: string, dirty: boolean) => void;
};

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

const DISCARD_REQUEST: ConfirmRequest = {
  title: 'Osparade ändringar',
  description: 'Du har osparade ändringar. Vill du lämna dem?',
  confirmLabel: 'Lämna ändringarna',
  cancelLabel: 'Stanna kvar',
};

const UnsavedContext = createContext<UnsavedRegistry | null>(null);
const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null);

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

  const [shown, setShown] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState(false);
  const asked = useRef<{ request: ConfirmRequest; answer: (value: boolean) => void } | null>(null);
  const discardAccepted = useRef(false);
  const settle = useCallback((value: boolean) => {
    const current = asked.current;
    if (!current) return;
    asked.current = null;
    setOpen(false);
    // Ett ja gäller hela handlingen: kedjor där nästa steg också vaktar (t.ex. lämna vyn
    // och sedan skalets navigering) frågar en gång. Fortsättningarna körs före tidtagaren.
    if (value && current.request === DISCARD_REQUEST) {
      discardAccepted.current = true;
      window.setTimeout(() => { discardAccepted.current = false; });
    }
    current.answer(value);
  }, []);
  // Bara en fråga åt gången. En fråga som kommer under tiden (t.ex. bakåtknappen
  // medan dialogen är öppen) får nej, så att den öppna frågan står kvar.
  const requestConfirm = useCallback((request: ConfirmRequest) => {
    if (request === DISCARD_REQUEST && discardAccepted.current) return Promise.resolve(true);
    if (asked.current) return Promise.resolve(false);
    return new Promise<boolean>((answer) => {
      asked.current = { request, answer };
      setShown(request);
      setOpen(true);
    });
  }, []);

  // Det osparade finns inte längre (t.ex. låst session), så frågan har inget svar att ge.
  useEffect(() => {
    if (dirtyIds.size === 0 && asked.current?.request === DISCARD_REQUEST) settle(false);
  }, [dirtyIds, settle]);
  useEffect(() => () => settle(false), [settle]);
  // Esc gäller frågan, inte en öppen dialog under den. Dialogerna lyssnar var för sig på dokumentet.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      settle(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, settle]);

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
  return (
    <UnsavedContext.Provider value={value}>
      <ConfirmContext.Provider value={requestConfirm}>
        {children}
        <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{shown?.title}</AlertDialogTitle>
              <AlertDialogDescription>{shown?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-(--control-height)">{shown?.cancelLabel}</AlertDialogCancel>
              <AlertDialogAction className="min-h-(--control-height)" variant="destructive" onClick={() => settle(true)}>{shown?.confirmLabel}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ConfirmContext.Provider>
    </UnsavedContext.Provider>
  );
}

function useRegistry(): UnsavedRegistry {
  const registry = useContext(UnsavedContext);
  if (!registry) throw new Error('useUnsavedChanges kräver UnsavedChangesProvider.');
  return registry;
}

export function useUnsavedChanges(id: string, dirty: boolean): void {
  const { setDirty } = useRegistry();
  // Registreringen måste följa samma commit som skrivstatusen. Ett klick som
  // lämnar en rad får annars läsa föregående spärr innan en passiv effekt körts.
  useLayoutEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [dirty, id, setDirty]);
}

export function useHasUnsaved(prefix?:string): boolean {
  const ids=useRegistry().dirtyIds;
  return prefix?[...ids].some(id=>id.startsWith(prefix)):ids.size>0;
}

export function useRequestConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const requestConfirm = useContext(ConfirmContext);
  if (!requestConfirm) throw new Error('useRequestConfirm kräver UnsavedChangesProvider.');
  return requestConfirm;
}

export function useRequestDiscard(): () => Promise<boolean> {
  const requestConfirm = useRequestConfirm();
  return useCallback(() => requestConfirm(DISCARD_REQUEST), [requestConfirm]);
}
