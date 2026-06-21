/**
 * EventBus — a minimal publish/subscribe hub used to decouple the core
 * modules (Diagram, Interact, History, VirtualRenderer). Components emit
 * named events (e.g. 'nodeMove', 'viewChange', 'historyChange') and other
 * components subscribe to them without holding direct references.
 */
export class EventBus {
  // event name → Set of handler functions
  #handlers = new Map();

  /**
   * Subscribe a handler to an event.
   * @param {string} event - Event name to listen for.
   * @param {(data: any) => void} handler - Callback invoked on each emit.
   * @returns {() => void} Unsubscribe function that removes this handler.
   */
  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove a previously registered handler from an event.
   * @param {string} event - Event name.
   * @param {(data: any) => void} handler - The exact handler to remove.
   * @returns {void}
   */
  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
  }

  /**
   * Synchronously invoke every handler registered for an event.
   * @param {string} event - Event name to dispatch.
   * @param {any} data - Payload passed to each handler.
   * @returns {void}
   */
  emit(event, data) {
    this.#handlers.get(event)?.forEach(h => h(data));
  }

  /**
   * Drop all subscriptions, releasing handler references.
   * @returns {void}
   */
  destroy() {
    this.#handlers.clear();
  }
}
