import type { App } from '../app/app';
import type { MemoPosition } from '../model/types';
import { h } from './dom';
import { createMemoStage } from './memoStage';

const POSITIONS: { position: MemoPosition; label: string }[] = [
  { position: 'top', label: 'Top' },
  { position: 'middle', label: 'Middle' },
  { position: 'bottom', label: 'Bottom' },
];

const CONTROLS_KEY = 'cue-player-memo-controls';

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
  const outlineOn = h('button', {
    type: 'button',
    class: 'small memo-switch',
    onclick: () => app.setMemoLook({ memoOutlineOn: !app.project.settings.memoOutlineOn }),
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
    class: 'small memo-switch',
    onclick: () => app.setMemoLook({ memoFadeOn: !app.project.settings.memoFadeOn }),
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
  // Whether the memos sit over the video on the video output; the prompter always shows them.
  const onVideo = h('button', {
    type: 'button',
    class: 'small memo-switch',
    onclick: () => app.setMemoLook({ memoOutput: !app.project.settings.memoOutput }),
  });
  const controls = h(
    'div',
    { class: 'memo-controls' },
    // One slider per line behind labels of one width, so the sliders line up.
    sliderRow('Aa', size, color),
    sliderRow('Edge', outline, outlineColor, outlineOn),
    sliderRow('Fade', fade, fadeValue, fadeOn),
    h(
      'div',
      { class: 'memo-group' },
      h('span', { class: 'memo-label' }, 'Video'),
      h('span', { class: 'memo-row-text' }, 'Memo on Video Output'),
      onVideo,
    ),
    h('div', { class: 'memo-group memo-positions' }, ...positions),
  );
  // The settings fold away, leaving the room to the screen.
  let controlsShown = true;
  try {
    controlsShown = localStorage.getItem(CONTROLS_KEY) !== 'hidden';
  } catch {
    // Starting with the settings shown is fine.
  }
  const controlsToggle = h('button', {
    type: 'button',
    class: 'small memo-controls-toggle',
    onclick: () => {
      controlsShown = !controlsShown;
      try {
        localStorage.setItem(CONTROLS_KEY, controlsShown ? 'shown' : 'hidden');
      } catch {
        // Not remembering it is fine.
      }
      showControls();
    },
  }, '⚙');
  function showControls(): void {
    controls.hidden = !controlsShown;
    controlsToggle.classList.toggle('active', controlsShown);
    controlsToggle.title = controlsShown ? 'Hide the memo settings' : 'Show the memo settings';
  }
  showControls();
  const element = h(
    'div',
    { class: 'memo-view' },
    controlsToggle,
    controls,
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
    switchButton(outlineOn, s.memoOutlineOn, 'Outline');
    // Show mode locks the look; off switches lock their own row.
    const show = app.showMode;
    for (const control of [size, color, outlineOn, fadeOn, onVideo, ...positions]) control.disabled = show;
    outline.disabled = outlineColor.disabled = show || !s.memoOutlineOn;
    fade.value = String(s.memoFade);
    fade.style.setProperty('--fill', String(s.memoFade / Number(fade.max)));
    fadeValue.textContent = `${s.memoFade.toFixed(1)}s`;
    switchButton(fadeOn, s.memoFadeOn, 'Dissolve');
    fade.disabled = show || !s.memoFadeOn;
    fadeValue.classList.toggle('off', !s.memoFadeOn);
    for (const b of positions) b.classList.toggle('active', b.dataset.position === s.memoPosition);
    switchButton(onVideo, s.memoOutput, 'Memo on Video Output');
    onVideo.title = s.memoOutput
      ? 'The memos show over the video on the video output: click to hide them there (the prompter always shows them)'
      : 'The video output shows the video alone: click to show the memos over it (the prompter always shows them)';
  }

  /** Call every frame with the memo to show. */
  function render(memo: string): void {
    stage.render(memo, app.project.settings);
  }

  return { element, update, render };
}

function sliderRow(label: string, slider: HTMLInputElement, ...after: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'memo-group' },
    h('span', { class: 'memo-label' }, label),
    h('div', { class: 'volume-wrap memo-size' }, slider),
    ...after,
  );
}

/** An On / Off button; off keeps the row's values for when it is turned back on. */
function switchButton(button: HTMLButtonElement, on: boolean, what: string): void {
  button.textContent = on ? 'On' : 'Off';
  button.classList.toggle('active', on);
  button.title = `${what} ${on ? 'on' : 'off'}: click to turn it ${on ? 'off' : 'on'}`;
}
