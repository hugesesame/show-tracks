export type TrackKind = 'audio' | 'video';
/** A track or the Master strip. */
export type StripKind = TrackKind | 'master';
/** The audio track plays on two decks in turn, so one can ring out while the next page starts. */
export type ChannelKey = 'deck0' | 'deck1' | 'video' | 'master';

const METER_FLOOR_DB = -60;
/** Where a fade out ends before cutting to silence: -60 dB, the bottom of the meters. */
const FADE_FLOOR = 0.001;

/** Peak amplitude to a 0..1 meter position on a -60..0 dBFS scale. */
export function meterLevel(peak: number): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}

type Channel = {
  /** The strip's input. */
  gain: GainNode;
  panner: StereoPannerNode;
  analysers: [AnalyserNode, AnalyserNode];
};

/**
 * Routes each media element through volume → pan → stereo meter, then both
 * tracks through the fade-out and duck stages and the Master strip to the speakers.
 * Meters read after the volume and pan, like a DAW channel.
 */
export class Mixer {
  private readonly context = new AudioContext();
  private readonly channels: Record<ChannelKey, Channel>;
  /** Before the Master: fades everything out without moving the Master fader, and shows on its meter. */
  private readonly fader: GainNode;
  /** After the fade-out stage: lowers everything for an announcement, leaving the faders where they are. */
  private readonly duck: GainNode;
  private readonly buffer = new Float32Array(1024);

  constructor(elements: { decks: [HTMLMediaElement, HTMLMediaElement]; video: HTMLMediaElement }) {
    const strip = (output: AudioNode): Channel => {
      // Upmix mono files so both meter bars move.
      const gain = new GainNode(this.context, { channelCount: 2, channelCountMode: 'explicit' });
      const panner = new StereoPannerNode(this.context);
      const splitter = this.context.createChannelSplitter(2);
      const analysers = [0, 1].map(() => new AnalyserNode(this.context, { fftSize: 1024 })) as [
        AnalyserNode,
        AnalyserNode,
      ];
      gain.connect(panner).connect(output);
      panner.connect(splitter);
      analysers.forEach((analyser, i) => splitter.connect(analyser, i));
      return { gain, panner, analysers };
    };
    const master = strip(this.context.destination);
    this.fader = new GainNode(this.context);
    this.duck = new GainNode(this.context);
    this.fader.connect(this.duck).connect(master.gain);
    const track = (element: HTMLMediaElement): Channel => {
      // Levels are set on the gain nodes, so the element itself stays at full volume.
      element.volume = 1;
      element.muted = false;
      const channel = strip(this.fader);
      this.context.createMediaElementSource(element).connect(channel.gain);
      return channel;
    };
    this.channels = {
      deck0: track(elements.decks[0]),
      deck1: track(elements.decks[1]),
      video: track(elements.video),
      master,
    };

    // Browsers keep audio suspended until the user interacts with the page.
    const resume = () => void this.resume();
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, resume, { capture: true });
  }

  /** Sends all of the app's sound to an output device; null is the system default. */
  async setOutput(deviceId: string | null): Promise<void> {
    const context = this.context as AudioContext & { setSinkId?(id: string): Promise<void> };
    await context.setSinkId?.(deviceId ?? '');
  }

  resume(): Promise<void> {
    return this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
  }

  /** Volume 0..1, pan -1 (left) .. 1 (right); changes glide so they never click. */
  setLevel(key: ChannelKey, volume: number, muted: boolean, pan: number): void {
    const channel = this.channels[key];
    const now = this.context.currentTime;
    channel.gain.gain.setTargetAtTime(muted ? 0 : Math.min(1, Math.max(0, volume)), now, 0.01);
    channel.panner.pan.setTargetAtTime(Math.min(1, Math.max(-1, pan)), now, 0.01);
  }

  /** Fades a channel out quickly, without the click of a hard stop. */
  fadeOut(key: ChannelKey): void {
    this.channels[key].gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
  }

  /**
   * Fades the whole output to silence over `seconds`, steadily in dB like a
   * desk fader (a straight gain ramp sounds as if it drops away at the end).
   */
  fadeAll(seconds: number): void {
    const gain = this.fader.gain;
    const now = this.context.currentTime;
    const from = Math.max(gain.value, FADE_FLOOR);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(from, now);
    gain.exponentialRampToValueAtTime(FADE_FLOOR, now + seconds);
    gain.setValueAtTime(0, now + seconds);
  }

  /** Brings the whole output back to full level after a fade, quickly but without a click. */
  restoreAll(): void {
    const gain = this.fader.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.setTargetAtTime(1, now, 0.02);
  }

  /** Lowers the whole output by `db` (0 brings it back) over `seconds`, steadily in dB. */
  setDuck(db: number, seconds: number): void {
    const gain = this.duck.gain;
    const now = this.context.currentTime;
    const target = 10 ** (-Math.max(0, db) / 20);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (seconds > 0) gain.exponentialRampToValueAtTime(target, now + seconds);
    else gain.setTargetAtTime(target, now, 0.01);
  }

  /** Current peak of each channel, as meter positions (0..1). */
  levels(key: ChannelKey): [number, number] {
    return this.channels[key].analysers.map((analyser) => {
      analyser.getFloatTimeDomainData(this.buffer);
      let peak = 0;
      for (const v of this.buffer) peak = Math.max(peak, Math.abs(v));
      return meterLevel(peak);
    }) as [number, number];
  }
}
