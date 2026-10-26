import { describe, expect, it } from 'vitest';
import { faderFor, FaderPickup, readFaderMove } from '../src/engine/midiFaders';

describe('readFaderMove', () => {
  it('reads a CC as a position from 0 to 1', () => {
    expect(readFaderMove(new Uint8Array([0xb0, 7, 127]))).toEqual({ control: { type: 'cc', channel: 1, number: 7 }, value: 1 });
    expect(readFaderMove(new Uint8Array([0xb2, 7, 0]))?.value).toBe(0);
  });

  it('reads a Pitch Bend, as Mackie Control faders send, with all 14 bits', () => {
    const move = readFaderMove(new Uint8Array([0xe1, 0x7f, 0x7f]));
    expect(move).toEqual({ control: { type: 'pitchBend', channel: 2, number: 0 }, value: 1 });
    expect(readFaderMove(new Uint8Array([0xe0, 0x00, 0x40]))?.value).toBeCloseTo(0.5, 3);
  });

  it('ignores notes', () => {
    expect(readFaderMove(new Uint8Array([0x90, 60, 100]))).toBeNull();
  });
});

describe('faderFor', () => {
  it('finds the fader a control is assigned to', () => {
    const faders = { audio: { type: 'cc' as const, channel: 1, number: 7 }, master: { type: 'pitchBend' as const, channel: 9, number: 0 } };
    expect(faderFor({ type: 'cc', channel: 1, number: 7 }, faders)).toBe('audio');
    expect(faderFor({ type: 'pitchBend', channel: 9, number: 0 }, faders)).toBe('master');
    expect(faderFor({ type: 'cc', channel: 2, number: 7 }, faders)).toBeNull();
  });
});

describe('FaderPickup', () => {
  it('takes over at once when the hardware is already at the level', () => {
    expect(new FaderPickup().move('audio', 0.76, 0.75)).toBe(0.76);
  });

  it('waits until the hardware fader passes the level, then follows it', () => {
    const pickup = new FaderPickup();
    expect(pickup.move('audio', 0.2, 0.75)).toBeNull();
    expect(pickup.move('audio', 0.5, 0.75)).toBeNull();
    // Crossing 0.75 on the way up.
    expect(pickup.move('audio', 0.8, 0.75)).toBe(0.8);
    expect(pickup.move('audio', 0.3, 0.8)).toBe(0.3);
  });

  it('picks up again after the level was changed elsewhere (another page, the fader on screen)', () => {
    const pickup = new FaderPickup();
    expect(pickup.move('audio', 0.5, 0.5)).toBe(0.5);
    // The next page is at 0.9: the hardware at 0.5 must come up to it first.
    expect(pickup.move('audio', 0.55, 0.9)).toBeNull();
    expect(pickup.move('audio', 0.95, 0.9)).toBe(0.95);
  });

  it('keeps each fader separate', () => {
    const pickup = new FaderPickup();
    expect(pickup.move('audio', 0.1, 0.8)).toBeNull();
    expect(pickup.move('master', 1, 1)).toBe(1);
  });
});
