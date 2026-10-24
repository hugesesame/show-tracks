/** How many steps Undo can go back. */
const LIMIT = 100;
/** Edits closer together than this (a drag, a slider) undo as one step. */
const MERGE_MS = 500;

/**
 * Undo / redo over immutable states: the state before each edit is kept, and an
 * unchanged state (the same object) is never a step of its own.
 */
export class History<T> {
  private undos: T[] = [];
  private redos: T[] = [];
  private lastEdit = -Infinity;

  /** Call as an edit begins, with the state before it. */
  record(state: T, now: number): void {
    const merged = now - this.lastEdit < MERGE_MS;
    this.lastEdit = now;
    if (merged || this.undos[this.undos.length - 1] === state) return;
    this.undos.push(state);
    if (this.undos.length > LIMIT) this.undos.shift();
  }

  /** A new edit went through, so the undone steps can no longer be redone. */
  clearRedo(): void {
    this.redos = [];
  }

  /** The state to go back to, skipping any that equal the current one; null when there is none. */
  undo(current: T): T | null {
    this.lastEdit = -Infinity;
    while (this.undos.length > 0) {
      const state = this.undos.pop()!;
      if (state === current) continue;
      this.redos.push(current);
      return state;
    }
    return null;
  }

  redo(current: T): T | null {
    this.lastEdit = -Infinity;
    const state = this.redos.pop();
    if (state === undefined) return null;
    this.undos.push(current);
    return state;
  }

  clear(): void {
    this.undos = [];
    this.redos = [];
    this.lastEdit = -Infinity;
  }

  /** Every state kept, so nothing they use is thrown away. */
  states(): T[] {
    return [...this.undos, ...this.redos];
  }
}
