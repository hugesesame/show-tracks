import type { Note } from '../model/notes';
import { MtcScheduler } from './mtcScheduler';
import type { Fps } from './timecode';

export type MtcStatus = 'off' | 'on' | 'denied' | 'unsupported';

export type MidiOutputInfo = { id: string; name: string };

const TICK_MS = 10;
/** Cue notes are triggers: Note Off follows this soon after Note On. */
const NOTE_LENGTH_MS = 100;

/**
 * A worker timer keeps ticking at full rate even when the main window is in
 * the background, where main-thread timers are throttled.
 */
function startWorkerTicker(onTick: () => void): void {
  const source = `setInterval(() => postMessage(0), ${TICK_MS});`;
  const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  worker.onmessage = onTick;
}

/**
 * Sends the page time as MTC, and the cues' MIDI Notes, to the selected Web MIDI
 * output, and hands what one MIDI input plays to the remote.
 */
export class MtcOutput {
  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private outputId: string | null = null;
  private input: MIDIInput | null = null;
  private inputId: string | null = null;
  private onInput: (data: Uint8Array) => void = () => {};
  private readonly scheduler = new MtcScheduler((data, at) => this.output?.send(data, at));
  private readonly events = new EventTarget();
  private _status: MtcStatus = 'off';
  private readonly tickListeners: (() => void)[] = [];

  constructor(private readonly getTime: () => { time: number; playing: boolean }) {}

  get status(): MtcStatus {
    return this._status;
  }

  onChange(listener: () => void): void {
    this.events.addEventListener('change', listener);
  }

  async init(): Promise<void> {
    startWorkerTicker(() => {
      const { time, playing } = this.getTime();
      if (this.output) this.scheduler.tick(time, playing, performance.now());
      this.tickListeners.forEach((l) => l());
    });
    if (!navigator.requestMIDIAccess) {
      this.setStatus('unsupported');
      return;
    }
    try {
      // SysEx is needed for Full Frame messages.
      this.access = await navigator.requestMIDIAccess({ sysex: true });
      this.access.onstatechange = () => {
        this.selectOutput(this.outputId);
        this.attachInput();
      };
      this.selectOutput(this.outputId);
    } catch {
      this.setStatus('denied');
    }
  }

  inputs(): MidiOutputInfo[] {
    if (!this.access) return [];
    return Array.from(this.access.inputs.values(), (i) => ({ id: i.id, name: i.name ?? i.id }));
  }

  /** Listens to one MIDI input (null for none), also after it is unplugged and connected again. */
  listen(id: string | null, onMessage: (data: Uint8Array) => void): void {
    this.inputId = id;
    this.onInput = onMessage;
    this.attachInput();
  }

  private attachInput(): void {
    if (this.input) this.input.onmidimessage = null;
    const input = this.inputId ? this.access?.inputs.get(this.inputId) : undefined;
    this.input = input && input.state === 'connected' ? input : null;
    if (this.input) this.input.onmidimessage = (e) => e.data && this.onInput(e.data);
  }

  outputs(): MidiOutputInfo[] {
    if (!this.access) return [];
    return Array.from(this.access.outputs.values(), (o) => ({ id: o.id, name: o.name ?? o.id }));
  }

  selectOutput(id: string | null): void {
    this.outputId = id;
    if (this._status === 'denied' || this._status === 'unsupported') return;
    const output = id ? this.access?.outputs.get(id) : undefined;
    this.output = output && output.state === 'connected' ? output : null;
    this.setStatus(this.output ? 'on' : 'off');
  }

  configure(fps: Fps, offsetSeconds: number): void {
    this.scheduler.configure(fps, offsetSeconds);
  }

  /** Runs every 10 ms, also while the window is in the background. */
  onTick(listener: () => void): void {
    this.tickListeners.push(listener);
  }

  sendNote({ channel, note, velocity }: Note): void {
    if (!this.output) return;
    const ch = channel - 1;
    this.output.send([0x90 | ch, note, velocity]);
    this.output.send([0x80 | ch, note, 0], performance.now() + NOTE_LENGTH_MS);
  }

  /** Call on seek and stop. */
  locate(time: number): void {
    if (this.output) this.scheduler.locate(time, performance.now());
  }

  /** Also fires when only the output list changed. */
  private setStatus(status: MtcStatus): void {
    this._status = status;
    this.events.dispatchEvent(new Event('change'));
  }
}
