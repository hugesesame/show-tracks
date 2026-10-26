import type { FaderKey, MidiControl, MidiTrigger } from '../model/types';

const CONTROL_CHANGE = 0xb0;
const PITCH_BEND = 0xe0;
/** Within this of the app's level, a hardware fader is taken as already there. */
const PICKUP_WINDOW = 0.02;

/** A fader position in a MIDI message: a CC (0..127) or a Pitch Bend (0..16383, as Mackie Control faders send). */
export function readFaderMove(data: Uint8Array): { control: MidiControl; value: number } | null {
  if (data.length < 3) return null;
  const kind = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  if (kind === CONTROL_CHANGE) return { control: { type: 'cc', channel, number: data[1] }, value: data[2] / 127 };
  if (kind === PITCH_BEND) return { control: { type: 'pitchBend', channel, number: 0 }, value: (data[1] | (data[2] << 7)) / 16383 };
  return null;
}

/** The same CC (or Pitch Bend) on the same channel; also compares a remote's note or CC with a fader's control. */
export const sameControl = (a: MidiControl | MidiTrigger, b: MidiControl | MidiTrigger) =>
  a.type === b.type && a.channel === b.channel && a.number === b.number;

/** The fader a control is assigned to, if any. */
export function faderFor(control: MidiControl, faders: Partial<Record<FaderKey, MidiControl>>): FaderKey | null {
  for (const [key, c] of Object.entries(faders) as [FaderKey, MidiControl][]) {
    if (sameControl(c, control)) return key;
  }
  return null;
}

/** How a control reads in Settings, e.g. "CC 7 · ch 1" or "Pitch Bend · ch 1". */
export function controlLabel(c: MidiControl): string {
  return c.type === 'cc' ? `CC ${c.number} · ch ${c.channel}` : `Pitch Bend · ch ${c.channel}`;
}

/**
 * Pickup (soft takeover): a hardware fader only takes over once it reaches the
 * app's level, so the sound never jumps when the two disagree — after a page
 * change, or after the fader on screen was moved.
 */
export class FaderPickup {
  /** Per fader: where the hardware last was, and the level it last set (null until it has taken over). */
  private readonly state = new Map<FaderKey, { last: number; set: number | null }>();

  /** The level to set for a hardware move, or null while it has not reached the app's level yet. */
  move(key: FaderKey, value: number, current: number): number | null {
    const state = this.state.get(key);
    // Something else moved the level since this fader set it: pick it up again.
    if (state?.set != null && Math.abs(current - state.set) > 0.008) state.set = null;
    const held = state?.set != null;
    const reached =
      Math.abs(value - current) <= PICKUP_WINDOW ||
      (state !== undefined && Math.sign(state.last - current) !== Math.sign(value - current));
    if (!held && !reached) {
      this.state.set(key, { last: value, set: null });
      return null;
    }
    this.state.set(key, { last: value, set: value });
    return value;
  }
}
