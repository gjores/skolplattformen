import { parseConflictDetails, type ConflictDetails } from './pupil-register-model.ts';
import { messageText, reduceEpochHeader } from './session-channel.ts';

export class ApiError extends Error {
  public code: string;
  public status: number;
  public correlationId: string | null;
  public details: ConflictDetails | null;
  constructor(
    code: string,
    status: number,
    correlationId: string | null,
    details: ConflictDetails | null = null,
  ) {
    super(messageText(code));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.correlationId = correlationId;
    this.details = details;
  }
}

let knownEpoch: number | null = null;
let generation = 0;
const epochListeners = new Set<(epoch: number) => void>();
const pending = new Set<AbortController>();

function invalidatePending(except?: AbortController): void {
  generation += 1;
  for (const controller of pending) {
    if (controller !== except) controller.abort();
  }
}

function notifyLock(epoch: number): void {
  invalidatePending();
  for (const listener of epochListeners) listener(epoch);
}

export function onEpochChange(listener: (epoch: number) => void): () => void {
  epochListeners.add(listener);
  return () => epochListeners.delete(listener);
}

export function setKnownEpoch(epoch: number | null): void {
  if (knownEpoch !== epoch) invalidatePending();
  knownEpoch = epoch;
}

type ErrorBody = { code?: unknown; correlationId?: unknown; details?: unknown };
type Download = { blob: Blob; filename: string | null };

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  download = false,
): Promise<T> {
  const controller = new AbortController();
  let acceptedGeneration = generation;
  const requestEpoch = knownEpoch;
  let acceptedEpoch = requestEpoch;
  const assertCurrent = () => {
    if (controller.signal.aborted || acceptedGeneration !== generation || acceptedEpoch !== knownEpoch) {
      throw new DOMException('Begäran tillhör en tidigare kontext.', 'AbortError');
    }
  };
  pending.add(controller);
  try {
    const headers = new Headers({ Accept: download ? 'text/csv' : 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (requestEpoch !== null) headers.set('X-Context-Epoch', String(requestEpoch));
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

    // Kontrollera före headers: även en transport som ignorerar abort får inte
    // återställa epoch eller avisera om en gammal begäran.
    assertCurrent();
    const next = reduceEpochHeader(knownEpoch, response.headers.get('X-Context-Epoch'));
    const deliberateContextSwitch = method === 'POST' && path === '/api/context' && response.ok;
    const unexpectedEpoch = next.changed && !deliberateContextSwitch;
    if (next.epoch !== knownEpoch) {
      knownEpoch = next.epoch;
      invalidatePending(controller);
      acceptedGeneration = generation;
      acceptedEpoch = next.epoch;
    }
    if (unexpectedEpoch && next.epoch !== null) {
      for (const listener of epochListeners) listener(next.epoch);
    }

    const parsed: unknown = download && response.ok
      ? await response.blob()
      : await response.json().catch(() => ({}));
    // Kroppsläsning är också asynkron. Detta gäller såväl JSON/fel som Blob,
    // inklusive ett kontextbyte som avbryts av ännu ett byte eller utloggning.
    assertCurrent();
    if (!response.ok) {
      const error = parsed && typeof parsed === 'object' ? parsed as ErrorBody : {};
      const code = typeof error.code === 'string' ? error.code : 'bad_request';
      const correlationId = typeof error.correlationId === 'string'
        ? error.correlationId : response.headers.get('X-Correlation-Id');
      if (response.status === 401) invalidatePending(controller);
      if (code === 'membership_blocked' || code === 'assignment_ended' ||
          code === 'assignment_expired' || code === 'context_changed') {
        if (!unexpectedEpoch) notifyLock(knownEpoch ?? requestEpoch ?? 0);
      }
      // Tekniska fel och svar från ändrad serverkontext bär aldrig elevfält.
      const details = !unexpectedEpoch && code === 'conflict' && response.status === 409
        ? parseConflictDetails(error.details) : null;
      throw new ApiError(code, response.status, correlationId, details);
    }
    if (unexpectedEpoch) {
      throw new DOMException('Begäran tillhör en tidigare kontext.', 'AbortError');
    }
    if (download) {
      const disposition = response.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="([^"]+)"/u)?.[1] ?? null;
      return { blob: parsed as Blob, filename } as T;
    }
    return parsed as T;
  } finally {
    pending.delete(controller);
  }
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, body);
  },
  download(path: string): Promise<Download> {
    return request<Download>('GET', path, undefined, true);
  },
  downloadPost(path: string, body: unknown): Promise<Download> {
    return request<Download>('POST', path, body, true);
  },
};
