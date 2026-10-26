import type { Transport } from '../engine/transport';
import type { VideoView } from '../engine/videoDecks';
import { toggleFullscreen } from '../ui/fullscreen';
import { createMemoStage, type MemoLook } from '../ui/memoStage';

/** The video output for the audience, or the prompter: the memos alone, for the performers. */
export type OutputKind = 'video' | 'prompter';

const WINDOWS: Record<OutputKind, { name: string; title: string }> = {
  video: { name: 'cue-player-output', title: 'Video Output' },
  prompter: { name: 'cue-player-prompter', title: 'Prompter' },
};

/**
 * A window for a secondary display: the video with the cue memos over it, or
 * (as the prompter) the memos alone on black. It is same-origin, so its video
 * element is driven directly from here.
 */
export class OutputWindow {
  private win: Window | null = null;
  private videos: VideoView | null = null;
  private memo: ReturnType<typeof createMemoStage> | null = null;
  private readonly events = new EventTarget();

  constructor(
    private readonly transport: Transport,
    private readonly kind: OutputKind = 'video',
  ) {}

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
    const win = window.open('', WINDOWS[this.kind].name, 'popup,width=960,height=540');
    if (!win) return false;
    this.win = win;
    const doc = win.document;
    doc.body.replaceChildren();
    const style = doc.createElement('style');
    style.textContent = `
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: none; }
      body { position: relative; }
      video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
    `;
    doc.head.replaceChildren(style);
    // After the head is replaced, which would drop the title element.
    doc.title = WINDOWS[this.kind].title;
    this.memo = createMemoStage(doc);
    if (this.kind === 'video') {
      // Two decks, as on the monitor, so the video can dissolve into the next page's.
      const videos = [0, 1].map(() => {
        const video = doc.createElement('video');
        video.muted = true;
        return video;
      }) as VideoView;
      doc.body.append(...videos);
      this.videos = videos;
      this.transport.video.addView(videos);
    }
    doc.body.append(this.memo.element);
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

  /** The output window's width / height while it is open. */
  get aspect(): number | null {
    if (!this.isOpen || this.win!.innerHeight === 0) return null;
    return this.win!.innerWidth / this.win!.innerHeight;
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
    if (this.videos) this.transport.video.removeView(this.videos);
    this.videos = null;
    this.memo = null;
    this.win = null;
    this.events.dispatchEvent(new Event('change'));
  }
}
