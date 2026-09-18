import { messageText, reduceEpochHeader } from './session-channel.ts';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public correlationId: string | null,
  ) {
    super(messageText(code));
    this.name = 'ApiError';
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

type ErrorBody = { code?: unknown; correlationId?: unknown };

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const requestGeneration = generation;
  const requestEpoch = knownEpoch;
  pending.add(controller);
  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (requestEpoch !== null) headers.set('X-Context-Epoch', String(requestEpoch));
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

    const next = reduceEpochHeader(knownEpoch, response.headers.get('X-Context-Epoch'));
    const deliberateContextSwitch = method === 'POST' && path === '/api/context' && response.ok;
    if (next.epoch !== knownEpoch) {
      knownEpoch = next.epoch;
      invalidatePending(controller);
    }
    if (next.changed && next.epoch !== null && !deliberateContextSwitch) {
      for (const listener of epochListeners) listener(next.epoch);
    }

    const parsed = (await response.json().catch(() => ({}))) as T & ErrorBody;
    if (!response.ok) {
      const code = typeof parsed.code === 'string' ? parsed.code : 'bad_request';
      const correlationId =
        typeof parsed.correlationId === 'string' ? parsed.correlationId : response.headers.get('X-Correlation-Id');
      if (response.status === 401) invalidatePending(controller);
      if (
        code === 'membership_blocked' ||
        code === 'assignment_ended' ||
        code === 'assignment_expired' ||
        code === 'context_changed'
      ) {
        notifyLock(knownEpoch ?? requestEpoch ?? 0);
      }
      throw new ApiError(code, response.status, correlationId);
    }

    // Ett svar från en tidigare kontext får aldrig nå komponenternas state.
    if (!deliberateContextSwitch && (requestGeneration !== generation || requestEpoch !== knownEpoch)) {
      throw new DOMException('Begäran tillhör en tidigare kontext.', 'AbortError');
    }
    return parsed;
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
};
