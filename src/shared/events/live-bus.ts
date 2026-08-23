// Feature #12: Lightweight in-process live event bus for dashboard SSE.
export interface LiveEvent {
  type: string;
  payload: unknown;
  timestamp: string;
}

const subscribers = new Set<(event: LiveEvent) => void>();

export function subscribe(fn: (event: LiveEvent) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function publishLiveEvent(type: string, payload: unknown): void {
  const event: LiveEvent = { type, payload, timestamp: new Date().toISOString() };
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch {
      // ignore broken subscriber
    }
  }
}
