import type { Settings } from '../model/types';

export type MemoLook = Pick<
  Settings,
  'memoSize' | 'memoColor' | 'memoOutline' | 'memoOutlineColor' | 'memoPosition' | 'memoFade' | 'memoFadeOn'
>;

/**
 * Shared by the main window and the video output, which is a separate document:
 * the text size is a share of the stage height, so both screens look alike.
 * Two layers take turns, so one memo can dissolve into the next.
 */
const STYLE = `
.memo-stage {
  position: absolute;
  inset: 0;
  container-type: size;
  pointer-events: none;
}
.memo-stage[hidden] { display: none; }
.memo-layer {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--memo-fade, 0s) linear;
}
.memo-layer.shown { opacity: 1; }
.memo-stage[data-position='top'] .memo-layer { align-items: flex-start; }
.memo-stage[data-position='middle'] .memo-layer { align-items: center; }
.memo-stage[data-position='bottom'] .memo-layer { align-items: flex-end; }
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
  /* An outline keeps the text readable over the video; drawn under the fill. */
  -webkit-text-stroke: calc(var(--memo-size) * var(--memo-outline) * 1cqh) var(--memo-outline-color);
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
  const layers = [0, 1].map(() => {
    const text = doc.createElement('div');
    text.className = 'memo-text';
    const layer = doc.createElement('div');
    layer.className = 'memo-layer';
    layer.append(text);
    return { layer, text };
  });
  const element = doc.createElement('div');
  element.className = 'memo-stage';
  element.append(...layers.map((l) => l.layer));
  let front = 0;
  let shown = '';
  let shownLook = '';

  /** Cheap to call every frame: the page only changes when the memo or its look does. */
  function render(memo: string, look: MemoLook): void {
    const fade = look.memoFadeOn ? look.memoFade : 0;
    const key = [look.memoSize, look.memoColor, look.memoOutline, look.memoOutlineColor, look.memoPosition, fade].join('|');
    if (key !== shownLook) {
      shownLook = key;
      element.dataset.position = look.memoPosition;
      element.style.setProperty('--memo-size', String(look.memoSize));
      element.style.setProperty('--memo-color', look.memoColor);
      element.style.setProperty('--memo-outline', String(look.memoOutline));
      element.style.setProperty('--memo-outline-color', look.memoOutlineColor);
      element.style.setProperty('--memo-fade', `${fade}s`);
    }
    if (memo === shown) return;
    shown = memo;
    // The new memo fades in on the other layer while the old one fades out.
    layers[front].layer.classList.remove('shown');
    front = 1 - front;
    layers[front].text.textContent = memo;
    layers[front].layer.classList.toggle('shown', memo !== '');
  }

  return { element, render };
}
