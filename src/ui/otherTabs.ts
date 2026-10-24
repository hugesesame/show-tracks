import { h } from './dom';

/** Tabs of the app find each other here; nothing leaves the browser. */
const CHANNEL = 'show-tracks-tabs';

/**
 * A warning shown while the app is open in more than one tab or window of this
 * browser: they share one saved show, so each would save over the other's edits.
 */
export function createOtherTabsWarning() {
  const element = h(
    'div',
    { class: 'tab-warning', hidden: true, role: 'alert' },
    '⚠ Show Tracks is open in another tab. Each tab saves over the other’s edits: close all but one.',
  );
  if (!('BroadcastChannel' in window)) return { element };

  const channel = new BroadcastChannel(CHANNEL);
  const me = crypto.randomUUID();
  const others = new Set<string>();
  const show = () => (element.hidden = others.size === 0);
  channel.onmessage = (e: MessageEvent<{ type: 'hello' | 'here' | 'bye'; id: string }>) => {
    const { type, id } = e.data;
    if (type === 'bye') others.delete(id);
    else others.add(id);
    // A tab that just opened learns about this one.
    if (type === 'hello') channel.postMessage({ type: 'here', id: me });
    show();
  };
  const hello = () => channel.postMessage({ type: 'hello', id: me });
  hello();
  window.addEventListener('pagehide', () => channel.postMessage({ type: 'bye', id: me }));
  // Coming back from the back / forward cache, say hello again.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) hello();
  });
  return { element };
}
