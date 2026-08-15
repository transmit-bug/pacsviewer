/**
 * Viewport Registry — a small module-level registry mapping a Cornerstone
 * viewportId to its DOM element, with change notifications.
 *
 * CornerstoneViewport registers its element on mount and unregisters on
 * unmount. Side components (layer visibility sync, filter pipeline, measurement
 * sync, ai_result overlay) that need to reach into Cornerstone annotation state
 * / rendered pixels use this registry instead of being passed the element
 * through props, keeping wiring additive.
 *
 * The subscribe mechanism matters because React runs a parent component's
 * effects before a newly-mounted child's effects in some cases (StrictMode
 * double-render ordering). A hook that needs the element cannot assume it is
 * registered when its own effect runs — it subscribes and (re)initializes when
 * the element appears / is replaced.
 */

const registry = new Map<string, HTMLDivElement>();
const listeners = new Map<string, Set<() => void>>();

export function registerViewportElement(viewportId: string, element: HTMLDivElement): void {
  registry.set(viewportId, element);
  listeners.get(viewportId)?.forEach((cb) => cb());
}

export function unregisterViewportElement(viewportId: string): void {
  registry.delete(viewportId);
  listeners.get(viewportId)?.forEach((cb) => cb());
}

export function getViewportElement(viewportId: string): HTMLDivElement | undefined {
  return registry.get(viewportId);
}

/** Subscribe to (re)registrations of a viewport element. Returns an unsubscribe fn. */
export function subscribeViewportElement(viewportId: string, callback: () => void): () => void {
  let set = listeners.get(viewportId);
  if (!set) {
    set = new Set();
    listeners.set(viewportId, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) listeners.delete(viewportId);
  };
}

/** CornerstoneViewport's default viewport id. */
export const MAIN_VIEWPORT_ID = 'viewport-main';
