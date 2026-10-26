import { describe, expect, it } from 'vitest';
import { addMarker } from '../src/model/markers';
import { createPage } from '../src/model/project';
import type { Page } from '../src/model/types';
import { csvToCues, cuesToCsv, cuesToSrt, decodeCsv, parseCsv, toCsv } from '../src/ui/cueCsv';
import timedSample from '../public/samples/cues-with-times.csv?raw';
import orderSample from '../public/samples/memos-in-order.csv?raw';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const pageWith = (...times: number[]): Page => {
  const nextId = ids();
  let page = createPage('P', 'page');
  for (const t of times) page = addMarker(page, t, 100, nextId).page;
  return page;
};

describe('parseCsv / toCsv', () => {
  it('reads quoted fields with commas, quotes and line breaks', () => {
    expect(parseCsv('Time,Memo\r\n0:12,"Stars, at night\nshine ""bright"""\n')).toEqual([
      ['Time', 'Memo'],
      ['0:12', 'Stars, at night\nshine "bright"'],
    ]);
  });

  it('skips the byte order mark and reads a last line without a line ending', () => {
    expect(parseCsv('﻿a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('writes what it reads', () => {
    const rows = [['Time', 'Name', 'Memo'], ['00:12.50', 'Verse', 'two\nlines, "quoted"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('decodeCsv', () => {
  it('reads UTF-8, and Shift_JIS as Excel saves it in Japan', () => {
    expect(decodeCsv(new TextEncoder().encode('歌詞').buffer)).toBe('歌詞');
    // 歌詞 in Shift_JIS.
    expect(decodeCsv(new Uint8Array([0x89, 0xcc, 0x8e, 0x8c]).buffer)).toBe('歌詞');
  });
});

describe('csvToCues', () => {
  it('fills the cues in order from rows without times, and counts the rows left over', () => {
    const { page, filled, leftOver } = csvToCues(pageWith(5, 10), 'Memo\nfirst line\n"second\nline"\nthird', 100);
    expect(page.markers.map((m) => m.memo)).toEqual(['first line', 'second\nline']);
    expect([filled, leftOver]).toEqual([2, 1]);
  });

  it('takes a single column without a header as the memos', () => {
    expect(csvToCues(pageWith(5), 'only line', 100).page.markers[0].memo).toBe('only line');
  });

  it('adds cues at the times given, with their names', () => {
    const { page, added } = csvToCues(createPage('P', 'p'), 'Time,Name,Memo\n0:12.5,Verse,Hello\n1:02,,World', 100, ids());
    expect(page.markers.map((m) => [m.time, m.name, m.memo])).toEqual([
      [12.5, 'Verse', 'Hello'],
      [62, 'Cue 2', 'World'],
    ]);
    expect(added).toBe(2);
  });

  it('updates the cues of an exported file read back, instead of adding them again', () => {
    let page = pageWith(5, 10);
    const csv = cuesToCsv(page).replace(',Cue 2,', ',Chorus,');
    const result = csvToCues(page, csv.replace(/\r\n$/, '') + '\n', 100);
    page = result.page;
    expect(page.markers.map((m) => m.name)).toEqual(['Cue 1', 'Chorus']);
    expect([result.added, result.filled]).toEqual([0, 2]);
  });

  it('reports times it cannot read', () => {
    expect(csvToCues(pageWith(5), 'Time,Memo\nsoon,Hi', 100).badTimes).toEqual(['soon']);
  });
});

describe('the sample CSVs in public/samples', () => {
  it('fills cues in order with two-line memos', () => {
    const { page, leftOver } = csvToCues(pageWith(1, 2, 3), orderSample, 100);
    expect(page.markers[1].memo).toBe('Walking through the city\nbefore the break of day');
    expect(leftOver).toBe(3);
  });

  it('adds named cues at their times', () => {
    const { page, added } = csvToCues(createPage('P', 'p'), timedSample, 100, ids());
    expect(added).toBe(7);
    expect(page.markers[3]).toMatchObject({ time: 28, name: 'Chorus', memo: 'Hello, morning light\ncarry my voice' });
  });
});

describe('cuesToSrt', () => {
  it('shows each memo from its cue to the next, the last to the page end, skipping empty memos', () => {
    let page = pageWith(5, 15, 30, 40);
    const [a, b, , d] = page.markers;
    page = { ...page, markers: page.markers.map((m) => (m.id === a.id ? { ...m, memo: 'First\nline two' } : m.id === b.id ? { ...m, memo: 'Second' } : m.id === d.id ? { ...m, memo: 'Last' } : m)) };
    expect(cuesToSrt(page, 3725.5)).toBe(
      '1\r\n00:00:05,000 --> 00:00:15,000\r\nFirst\r\nline two\r\n' +
        '\r\n2\r\n00:00:15,000 --> 00:00:30,000\r\nSecond\r\n' +
        '\r\n3\r\n00:00:40,000 --> 01:02:05,500\r\nLast\r\n',
    );
  });

  it('is empty without memos', () => {
    expect(cuesToSrt(pageWith(5), 60)).toBe('');
  });
});
