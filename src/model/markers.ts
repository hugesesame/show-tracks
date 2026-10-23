import { randomId, type IdGenerator, type Marker, type Page } from './types';

const clamp = (time: number, duration: number) => Math.min(Math.max(time, 0), duration);

const byTime = (a: Marker, b: Marker) => a.time - b.time;

/** Matches the names markers get automatically; any other name was typed in and is kept. */
const AUTO_NAME = /^Cue \d+$/;

/** Sorts by time and renumbers automatic names to match their row, so they always count up. */
export function orderMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort(byTime).map((m, i) => {
    const name = `Cue ${i + 1}`;
    return AUTO_NAME.test(m.name) && m.name !== name ? { ...m, name } : m;
  });
}

function withMarkers(page: Page, markers: Marker[]): Page {
  return { ...page, markers: orderMarkers(markers) };
}

export function addMarker(
  page: Page,
  time: number,
  duration: number,
  nextId: IdGenerator = randomId,
): { page: Page; marker: Marker } {
  const marker: Marker = { id: nextId(), name: 'Cue 0', time: clamp(time, duration), midiOn: false, note: null, memo: '' };
  const added = withMarkers(page, [...page.markers, marker]);
  return { page: added, marker: added.markers.find((m) => m.id === marker.id)! };
}

export function removeMarker(page: Page, markerId: string): Page {
  if (!page.markers.some((m) => m.id === markerId)) return page;
  return withMarkers(page, page.markers.filter((m) => m.id !== markerId));
}

function updateMarker(page: Page, markerId: string, update: (m: Marker) => Marker): Page {
  if (!page.markers.some((m) => m.id === markerId)) return page;
  return withMarkers(
    page,
    page.markers.map((m) => (m.id === markerId ? update(m) : m)),
  );
}

export function renameMarker(page: Page, markerId: string, name: string): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, name }));
}

export type MarkerFields = Partial<Pick<Marker, 'midiOn' | 'note' | 'memo'>>;

export function setMarkerFields(page: Page, markerId: string, patch: MarkerFields): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, ...patch }));
}

export function setMarkerTime(page: Page, markerId: string, time: number, duration: number): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, time: clamp(time, duration) }));
}

export function nudgeMarker(page: Page, markerId: string, delta: number, duration: number): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, time: clamp(m.time + delta, duration) }));
}

/** The memo of the last cue at or before `time`: what the Memo view shows. */
export function memoAt(page: Page, time: number): string {
  const marker = [...page.markers].reverse().find((m) => m.time <= time + 1e-3);
  return marker?.memo ?? '';
}
