import type { MidiTrigger, RemoteAction } from '../model/types';

const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
/** A CC counts as pressed from this value up, as a pedal or switch going down. */
const CC_ON = 64;

/** A press in a MIDI message: a Note On, or a CC crossing up to on. */
type Press = MidiTrigger;

/**
 * Turns incoming MIDI into presses. CCs fire once as they cross into "on", so a
 * pedal held down or a fader sweeping up does not fire again and again.
 */
export class MidiPresses {
  private readonly ccValues = new Map<string, number>();

  read(data: Uint8Array): Press | null {
    if (data.length < 3) return null;
    const kind = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    if (kind === NOTE_ON && data[2] > 0) return { type: 'note', channel, number: data[1] };
    if (kind !== CONTROL_CHANGE) return null;
    const key = `${channel}:${data[1]}`;
    const before = this.ccValues.get(key) ?? 0;
    this.ccValues.set(key, data[2]);
    return before < CC_ON && data[2] >= CC_ON ? { type: 'cc', channel, number: data[1] } : null;
  }
}

/** The action a press is assigned to, if any. */
export function remoteAction(
  press: Press,
  remote: Partial<Record<RemoteAction, MidiTrigger>>,
): RemoteAction | null {
  for (const [action, t] of Object.entries(remote) as [RemoteAction, MidiTrigger][]) {
    if (t.type === press.type && t.channel === press.channel && t.number === press.number) return action;
  }
  return null;
}

/** How a trigger reads in Settings, e.g. "Note 60 · ch 1" or "CC 64 · ch 1". */
export function triggerLabel(t: MidiTrigger): string {
  return `${t.type === 'note' ? 'Note' : 'CC'} ${t.number} · ch ${t.channel}`;
}
