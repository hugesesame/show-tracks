import type { Transport } from '../engine/transport';
import { toggleFullscreen } from '../ui/fullscreen';
import { createMemoStage, type MemoLook } from '../ui/memoStage';

const WINDOW_NAME = 'cue-player-output';

/**
 * A second window showing the video, and the cue memos over it, for a secondary display.
 * It is same-origin, so its video element is driven directly from here.
 */
export class OutputWindow {
  private win: Window | null = null;
  private video: HTMLVideoElement | null = null;
  private memo: ReturnType<typeof createMemoStage> | null = null;
  private readonly events = new EventTarget();

  constructor(private readonly transport: Transport) {
    transport.on('load', () => this.updateSource());
  }

  get isOpen(): boolean {
    return this.win !== null && !this.win.closed;
  }

  onChange(listener: () => void): void {
    this.events.addEventListener('change', listener);
  }

  /** Must be called from a user gesture, or the popup is blocked. */
  open(): boolean {
    if (this.isOpen) {
      this.win!.focus();
      return true;
    }
    const win = window.open('', WINDOW_NAME, 'popup,width=960,height=540');
    if (!win) return false;
    this.win = win;
    const doc = win.document;
    doc.title = 'Video Output';
    doc.body.replaceChildren();
    const style = doc.createElement('style');
    style.textContent = `
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: none; }
      body { position: relative; }
      video { width: 100%; height: 100%; object-fit: contain; display: block; }
    `;
    doc.head.replaceChildren(style);
    const video = doc.createElement('video');
    video.muted = true;
    video.playsInline = true;
    this.memo = createMemoStage(doc);
    doc.body.append(video, this.memo.element);
    this.video = video;
    this.updateSource();
    this.transport.videoSync.add(video);
    win.addEventListener('pagehide', () => this.handleClosed());
    // There are no controls on the output, so double-click anywhere toggles fullscreen.
    // Assigned rather than added: reopening an existing window must not stack handlers.
    doc.ondblclick = () => toggleFullscreen(doc);
    doc.onkeydown = (e) => {
      if (e.code === 'KeyF' && !e.repeat) toggleFullscreen(doc);
    };
    this.events.dispatchEvent(new Event('change'));
    return true;
  }

  /** Shows a memo over the video; null hides the memos. Cheap to call every frame. */
  renderMemo(memo: string | null, look: MemoLook): void {
    if (!this.memo) return;
    this.memo.element.hidden = memo === null;
    this.memo.render(memo ?? '', look);
  }

  /** Detects a window closed by the user; call regularly. */
  check(): void {
    if (this.win && this.win.closed) this.handleClosed();
  }

  private handleClosed(): void {
    if (this.video) this.transport.videoSync.remove(this.video);
    this.video = null;
    this.memo = null;
    this.win = null;
    this.events.dispatchEvent(new Event('change'));
  }

  private updateSource(): void {
    if (!this.video) return;
    const url = this.transport.videoUrl;
    if (url) this.video.src = url;
    else this.video.removeAttribute('src');
  }
}
