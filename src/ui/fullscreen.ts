/** Toggles fullscreen for a document. Must run inside a user gesture in that document. */
export function toggleFullscreen(doc: Document = document): void {
  if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
  else void doc.documentElement.requestFullscreen().catch(() => {});
}
