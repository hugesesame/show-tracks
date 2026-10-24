import type { Mixer } from './mixer';

const STORAGE_KEY = 'cue-player-audio-output';

export type OutputDevice = { id: string; name: string };

/**
 * The audio output device, chosen per computer and browser: device ids differ
 * from one computer to the next, so the choice is not part of the project.
 * While the chosen device is unplugged the system default plays, and the
 * sound goes back to the device as soon as it is connected again.
 */
export class AudioOutput {
  private _devices: OutputDevice[] = [];
  /** The device chosen, kept while it is unplugged; null is the system default. */
  private _chosen: string | null = null;
  /** The device the sound goes to now. */
  private applied: string | null = null;
  private _namesShown = false;
  /** Warned that the chosen device is missing, so it is said once, not on every change. */
  private warned = false;
  private readonly events = new EventTarget();

  constructor(
    private readonly mixer: Mixer,
    private readonly warn: (message: string) => void,
  ) {
    try {
      this._chosen = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Starting on the system default is fine.
    }
  }

  /** Chrome can change the output device of the app's sound. */
  get supported(): boolean {
    return 'setSinkId' in AudioContext.prototype && !!navigator.mediaDevices?.enumerateDevices;
  }

  get devices(): OutputDevice[] {
    return this._devices;
  }

  /** The chosen device, or null for the system default. */
  get chosen(): string | null {
    return this._chosen;
  }

  /** The chosen device is not connected, so the system default plays. */
  get missing(): boolean {
    return this._chosen !== null && this.applied !== this._chosen;
  }

  /** Chrome names devices only once the page may use the microphone. */
  get namesShown(): boolean {
    return this._namesShown;
  }

  onChange(listener: () => void): void {
    this.events.addEventListener('change', listener);
  }

  async init(): Promise<void> {
    if (!this.supported) return;
    navigator.mediaDevices.addEventListener('devicechange', () => void this.refresh());
    await this.refresh();
  }

  async choose(id: string | null): Promise<void> {
    this._chosen = id;
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not remembering the choice is fine.
    }
    await this.apply();
  }

  /** Asks for the microphone once, only so that Chrome names the devices; nothing is recorded. */
  async showNames(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      this.warn('Without microphone access, Chrome does not show the device names.');
      return;
    }
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    // "default" and "communications" are aliases of real devices; the system default has its own entry.
    const outputs = all.filter(
      (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications',
    );
    this._namesShown = outputs.some((d) => d.label !== '');
    this._devices = outputs.map((d, i) => ({ id: d.deviceId, name: d.label || `Output ${i + 1}` }));
    await this.apply();
  }

  /** Sends the sound to the chosen device if it is connected, else to the system default. */
  private async apply(): Promise<void> {
    const connected = this._chosen !== null && this._devices.some((d) => d.id === this._chosen);
    let target = connected ? this._chosen : null;
    if (target !== this.applied) {
      try {
        await this.mixer.setOutput(target);
      } catch {
        target = null;
        await this.mixer.setOutput(null).catch(() => {});
      }
      this.applied = target;
    }
    if (this.missing && !this.warned) {
      this.warn('The chosen audio output is not connected. The system default plays until it is.');
    }
    this.warned = this.missing;
    this.events.dispatchEvent(new Event('change'));
  }
}
