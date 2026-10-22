const pad = (n: number) => String(n).padStart(2, '0');

/** "mm:ss.cc", or "h:mm:ss.cc" from one hour. */
export function formatClock(seconds: number): string {
  const hundredths = Math.floor(Math.max(0, seconds) * 100 + 1e-6);
  const cs = hundredths % 100;
  const s = Math.floor(hundredths / 100) % 60;
  const m = Math.floor(hundredths / 6000) % 60;
  const h = Math.floor(hundredths / 360000);
  const body = `${pad(m)}:${pad(s)}.${pad(cs)}`;
  return h > 0 ? `${h}:${body}` : body;
}

/** Parses "ss[.f]", "mm:ss[.f]" or "h:mm:ss[.f]". */
export function parseClock(text: string): number | null {
  const match = /^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) return null;
  const [h, m, s] = [match[1], match[2], match[3]].map((v) => (v === undefined ? 0 : Number(v)));
  if (match[2] !== undefined && s >= 60) return null;
  if (match[1] !== undefined && m >= 60) return null;
  return h * 3600 + m * 60 + s;
}
