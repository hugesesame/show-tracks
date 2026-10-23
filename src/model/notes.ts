import { inRange } from './range';
import type { Marker, Page, Settings } from './types';

/** A cue this close behind the playhead when playback starts counts as reached: GO starts right on it. */
export const START_WINDOW = 0.05;

export type Note = { channel: number; note: number; velocity: number };

/**
 * The cues whose MIDI Notes are due as playback moved from `from` to `to`
 * (page time). `from` is null right after playback started or jumped.
 */
export function cuesReached(page: Page, from: number | null, to: number): Marker[] {
  if (!page.midiNotes) return [];
  return page.markers.filter(
    (m) =>
      m.midiOn &&
      inRange(page, m.time) &&
      (from === null ? m.time >= to - START_WINDOW && m.time <= to : m.time > from && m.time <= to),
  );
}

export function noteFor(marker: Marker, settings: Settings): Note {
  return { channel: settings.noteChannel, note: marker.note ?? settings.noteNumber, velocity: settings.noteVelocity };
}
