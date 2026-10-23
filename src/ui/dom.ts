type Props = Record<string, unknown> & { class?: string };

/** Small element builder: properties starting with "on" become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child !== null && child !== false) el.append(child);
  return el;
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

/** True while the user is typing somewhere, so shortcuts should stay out of the way. */
export function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'file'].includes(target.type);
  }
  return false;
}

const DELETE_CONFIRM_MS = 3000;

/** A trash button that asks "Delete?" first, instead of a blocking confirm() dialog. */
export function deleteButton(title: string, onDelete: () => void): HTMLButtonElement {
  let armed: ReturnType<typeof setTimeout> | undefined;
  const button = h('button', { class: 'small', title }, '🗑');
  const disarm = () => {
    clearTimeout(armed);
    armed = undefined;
    button.textContent = '🗑';
    button.classList.remove('active');
  };
  button.addEventListener('click', () => {
    if (armed) {
      disarm();
      onDelete();
      return;
    }
    button.textContent = 'Delete?';
    button.classList.add('active');
    armed = setTimeout(disarm, DELETE_CONFIRM_MS);
  });
  return button;
}

/** An "Auto" scroll switch, on unless turned off; remembered in this browser under `key`. */
export function autoScrollButton(key: string) {
  let on = true;
  try {
    on = localStorage.getItem(key) !== 'off';
  } catch {
    // Starting with it on is fine.
  }
  const button = h('button', {
    class: 'small auto-scroll',
    onclick: () => {
      on = !on;
      try {
        localStorage.setItem(key, on ? 'on' : 'off');
      } catch {
        // Not remembering it is fine.
      }
      show();
    },
  }, 'Auto');
  function show(): void {
    button.classList.toggle('active', on);
    button.title = on ? 'Auto scroll: on (follows playback)' : 'Auto scroll: off';
  }
  show();
  return { button, isOn: () => on };
}
