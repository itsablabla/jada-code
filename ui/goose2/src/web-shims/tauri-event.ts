/**
 * Shim for @tauri-apps/api/event — routes through the global event bus.
 */

import { on } from "./event-bus";

export type UnlistenFn = () => void;

export interface Event<T> {
  payload: T;
}

export async function listen<T>(
  eventName: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  return on<T>(eventName, handler);
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {
  // Not needed for web — outbound events go via HTTP
}
