export type TrackKind = 'audio' | 'video';

const METER_FLOOR_DB = -60;

/** Peak amplitude to a 0..1 meter position on a -60..0 dBFS scale. */
export function meterLevel(peak: number): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}

type Channel = {
  gain: GainNode;
  analysers: [AnalyserNode, AnalyserNode];
  volume: number;
  muted: boolean;
};

/**
 * Routes each media element through volume → stereo meter → speakers.
 * The meter reads after the volume, like a DAW channel.
 */
export class Mixer {
  private readonly context = new AudioContext();
  private readonly channels: Record<TrackKind, Channel>;
  private readonly buffer = new Float32Array(1024);

  constructor(elements: Record<TrackKind, HTMLMediaElement>) {
    const make = (element: HTMLMediaElement): Channel => {
      // Levels are set on the gain node, so the element itself stays at full volume.
      element.volume = 1;
      element.muted = false;
      const source = this.context.createMediaElementSource(element);
      // Upmix mono files so both meter bars move.
      const gain = new GainNode(this.context, { channelCount: 2, channelCountMode: 'explicit' });
      const splitter = this.context.createChannelSplitter(2);
      const analysers = [0, 1].map(() => new AnalyserNode(this.context, { fftSize: 1024 })) as [
        AnalyserNode,
        AnalyserNode,
      ];
      source.connect(gain).connect(this.context.destination);
      gain.connect(splitter);
      analysers.forEach((analyser, i) => splitter.connect(analyser, i));
      return { gain, analysers, volume: 1, muted: false };
    };
    this.channels = { audio: make(elements.audio), video: make(elements.video) };

    // Browsers keep audio suspended until the user interacts with the page.
    const resume = () => void this.resume();
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, resume, { capture: true });
  }

  resume(): Promise<void> {
    return this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
  }

  setLevel(kind: TrackKind, volume: number, muted: boolean): void {
    const channel = this.channels[kind];
    channel.volume = Math.min(1, Math.max(0, volume));
    channel.muted = muted;
    channel.gain.gain.setTargetAtTime(muted ? 0 : channel.volume, this.context.currentTime, 0.01);
  }

  /** Current peak of each channel, as meter positions (0..1). */
  levels(kind: TrackKind): [number, number] {
    return this.channels[kind].analysers.map((analyser) => {
      analyser.getFloatTimeDomainData(this.buffer);
      let peak = 0;
      for (const v of this.buffer) peak = Math.max(peak, Math.abs(v));
      return meterLevel(peak);
    }) as [number, number];
  }
}
