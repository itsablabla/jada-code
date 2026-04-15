/**
 * Global event bus that replaces Tauri's event system.
 * SSE stream events are dispatched here; UI hooks listen via the same API.
 */

type Callback<T = unknown> = (event: { payload: T }) => void;

const listeners = new Map<string, Set<Callback>>();

export function emit<T = unknown>(eventName: string, payload: T): void {
  const cbs = listeners.get(eventName);
  if (!cbs) return;
  for (const cb of cbs) {
    try {
      cb({ payload });
    } catch (err) {
      console.error(`[event-bus] Error in listener for ${eventName}:`, err);
    }
  }
}

export function on<T = unknown>(
  eventName: string,
  callback: Callback<T>,
): () => void {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  const set = listeners.get(eventName)!;
  set.add(callback as Callback);
  return () => {
    set.delete(callback as Callback);
    if (set.size === 0) listeners.delete(eventName);
  };
}
