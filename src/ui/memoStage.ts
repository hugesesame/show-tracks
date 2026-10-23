import type { Settings } from '../model/types';

export type MemoLook = Pick<Settings, 'memoSize' | 'memoColor' | 'memoPosition'>;

/**
 * Shared by the main window and the video output, which is a separate document:
 * the text size is a share of the stage height, so both screens look alike.
 */
const STYLE = `
.memo-stage {
  position: absolute;
  inset: 0;
  container-type: size;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.memo-stage[hidden] { display: none; }
.memo-stage[data-position='top'] { align-items: flex-start; }
.memo-stage[data-position='middle'] { align-items: center; }
.memo-stage[data-position='bottom'] { align-items: flex-end; }
.memo-text {
  /* In the text, not the stage: container units refer to the stage from inside it. */
  margin: 5cqh 5cqw;
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Segoe UI', sans-serif;
  font-weight: 700;
  font-size: calc(var(--memo-size) * 1cqh);
  line-height: 1.3;
  color: var(--memo-color);
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  /* A dark outline keeps the text readable over the video. */
  -webkit-text-stroke: calc(var(--memo-size) * 0.08cqh) rgba(0, 0, 0, 0.85);
  paint-order: stroke fill;
}
`;

/** Adds the memo styles to a document once. */
function installStyle(doc: Document): void {
  if (doc.getElementById('memo-stage-style')) return;
  const style = doc.createElement('style');
  style.id = 'memo-stage-style';
  style.textContent = STYLE;
  doc.head.append(style);
}

/** A full-size layer showing one memo in the chosen size, colour and position. */
export function createMemoStage(doc: Document = document) {
  installStyle(doc);
  const text = doc.createElement('div');
  text.className = 'memo-text';
  const element = doc.createElement('div');
  element.className = 'memo-stage';
  element.append(text);
  let shown = '';
  let shownLook = '';

  /** Cheap to call every frame: the page only changes when the memo or its look does. */
  function render(memo: string, look: MemoLook): void {
    const key = `${look.memoSize}|${look.memoColor}|${look.memoPosition}`;
    if (memo === shown && key === shownLook) return;
    shown = memo;
    shownLook = key;
    text.textContent = memo;
    element.dataset.position = look.memoPosition;
    element.style.setProperty('--memo-size', String(look.memoSize));
    element.style.setProperty('--memo-color', look.memoColor);
  }

  return { element, render };
}
