import { describe, expect, it } from 'vitest';
import { MidiPresses, remoteAction, triggerLabel } from '../src/engine/midiRemote';

const msg = (...bytes: number[]) => new Uint8Array(bytes);

describe('MidiPresses', () => {
  it('reads Note On as a press, and ignores Note Off and a velocity of 0', () => {
    const p = new MidiPresses();
    expect(p.read(msg(0x90, 60, 100))).toEqual({ type: 'note', channel: 1, number: 60 });
    expect(p.read(msg(0x80, 60, 0))).toBeNull();
    expect(p.read(msg(0x93, 61, 0))).toBeNull();
  });

  it('fires a CC once as it crosses into on, not again while held or swept', () => {
    const p = new MidiPresses();
    expect(p.read(msg(0xb1, 64, 127))).toEqual({ type: 'cc', channel: 2, number: 64 });
    expect(p.read(msg(0xb1, 64, 127))).toBeNull();
    expect(p.read(msg(0xb1, 64, 100))).toBeNull();
    expect(p.read(msg(0xb1, 64, 0))).toBeNull();
    expect(p.read(msg(0xb1, 64, 90))).toEqual({ type: 'cc', channel: 2, number: 64 });
  });
});

describe('remoteAction', () => {
  const remote = { go: { type: 'cc' as const, channel: 1, number: 64 }, nextCue: { type: 'note' as const, channel: 1, number: 62 } };

  it('finds the action a press is assigned to', () => {
    expect(remoteAction({ type: 'cc', channel: 1, number: 64 }, remote)).toBe('go');
    expect(remoteAction({ type: 'note', channel: 1, number: 62 }, remote)).toBe('nextCue');
    expect(remoteAction({ type: 'note', channel: 2, number: 62 }, remote)).toBeNull();
    expect(remoteAction({ type: 'note', channel: 1, number: 64 }, remote)).toBeNull();
  });

  it('labels triggers for Settings', () => {
    expect(triggerLabel(remote.go)).toBe('CC 64 · ch 1');
    expect(triggerLabel(remote.nextCue)).toBe('Note 62 · ch 1');
  });
});
