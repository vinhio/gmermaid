/**
 * History — undo/redo manager based on the command pattern.
 *
 * Each entry is a command object with `do()` / `undo()` methods. The Diagram
 * pushes commands when nodes are moved or labels edited; calling undo/redo
 * replays the relevant method and re-renders. A cursor walks the stack so
 * that redo remains available after an undo (until a new push truncates it).
 */
export class History {
  #stack  = [];   // ordered list of command objects { do, undo }
  #cursor = -1;   // index of the last applied command (-1 = nothing applied)
  #max;           // maximum retained commands; older ones are evicted
  #bus;           // EventBus used to broadcast 'historyChange'

  /**
   * @param {import('./events.js').EventBus} bus - Bus for 'historyChange' events.
   * @param {number} [max=50] - Maximum number of commands to retain.
   */
  constructor(bus, max = 50) {
    this.#bus = bus;
    this.#max = max;
  }

  /**
   * Record a new command, discarding any redo history beyond the cursor.
   * @param {{ do: () => void, undo: () => void }} command - Reversible action.
   * @returns {void}
   */
  push(command) {
    // Drop any commands ahead of the cursor (the abandoned redo branch)
    this.#stack  = this.#stack.slice(0, this.#cursor + 1);
    this.#stack.push(command);
    // If the stack overflows, evict the oldest entry (cursor stays put);
    // otherwise advance the cursor onto the freshly pushed command.
    if (this.#stack.length > this.#max) this.#stack.shift();
    else this.#cursor++;
    this.#emit();
  }

  /**
   * Reverse the most recently applied command and step the cursor back.
   * @returns {boolean} True if a command was undone, false if at the bottom.
   */
  undo() {
    if (this.#cursor < 0) return false;
    this.#stack[this.#cursor].undo();
    this.#cursor--;
    this.#emit();
    return true;
  }

  /**
   * Re-apply the next command ahead of the cursor and step it forward.
   * @returns {boolean} True if a command was redone, false if at the top.
   */
  redo() {
    if (this.#cursor >= this.#stack.length - 1) return false;
    this.#cursor++;
    this.#stack[this.#cursor].do();
    this.#emit();
    return true;
  }

  /** @returns {boolean} Whether an undo is currently possible. */
  get canUndo() { return this.#cursor >= 0; }
  /** @returns {boolean} Whether a redo is currently possible. */
  get canRedo()  { return this.#cursor < this.#stack.length - 1; }

  /**
   * Clear all history and reset the cursor.
   * @returns {void}
   */
  clear() {
    this.#stack  = [];
    this.#cursor = -1;
    this.#emit();
  }

  /**
   * Broadcast the current undo/redo availability on the bus.
   * @returns {void}
   */
  #emit() {
    this.#bus?.emit('historyChange', { canUndo: this.canUndo, canRedo: this.canRedo });
  }
}
