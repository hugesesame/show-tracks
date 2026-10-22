import { describe, expect, it } from 'vitest';
import { formatClock, parseClock } from '../src/ui/format';

describe('formatClock', () => {
  it('shows minutes, seconds and hundredths', () => {
    expect(formatClock(0)).toBe('00:00.00');
    expect(formatClock(83.456)).toBe('01:23.45');
  });

  it('adds hours when needed', () => {
    expect(formatClock(3725.5)).toBe('1:02:05.50');
  });
});

describe('parseClock', () => {
  it('accepts seconds, mm:ss and h:mm:ss with optional fractions', () => {
    expect(parseClock('12')).toBe(12);
    expect(parseClock('12.5')).toBe(12.5);
    expect(parseClock('01:23.45')).toBeCloseTo(83.45);
    expect(parseClock('1:02:05.5')).toBeCloseTo(3725.5);
  });

  it('rejects invalid input', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('-3')).toBeNull();
  });
});
