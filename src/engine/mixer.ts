export type TrackKind = 'audio' | 'video';
/** A track or the Master strip. */
export type StripKind = TrackKind | 'master';

const METER_FLOOR_DB = -60;

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
 * tracks through the Master strip to the speakers. Meters read after the
 * volume and pan, like a DAW channel.
 */
export class Mixer {
  private readonly context = new AudioContext();
  private readonly channels: Record<StripKind, Channel>;
  private readonly buffer = new Float32Array(1024);

  constructor(elements: Record<TrackKind, HTMLMediaElement>) {
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
    const track = (element: HTMLMediaElement): Channel => {
      // Levels are set on the gain nodes, so the element itself stays at full volume.
      element.volume = 1;
      element.muted = false;
      const channel = strip(master.gain);
      this.context.createMediaElementSource(element).connect(channel.gain);
      return channel;
    };
    this.channels = { audio: track(elements.audio), video: track(elements.video), master };

    // Browsers keep audio suspended until the user interacts with the page.
    const resume = () => void this.resume();
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, resume, { capture: true });
  }

  resume(): Promise<void> {
    return this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
  }

  /** Volume 0..1, pan -1 (left) .. 1 (right); changes glide so they never click. */
  setLevel(kind: StripKind, volume: number, muted: boolean, pan: number): void {
    const channel = this.channels[kind];
    const now = this.context.currentTime;
    channel.gain.gain.setTargetAtTime(muted ? 0 : Math.min(1, Math.max(0, volume)), now, 0.01);
    channel.panner.pan.setTargetAtTime(Math.min(1, Math.max(-1, pan)), now, 0.01);
  }

  /** Current peak of each channel, as meter positions (0..1). */
  levels(kind: StripKind): [number, number] {
    return this.channels[kind].analysers.map((analyser) => {
      analyser.getFloatTimeDomainData(this.buffer);
      let peak = 0;
      for (const v of this.buffer) peak = Math.max(peak, Math.abs(v));
      return meterLevel(peak);
    }) as [number, number];
  }
}
