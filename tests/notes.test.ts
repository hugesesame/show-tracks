import { describe, expect, it } from 'vitest';
import { createPage, createProject } from '../src/model/project';
import { cuesReached, noteFor } from '../src/model/notes';
import type { Marker, Page } from '../src/model/types';

const cue = (id: string, time: number, midiOn = true, note: number | null = null): Marker => ({
  id,
  name: id,
  time,
  midiOn,
  note,
  memo: '',
});

const page = (markers: Marker[], patch: Partial<Page> = {}): Page => ({ ...createPage('p', 'p'), markers, ...patch });
const ids = (markers: Marker[]) => markers.map((m) => m.id);

describe('cuesReached', () => {
  const p = page([cue('a', 5), cue('b', 10, false), cue('c', 15)]);

  it('lists the cues passed during playback that have MIDI on', () => {
    expect(ids(cuesReached(p, 4, 5))).toEqual(['a']);
    expect(ids(cuesReached(p, 5, 16))).toEqual(['c']);
    expect(ids(cuesReached(p, 5.5, 9))).toEqual([]);
  });

  it('counts a cue right where playback starts', () => {
    expect(ids(cuesReached(p, null, 5.01))).toEqual(['a']);
    expect(ids(cuesReached(p, null, 7))).toEqual([]);
  });

  it('sends nothing when the page has MIDI Notes off, or for cues outside the range', () => {
    expect(cuesReached({ ...p, midiNotes: false }, 0, 20)).toEqual([]);
    expect(ids(cuesReached({ ...p, rangeEnd: 15 }, 0, 20))).toEqual(['a']);
  });
});

describe('noteFor', () => {
  it("uses the project's default note unless the cue has its own", () => {
    const { settings } = createProject();
    expect(noteFor(cue('a', 0), settings)).toEqual({ channel: 1, note: 60, velocity: 127 });
    expect(noteFor(cue('a', 0, true, 64), settings).note).toBe(64);
  });
});
