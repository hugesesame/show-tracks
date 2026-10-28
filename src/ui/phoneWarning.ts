import { APP_NAME } from '../config';
import { h } from './dom';

const DISMISSED_KEY = 'cue-player-phone-warning-dismissed';

/** A phone, from the browser's own answer where it gives one, else from its name. */
function isPhone(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData;
  if (data?.mobile) return true;
  return /iPhone|iPod|Android.+Mobile|Mobile.+Firefox/i.test(navigator.userAgent);
}

/**
 * A caution over the whole screen on a phone: the app is made for desktop Chrome.
 * It can be passed by, and stays away for the rest of the visit.
 */
export function createPhoneWarning(): HTMLElement | null {
  if (!isPhone()) return null;
  try {
    if (sessionStorage.getItem(DISMISSED_KEY)) return null;
  } catch {
    // Showing it again is fine.
  }
  const element = h(
    'div',
    { class: 'phone-warning', role: 'alertdialog', 'aria-labelledby': 'phone-warning-title' },
    h(
      'div',
      { class: 'phone-warning-box' },
      h('div', { class: 'phone-warning-title', id: 'phone-warning-title' }, `⚠ ${APP_NAME} is made for a computer`),
      h(
        'p',
        {},
        'It needs Chrome on a Mac or PC, with a keyboard and a larger screen. On a phone, the screen is too small to work with, and MIDI, MTC and the video output may not work.',
      ),
      h('p', {}, 'Open this page on your computer:'),
      h('div', { class: 'phone-warning-url' }, location.origin + location.pathname),
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            try {
              sessionStorage.setItem(DISMISSED_KEY, '1');
            } catch {
              // It shows again next time.
            }
            element.remove();
          },
        },
        'Continue Anyway',
      ),
    ),
  );
  return element;
}
