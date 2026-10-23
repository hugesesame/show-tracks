import type { Fps } from '../engine/timecode';

export type Settings = {
  mtcFps: Fps;
  midiOutputId: string | null;
  /** After the last page comes the first one again. */
  loopPages: boolean;
  /** The Master strip, after both tracks. Pan is -1 (left) .. 1 (right). */
  masterVolume: number;
  masterMuted: boolean;
  masterPan: number;
  /** MIDI Notes sent at cues: channel 1..16, the note a cue uses unless it has its own, velocity 1..127. */
  noteChannel: number;
  noteNumber: number;
  noteVelocity: number;
  /** How cue memos (lyrics, prompts) look on the Memo view and the video output. */
  memoSize: number;
  memoColor: string;
  /** The text outline: its width as a share of the text size (0 for none), and its colour. */
  memoOutline: number;
  memoOutlineColor: string;
  /** Off drops the outline, keeping its width and colour for later. */
  memoOutlineOn: boolean;
  memoPosition: MemoPosition;
  /** Seconds one memo dissolves into the next; 0 switches at once. */
  memoFade: number;
  /** Off cuts straight to the next memo, keeping the fade length for later. */
  memoFadeOn: boolean;
  /** Also shows the memos on the video output, over the video. */
  memoOutput: boolean;
};

/** Where the memo text sits on the screen. */
export type MemoPosition = 'top' | 'middle' | 'bottom';

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
  /** -1 (left) .. 1 (right). */
  audioPan: number;
  videoPan: number;
  endAction: EndAction;
  /** In / out points on the page timeline in seconds; null is the page's start / end. */
  rangeStart: number | null;
  rangeEnd: number | null;
  /** Where the next page starts while this one rings out (page time), or null. */
  overlapAt: number | null;
  /** Seconds added to the page time when sending MTC. */
  mtcOffset: number;
  /** Always sorted by time. */
  markers: Marker[];
  /** Turns the cues' MIDI Notes on this page on or off as a whole. */
  midiNotes: boolean;
};

export type Marker = {
  id: string;
  name: string;
  /** Seconds from the start of the page. */
  time: number;
  /** Sends a MIDI Note when playback reaches the cue. */
  midiOn: boolean;
  /** The cue's own note number; null uses the project's default note. */
  note: number | null;
  /** Shown from this cue on (lyrics, prompts); may hold line breaks. Empty clears the screen. */
  memo: string;
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
