import type { App } from '../app/app';
import type { MemoPosition } from '../model/types';
import { h } from './dom';
import { createMemoStage } from './memoStage';

const POSITIONS: { position: MemoPosition; label: string }[] = [
  { position: 'top', label: 'Top' },
  { position: 'middle', label: 'Middle' },
  { position: 'bottom', label: 'Bottom' },
];

/** The memo of the last cue passed, as the performers see it, with its look controls. */
export function createMemoView(app: App) {
  const stage = createMemoStage();
  const size = h('input', {
    // Styled like the track volume sliders.
    class: 'volume',
    type: 'range',
    min: 3,
    max: 25,
    step: 0.5,
    title: 'Text size',
    oninput: () => app.setMemoLook({ memoSize: Number(size.value) }),
  });
  const color = h('input', {
    class: 'memo-color',
    type: 'color',
    title: 'Text colour',
    oninput: () => app.setMemoLook({ memoColor: color.value }),
  });
  const positions = POSITIONS.map(({ position, label }) =>
    h('button', { type: 'button', class: 'small', 'data-position': position, onclick: () => app.setMemoLook({ memoPosition: position }) }, label),
  );
  const output = h('button', {
    type: 'button',
    class: 'small',
    onclick: () => app.setMemoLook({ memoOutput: !app.project.settings.memoOutput }),
  }, 'Output');
  const element = h(
    'div',
    { class: 'memo-view' },
    // Framed like the video output, so the text sits and scales as it does there.
    h('div', { class: 'screen' }, stage.element),
    h(
      'div',
      { class: 'memo-controls' },
      h('span', { class: 'memo-label' }, 'Aa'),
      h('div', { class: 'volume-wrap memo-size' }, size),
      color,
      h('div', { class: 'memo-positions' }, ...positions),
      output,
    ),
  );

  function update(): void {
    const s = app.project.settings;
    size.value = String(s.memoSize);
    size.style.setProperty('--fill', String((s.memoSize - Number(size.min)) / (Number(size.max) - Number(size.min))));
    color.value = s.memoColor;
    for (const b of positions) b.classList.toggle('active', b.dataset.position === s.memoPosition);
    output.classList.toggle('active', s.memoOutput);
    output.title = s.memoOutput ? 'Shown on the video output: click to hide' : 'Hidden on the video output: click to show';
  }

  /** Call every frame with the memo to show. */
  function render(memo: string): void {
    stage.render(memo, app.project.settings);
  }

  return { element, update, render };
}
