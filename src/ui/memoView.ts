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
  const outline = h('input', {
    class: 'volume',
    type: 'range',
    min: 0,
    max: 0.25,
    step: 0.01,
    title: 'Outline width',
    oninput: () => app.setMemoLook({ memoOutline: Number(outline.value) }),
  });
  const outlineColor = h('input', {
    class: 'memo-color',
    type: 'color',
    title: 'Outline colour',
    oninput: () => app.setMemoLook({ memoOutlineColor: outlineColor.value }),
  });
  const fade = h('input', {
    class: 'volume',
    type: 'range',
    min: 0,
    max: 3,
    step: 0.1,
    title: 'Dissolve between memos',
    oninput: () => app.setMemoLook({ memoFade: Number(fade.value) }),
  });
  const fadeValue = h('span', { class: 'memo-fade-value' });
  const fadeOn = h('button', {
    type: 'button',
    class: 'small',
    onclick: () => app.setMemoLook({ memoFadeOn: !app.project.settings.memoFadeOn }),
  }, 'Fade');
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
    h(
      'div',
      { class: 'memo-controls' },
      // Each group stays on one line; the groups wrap when the monitor is narrow.
      h('div', { class: 'memo-group' }, h('span', { class: 'memo-label' }, 'Aa'), h('div', { class: 'volume-wrap memo-size' }, size), color),
      h(
        'div',
        { class: 'memo-group' },
        h('span', { class: 'memo-label' }, 'Edge'),
        h('div', { class: 'volume-wrap memo-size' }, outline),
        outlineColor,
      ),
      h('div', { class: 'memo-group' }, fadeOn, h('div', { class: 'volume-wrap memo-size' }, fade), fadeValue),
      h('div', { class: 'memo-group memo-positions' }, ...positions),
      output,
    ),
    // Framed like the video output, so the text sits and scales as it does there.
    h('div', { class: 'memo-screen-area' }, h('div', { class: 'screen' }, stage.element)),
  );

  function update(): void {
    const s = app.project.settings;
    size.value = String(s.memoSize);
    size.style.setProperty('--fill', String((s.memoSize - Number(size.min)) / (Number(size.max) - Number(size.min))));
    color.value = s.memoColor;
    outline.value = String(s.memoOutline);
    outline.style.setProperty('--fill', String(s.memoOutline / Number(outline.max)));
    outlineColor.value = s.memoOutlineColor;
    fade.value = String(s.memoFade);
    fade.style.setProperty('--fill', String(s.memoFade / Number(fade.max)));
    fadeValue.textContent = `${s.memoFade.toFixed(1)}s`;
    fadeOn.classList.toggle('active', s.memoFadeOn);
    fadeOn.title = s.memoFadeOn ? 'Dissolve on: click to cut straight to the next memo' : 'Dissolve off: click to turn it on';
    fade.disabled = !s.memoFadeOn;
    fadeValue.classList.toggle('off', !s.memoFadeOn);
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
