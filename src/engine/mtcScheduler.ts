import { fullFrame, quarterFrames } from './mtcMessages';
import { framesToTimecode, realFps, secondsToTimecode, type Fps } from './timecode';

export type MidiSend = (data: number[], timestampMs: number) => void;

const LOOKAHEAD_MS = 50;
/** Page time drift (in frames) beyond which the quarter frame stream restarts. */
const RESYNC_FRAMES = 2;

type Cycle = {
  /** Frame count carried by the current 8-piece cycle. */
  frame: number;
  piece: number;
  nextAt: number;
  anchorTime: number;
  anchorMs: number;
};

/**
 * Turns the page time into MTC. Quarter frames are scheduled slightly ahead
 * with timestamps so the MIDI layer sends them on time despite timer jitter.
 */
export class MtcScheduler {
  private fps: Fps = '30';
  private offset = 0;
  private cycle: Cycle | null = null;

  constructor(private readonly send: MidiSend) {}

  configure(fps: Fps, offsetSeconds: number): void {
    this.fps = fps;
    this.offset = offsetSeconds;
    this.cycle = null;
  }

  /** Sends a Full Frame (on seek or stop) and restarts the quarter frame stream. */
  locate(pageTime: number, nowMs: number): void {
    this.send(fullFrame(secondsToTimecode(pageTime, this.fps, this.offset), this.fps), nowMs);
    this.cycle = null;
  }

  tick(pageTime: number, playing: boolean, nowMs: number): void {
    if (!playing) {
      this.cycle = null;
      return;
    }
    const rate = realFps(this.fps);
    if (this.cycle) {
      const expected = this.cycle.anchorTime + (nowMs - this.cycle.anchorMs) / 1000;
      if (Math.abs(pageTime - expected) * rate > RESYNC_FRAMES) this.locate(pageTime, nowMs);
    }
    if (!this.cycle) this.cycle = this.startCycle(pageTime, nowMs, rate);

    const interval = 1000 / (rate * 4);
    const cycle = this.cycle;
    let pieces = quarterFrames(framesToTimecode(cycle.frame, this.fps), this.fps);
    while (cycle.nextAt <= nowMs + LOOKAHEAD_MS) {
      this.send(pieces[cycle.piece], cycle.nextAt);
      cycle.nextAt += interval;
      cycle.piece++;
      if (cycle.piece === 8) {
        cycle.piece = 0;
        cycle.frame += 2;
        pieces = quarterFrames(framesToTimecode(cycle.frame, this.fps), this.fps);
      }
    }
  }

  private startCycle(pageTime: number, nowMs: number, rate: number): Cycle {
    const total = pageTime + this.offset;
    const frame = Math.ceil(total * rate - 1e-6);
    const nextAt = nowMs + (frame / rate - total) * 1000;
    return { frame, piece: 0, nextAt, anchorTime: pageTime, anchorMs: nowMs };
  }
}
