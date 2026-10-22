import type { Fps, Timecode } from './timecode';

export function rateCode(fps: Fps): number {
  switch (fps) {
    case '24':
      return 0;
    case '25':
      return 1;
    case '29.97df':
      return 2;
    case '30':
      return 3;
  }
}

/** MTC Full Frame SysEx, sent on locate (seek / stop). */
export function fullFrame(tc: Timecode, fps: Fps): number[] {
  return [0xf0, 0x7f, 0x7f, 0x01, 0x01, (rateCode(fps) << 5) | tc.h, tc.m, tc.s, tc.f, 0xf7];
}

/**
 * The 8 Quarter Frame messages for one timecode, piece 0 first.
 * Together they span 2 frames; receivers compensate for that delay.
 */
export function quarterFrames(tc: Timecode, fps: Fps): number[][] {
  const nibbles = [
    tc.f & 0x0f,
    (tc.f >> 4) & 0x01,
    tc.s & 0x0f,
    (tc.s >> 4) & 0x03,
    tc.m & 0x0f,
    (tc.m >> 4) & 0x03,
    tc.h & 0x0f,
    (rateCode(fps) << 1) | ((tc.h >> 4) & 0x01),
  ];
  return nibbles.map((value, piece) => [0xf1, (piece << 4) | value]);
}
