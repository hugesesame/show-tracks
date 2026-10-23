import type { Fps } from '../engine/timecode';

export type Settings = {
  mtcFps: Fps;
  midiOutputId: string | null;
  /** After the last page comes the first one again. */
  loopPages: boolean;
};

export type Project = {
  pages: Page[];
  currentPageId: string;
  settings: Settings;
};

/** What happens when playback reaches the end of a page. */
export type EndAction = 'stop' | 'next' | 'nextPlay';

export type Page = {
  id: string;
  name: string;
  /** At least one of audio and video is required for playback. */
  audioMediaId: string | null;
  videoMediaId: string | null;
  /** Where each clip starts on the page timeline, in seconds (0 or later). */
  audioOffset: number;
  videoOffset: number;
  audioVolume: number;
  audioMuted: boolean;
  /** The video's own sound; disabled means the Video track is muted. */
  videoAudioEnabled: boolean;
  videoAudioVolume: number;
  endAction: EndAction;
  /** In / out points on the page timeline in seconds; null is the page's start / end. */
  rangeStart: number | null;
  rangeEnd: number | null;
  /** Seconds added to the page time when sending MTC. */
  mtcOffset: number;
  /** Always sorted by time. */
  markers: Marker[];
};

export type Marker = {
  id: string;
  name: string;
  /** Seconds from the start of the page. */
  time: number;
};

export type MediaRecord = {
  id: string;
  kind: 'audio' | 'video';
  fileName: string;
  mimeType: string;
  blob: Blob;
  duration: number;
  /** Interleaved min/max pairs of the waveform. */
  peaks?: Float32Array;
};

export type IdGenerator = () => string;

export const randomId: IdGenerator = () => crypto.randomUUID();
