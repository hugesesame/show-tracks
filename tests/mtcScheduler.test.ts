import { describe, expect, it } from 'vitest';
import { MtcScheduler } from '../src/engine/mtcScheduler';

type Sent = { data: number[]; at: number };

const setup = (fps: '25' | '30' = '25', offset = 0) => {
  const sent: Sent[] = [];
  const scheduler = new MtcScheduler((data, at) => sent.push({ data, at }));
  scheduler.configure(fps, offset);
  return { sent, scheduler };
};

describe('MtcScheduler', () => {
  it('sends a full frame on locate', () => {
    const { sent, scheduler } = setup('25', 3600);
    scheduler.locate(1, 500);
    expect(sent).toEqual([{ data: [0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x21, 0, 1, 0, 0xf7], at: 500 }]);
  });

  it('schedules quarter frames ahead, aligned to frame boundaries', () => {
    const { sent, scheduler } = setup('25');
    // At real time 1000ms the page is at 0.01s; the next frame (1) starts at 0.04s.
    scheduler.tick(0.01, true, 1000);
    // Only what falls within the 50ms lookahead.
    expect(sent.map((s) => Math.round(s.at))).toEqual([1030, 1040, 1050]);
    expect(sent[0].data).toEqual([0xf1, 0x01]); // piece 0, frame 1
    expect(sent[1].data).toEqual([0xf1, 0x10]);
  });

  it('does not resend what was already scheduled', () => {
    const { sent, scheduler } = setup('25');
    scheduler.tick(0.01, true, 1000);
    scheduler.tick(0.02, true, 1010);
    expect(sent.map((s) => Math.round(s.at))).toEqual([1030, 1040, 1050, 1060]);
  });

  it('advances the timecode by two frames per full cycle', () => {
    const { sent, scheduler } = setup('25');
    scheduler.tick(0, true, 0);
    for (let t = 10; t <= 100; t += 10) scheduler.tick(t / 1000, true, t);
    const piece0s = sent.filter((s) => s.data[1] >> 4 === 0).map((s) => s.data[1] & 0x0f);
    expect(piece0s.slice(0, 2)).toEqual([0, 2]);
  });

  it('re-aligns after a jump in the page time', () => {
    const { sent, scheduler } = setup('25');
    scheduler.tick(0, true, 0);
    sent.length = 0;
    scheduler.tick(10, true, 10);
    expect(sent[0].data).toEqual([0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x20, 0, 10, 0, 0xf7]);
    expect(sent[1].data[1] >> 4).toBe(0);
  });

  it('stops sending quarter frames when stopped', () => {
    const { sent, scheduler } = setup('25');
    scheduler.tick(0, true, 0);
    sent.length = 0;
    scheduler.tick(0.5, false, 500);
    scheduler.tick(0.5, false, 600);
    expect(sent).toEqual([]);
  });
});
