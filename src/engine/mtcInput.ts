import { realFps, timecodeToFrames, type Fps, type Timecode } from './timecode';

/** The frame rate each 2-bit MTC rate code stands for. */
const RATES: readonly Fps[] = ['24', '25', '29.97df', '30'];

/** Without a complete frame for this long, the sender has stopped. */
const STOP_MS = 200;

/**
 * Piece 7 of a quarter frame cycle arrives 7/4 frames after the frame the
 * cycle carries, so the time it completes is that much later.
 */
const CYCLE_FRAMES = 1.75;

export type MtcInputState = 'waiting' | 'running' | 'stopped';

function toSeconds(hours: number, m: number, s: number, f: number, rate: number, extraFrames = 0): { seconds: number; fps: Fps } {
  const fps = RATES[rate & 0x03];
  const tc: Timecode = { h: hours & 0x1f, m, s, f };
  return { seconds: (timecodeToFrames(tc, fps) + extraFrames) / realFps(fps), fps };
}

/**
 * Follows MTC coming in from another app (a DAW): Quarter Frames while it
 * plays, a Full Frame when it locates. Between frames the time runs on the
 * real-time clock, so it moves smoothly.
 */
export class MtcInput {
  private readonly nibbles: number[] = new Array(8).fill(0);
  /** The quarter frame piece expected next; a cycle only counts when its pieces come in order. */
  private nextPiece = 0;
  private seconds = 0;
  private atMs = 0;
  private running = false;
  private heard = false;
  private _fps: Fps | null = null;

  /** Takes one incoming MIDI message; others than MTC are ignored. */
  read(data: Uint8Array, nowMs: number): void {
    if (data[0] === 0xf1 && data.length >= 2) this.quarterFrame(data[1] >> 4, data[1] & 0x0f, nowMs);
    else if (data.length >= 10 && data[0] === 0xf0 && data[1] === 0x7f && data[3] === 0x01 && data[4] === 0x01) {
      const { seconds, fps } = toSeconds(data[5], data[6], data[7], data[8], data[5] >> 5);
      this.set(seconds, fps, false, nowMs);
      this.nextPiece = 0;
    }
  }

  private quarterFrame(piece: number, value: number, nowMs: number): void {
    if (piece !== this.nextPiece) {
      // Out of order (or running backwards): wait for the next cycle.
      this.nextPiece = piece === 0 ? 1 : 0;
      if (piece === 0) this.nibbles[0] = value;
      return;
    }
    this.nibbles[piece] = value;
    this.nextPiece = (piece + 1) % 8;
    if (piece !== 7) return;
    const n = this.nibbles;
    const { seconds, fps } = toSeconds(
      n[6] | ((n[7] & 0x01) << 4),
      n[4] | (n[5] << 4),
      n[2] | (n[3] << 4),
      n[0] | (n[1] << 4),
      n[7] >> 1,
      CYCLE_FRAMES,
    );
    this.set(seconds, fps, true, nowMs);
  }

  private set(seconds: number, fps: Fps, running: boolean, nowMs: number): void {
    this.seconds = seconds;
    this.atMs = nowMs;
    this.running = running;
    this.heard = true;
    this._fps = fps;
  }

  /** The timecode in seconds now, and whether the sender is playing. */
  now(nowMs: number): { seconds: number; state: MtcInputState } {
    if (this.running && nowMs - this.atMs > STOP_MS) this.running = false;
    if (!this.heard) return { seconds: 0, state: 'waiting' };
    if (!this.running) return { seconds: this.seconds, state: 'stopped' };
    return { seconds: this.seconds + (nowMs - this.atMs) / 1000, state: 'running' };
  }

  /** The frame rate last received, or null before any MTC came in. */
  get fps(): Fps | null {
    return this._fps;
  }

  /** Forgets what came in, e.g. when another input is chosen. */
  reset(): void {
    this.nextPiece = 0;
    this.running = this.heard = false;
    this._fps = null;
  }
}
