import { randomId, type IdGenerator, type Marker, type Page } from './types';

const clamp = (time: number, duration: number) => Math.min(Math.max(time, 0), duration);

const byTime = (a: Marker, b: Marker) => a.time - b.time;

function withMarkers(page: Page, markers: Marker[]): Page {
  return { ...page, markers: [...markers].sort(byTime) };
}

export function addMarker(
  page: Page,
  time: number,
  duration: number,
  nextId: IdGenerator = randomId,
): { page: Page; marker: Marker } {
  const marker: Marker = { id: nextId(), name: `Cue ${page.nextCueNumber}`, time: clamp(time, duration) };
  return {
    page: { ...withMarkers(page, [...page.markers, marker]), nextCueNumber: page.nextCueNumber + 1 },
    marker,
  };
}

export function removeMarker(page: Page, markerId: string): Page {
  if (!page.markers.some((m) => m.id === markerId)) return page;
  return { ...page, markers: page.markers.filter((m) => m.id !== markerId) };
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
