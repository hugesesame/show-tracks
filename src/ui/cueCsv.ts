import type { App } from '../app/app';
import { addMarker, renameMarker, setMarkerFields } from '../model/markers';
import { randomId, type IdGenerator, type Page } from '../model/types';
import { formatClock, parseClock } from './format';

/** Cues a row's time matches: an exported file read back updates its cues instead of adding them again. */
const SAME_TIME = 0.01;

/** Reads CSV: fields in double quotes may hold commas, line breaks and doubled quotes (""). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Line breaks inside a memo stay; line endings are plain \n.
  return rows.map((r) => r.map((f) => f.replace(/\r\n?/g, '\n')));
}

export function toCsv(rows: string[][]): string {
  const quote = (f: string) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f);
  return rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}

/** UTF-8, or Shift_JIS as Excel saves CSV on Japanese systems. */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** The page's cues as Time, Name and Memo rows, to edit in a spreadsheet and read back. */
export function cuesToCsv(page: Page): string {
  // The byte order mark tells Excel the file is UTF-8, so Japanese reads correctly.
  return '\uFEFF' + toCsv([['Time', 'Name', 'Memo'], ...page.markers.map((m) => [formatClock(m.time), m.name, m.memo])]);
}

export type CsvResult = {
  page: Page;
  /** Cues whose memo or name was filled in, cues added, rows left over without a cue, rows with an unreadable time. */
  filled: number;
  added: number;
  leftOver: number;
  badTimes: string[];
};

/**
 * Reads Time, Name and Memo rows into the page's cues (a first row naming the
 * columns is optional; without one, one column is the memo). A row with a time
 * fills the cue at that time, or adds one there. Rows without a time fill the
 * cues from the first one on, in order; any beyond the last cue are left over.
 * An empty name keeps the cue's name.
 */
export function csvToCues(page: Page, text: string, duration: number, nextId: IdGenerator = randomId): CsvResult {
  let rows = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ''));
  const header = rows[0]?.map((f) => f.trim().toLowerCase()) ?? [];
  let columns = { time: -1, name: -1, memo: 0 };
  if (header.includes('memo') || header.includes('time')) {
    columns = { time: header.indexOf('time'), name: header.indexOf('name'), memo: header.indexOf('memo') };
    rows = rows.slice(1);
  } else if ((rows[0]?.length ?? 0) >= 3) {
    columns = { time: 0, name: 1, memo: 2 };
  }
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '');

  const result: CsvResult = { page, filled: 0, added: 0, leftOver: 0, badTimes: [] };
  const inOrder = page.markers.map((m) => m.id);
  let next = 0;
  const write = (id: string, r: string[]) => {
    const name = cell(r, columns.name).trim();
    if (name) result.page = renameMarker(result.page, id, name);
    if (columns.memo >= 0) result.page = setMarkerFields(result.page, id, { memo: cell(r, columns.memo) });
  };
  const fill = (id: string, r: string[]) => {
    write(id, r);
    result.filled++;
  };
  for (const r of rows) {
    const timeText = cell(r, columns.time).trim();
    if (!timeText) {
      if (next < inOrder.length) fill(inOrder[next++], r);
      else result.leftOver++;
      continue;
    }
    const time = parseClock(timeText);
    if (time === null) {
      result.badTimes.push(timeText);
      continue;
    }
    const existing = result.page.markers.find((m) => Math.abs(m.time - time) < SAME_TIME);
    if (existing) {
      fill(existing.id, r);
      continue;
    }
    const { page: added, marker } = addMarker(result.page, time, duration, nextId);
    result.page = added;
    result.added++;
    write(marker.id, r);
  }
  return result;
}

/** Reads a CSV file into the page open and says what it did. */
export async function readCsvIntoCues(app: App, file: File): Promise<void> {
  let text: string;
  try {
    text = decodeCsv(await file.arrayBuffer());
  } catch (e) {
    app.error(`${file.name}: ${(e as Error).message}`);
    return;
  }
  let result: CsvResult | null = null;
  const done = app.replaceCues((page, duration) => (result = csvToCues(page, text, duration)).page);
  if (!done || !result) return;
  const { filled, added, leftOver, badTimes } = result as CsvResult;
  const parts: string[] = [];
  if (filled) parts.push(`${filled} cue(s) filled`);
  if (added) parts.push(`${added} cue(s) added`);
  if (!filled && !added) parts.push('no cues changed');
  if (leftOver) parts.push(`${leftOver} row(s) left over, with no cue to go on`);
  if (badTimes.length) parts.push(`times not understood: ${badTimes.join(', ')}`);
  app.notify(`${file.name}: ${parts.join('; ')}.`);
}

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/** Saves the page's cues as a CSV file named after the page, where the user chooses (a download without Chrome's save dialog). */
export async function saveCuesCsv(app: App, page: Page): Promise<void> {
  const text = cuesToCsv(page);
  const name = `${page.name.replace(/[\\/:*?"<>|]/g, '_') || 'cues'}.csv`;
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!pick) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  try {
    const handle = await pick({ suggestedName: name, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    app.notify(`Exported ${page.markers.length} cue(s) to ${handle.name}.`);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) app.error(`Export failed: ${(e as Error).message}`);
  }
}
