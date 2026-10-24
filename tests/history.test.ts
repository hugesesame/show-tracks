import { describe, expect, it } from 'vitest';
import { History } from '../src/app/history';

describe('History', () => {
  it('goes back and forward through edits', () => {
    const h = new History<string>();
    h.record('a', 0);
    h.record('b', 1000);
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeNull();
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBeNull();
  });

  it('undoes quick successive edits, like a drag, as one step', () => {
    const h = new History<string>();
    h.record('a', 0);
    h.record('a1', 100);
    h.record('a2', 200);
    expect(h.undo('a3')).toBe('a');
    expect(h.undo('a')).toBeNull();
  });

  it('skips states equal to the current one', () => {
    const h = new History<string>();
    h.record('a', 0);
    h.record('b', 1000);
    expect(h.undo('b')).toBe('a');
  });

  it('keeps at most 100 steps', () => {
    const h = new History<number>();
    for (let i = 0; i < 150; i++) h.record(i, i * 1000);
    let steps = 0;
    let current = 150;
    for (let s = h.undo(current); s !== null; s = h.undo(current)) {
      current = s;
      steps++;
    }
    expect(steps).toBe(100);
    expect(current).toBe(50);
  });
});
