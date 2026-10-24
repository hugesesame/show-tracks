/** Toggles fullscreen for a document. Must run inside a user gesture in that document. */
export function toggleFullscreen(doc: Document = document): void {
  if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
  else void doc.documentElement.requestFullscreen().catch(() => {});
}

type KeyboardLock = { lock(keys?: string[]): Promise<void>; unlock(): void };

/**
 * In fullscreen, Chrome would use Esc to leave it. Keyboard Lock hands Esc to
 * the app instead (fade out and stop); holding Esc still leaves fullscreen.
 */
export function keepEscapeInFullscreen(doc: Document = document): void {
  const keyboard = (doc.defaultView?.navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (!keyboard?.lock) return;
  doc.addEventListener('fullscreenchange', () => {
    if (doc.fullscreenElement) void keyboard.lock(['Escape']).catch(() => {});
    else keyboard.unlock();
  });
}
