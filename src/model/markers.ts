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
  const added = withMarkers(page, [...page.markers, { id: nextId(), name: 'Cue 0', time: clamp(time, duration) }]);
  const marker = added.markers.find((m) => !page.markers.some((old) => old.id === m.id))!;
  return { page: added, marker };
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

export function setMarkerTime(page: Page, markerId: string, time: number, duration: number): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, time: clamp(time, duration) }));
}

export function nudgeMarker(page: Page, markerId: string, delta: number, duration: number): Page {
  return updateMarker(page, markerId, (m) => ({ ...m, time: clamp(m.time + delta, duration) }));
}
