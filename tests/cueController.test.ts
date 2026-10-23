import { describe, expect, it } from 'vitest';
import { go, initialCueState, passed, reconcile, select, type CueState } from '../src/cue/cueController';
import { addMarker, removeMarker } from '../src/model/markers';
import { addPage, createPage, createProject, replacePage } from '../src/model/project';
import type { Page, Project } from '../src/model/types';

const page = (id: string, ...times: number[]): Page => {
  let p = createPage(id, id);
  times.forEach((t, i) => {
    p = addMarker(p, t, 1000, () => `${id}${i + 1}`).page;
  });
  return p;
};

const project = (...pages: Page[]): Project => {
  let pr = createProject(pages[0]);
  for (const p of pages.slice(1)) pr = addPage(pr, p);
  return { ...pr, currentPageId: pages[0].id };
};

/** Presses GO repeatedly and collects the actions. */
const run = (pr: Project, state: CueState, times: number) => {
  const actions = [];
  for (let i = 0; i < times; i++) {
    const result = go(pr, state);
    actions.push(result.action);
    state = result.state;
  }
  return { actions, state };
};

describe('initialCueState', () => {
  it('stands by on the first cue', () => {
    expect(initialCueState(project(page('a', 20, 10)), 'a')).toEqual({
      pageId: 'a',
      standby: { kind: 'cue', markerId: 'a2' },
    });
  });

  it('stands by on the page start when there are no markers', () => {
    expect(initialCueState(project(page('a')), 'a').standby).toEqual({ kind: 'pageStart' });
  });
});

describe('go', () => {
  it('fires cues in order, then moves to the next page', () => {
    const pr = project(page('a', 10, 20), page('b', 5, 15));
    const { actions, state } = run(pr, initialCueState(pr, 'a'), 4);
    expect(actions).toEqual([
      { kind: 'seekAndPlay', time: 10 },
      { kind: 'seekAndPlay', time: 20 },
      { kind: 'loadPageAndPlay', pageId: 'b', time: 5 },
      { kind: 'seekAndPlay', time: 15 },
    ]);
    expect(state).toEqual({ pageId: 'b', standby: { kind: 'none' } });
  });

  it('shows next page as the standby after the last cue', () => {
    const pr = project(page('a', 10), page('b', 5));
    expect(go(pr, initialCueState(pr, 'a')).state.standby).toEqual({ kind: 'nextPage' });
  });

  it('does nothing after the last cue of the last page', () => {
    const pr = project(page('a', 10));
    const { actions } = run(pr, initialCueState(pr, 'a'), 3);
    expect(actions).toEqual([{ kind: 'seekAndPlay', time: 10 }, { kind: 'none' }, { kind: 'none' }]);
  });

  it('plays a page without markers from the start', () => {
    const pr = project(page('a'), page('b'), page('c', 7));
    const { actions, state } = run(pr, initialCueState(pr, 'a'), 3);
    expect(actions).toEqual([
      { kind: 'seekAndPlay', time: 0 },
      { kind: 'loadPageAndPlay', pageId: 'b', time: 0 },
      { kind: 'loadPageAndPlay', pageId: 'c', time: 7 },
    ]);
    expect(state.standby).toEqual({ kind: 'none' });
  });
});

describe('select', () => {
  it('makes the clicked cue the standby', () => {
    const pr = project(page('a', 10, 20, 30));
    const state = select(initialCueState(pr, 'a'), 'a3');
    expect(go(pr, state).action).toEqual({ kind: 'seekAndPlay', time: 30 });
  });
});

describe('reconcile', () => {
  it('moves the standby to the following cue when its marker is removed', () => {
    const before = project(page('a', 10, 20, 30));
    const state = select(initialCueState(before, 'a'), 'a2');
    const after = replacePage(before, removeMarker(before.pages[0], 'a2'));
    expect(reconcile(after, state, before.pages[0].markers).standby).toEqual({
      kind: 'cue',
      markerId: 'a3',
    });
  });

  it('falls back to after-last when the removed cue was last', () => {
    const before = project(page('a', 10, 20), page('b'));
    const state = select(initialCueState(before, 'a'), 'a2');
    const after = replacePage(before, removeMarker(before.pages[0], 'a2'));
    expect(reconcile(after, state, before.pages[0].markers).standby).toEqual({ kind: 'nextPage' });
  });

  it('falls back to the page start when no markers remain', () => {
    const before = project(page('a', 10));
    const state = initialCueState(before, 'a');
    const after = replacePage(before, removeMarker(before.pages[0], 'a1'));
    expect(reconcile(after, state, before.pages[0].markers).standby).toEqual({ kind: 'pageStart' });
  });

  it('stands by on the first cue once a marker is added to an empty page', () => {
    const before = project(page('a'));
    const state = initialCueState(before, 'a');
    const after = replacePage(before, page('a', 4));
    expect(reconcile(after, state, []).standby).toEqual({ kind: 'cue', markerId: 'a1' });
  });

  it('resets when the current page was changed by hand', () => {
    const pr = project(page('a', 10), page('b', 5));
    const state = initialCueState(pr, 'a');
    expect(reconcile({ ...pr, currentPageId: 'b' }, state, [])).toEqual(initialCueState(pr, 'b'));
  });
});

describe('looping all pages', () => {
  const looped = (pr: Project): Project => ({ ...pr, settings: { ...pr.settings, loopPages: true } });

  it('goes from the last page back to the first', () => {
    const pr = looped(project(page('a', 10), page('b', 5)));
    const { actions, state } = run(pr, initialCueState(pr, 'a'), 4);
    expect(actions).toEqual([
      { kind: 'seekAndPlay', time: 10 },
      { kind: 'loadPageAndPlay', pageId: 'b', time: 5 },
      { kind: 'loadPageAndPlay', pageId: 'a', time: 10 },
      { kind: 'loadPageAndPlay', pageId: 'b', time: 5 },
    ]);
    expect(state.standby).toEqual({ kind: 'nextPage' });
  });

  it('repeats a single page', () => {
    const pr = looped(project(page('a', 3)));
    const { actions } = run(pr, initialCueState(pr, 'a'), 2);
    expect(actions[1]).toEqual({ kind: 'loadPageAndPlay', pageId: 'a', time: 3 });
  });
});

describe('in / out points', () => {
  const ranged = (p: Page, rangeStart: number | null, rangeEnd: number | null): Page => ({ ...p, rangeStart, rangeEnd });

  it('stands by on the first cue inside the range and skips the rest', () => {
    const pr = project(ranged(page('a', 10, 20, 30, 40), 15, 40), page('b'));
    const state = initialCueState(pr, 'a');
    expect(state.standby).toEqual({ kind: 'cue', markerId: 'a2' });
    const { actions, state: after } = run(pr, state, 2);
    expect(actions).toEqual([
      { kind: 'seekAndPlay', time: 20 },
      { kind: 'seekAndPlay', time: 30 },
    ]);
    // The cue on the out point is skipped too.
    expect(after.standby).toEqual({ kind: 'nextPage' });
  });

  it('plays a page without cues in its range from the in point', () => {
    const pr = project(ranged(page('a', 5), 12, null), ranged(page('b'), 8, null));
    expect(go(pr, initialCueState(pr, 'a')).action).toEqual({ kind: 'seekAndPlay', time: 12 });
    expect(go(pr, { pageId: 'a', standby: { kind: 'nextPage' } }).action).toEqual({
      kind: 'loadPageAndPlay',
      pageId: 'b',
      time: 8,
    });
  });

  it('keeps a cue picked by hand outside the range on standby', () => {
    const pr = project(ranged(page('a', 5, 20), 10, null));
    const state = select(initialCueState(pr, 'a'), 'a1');
    expect(reconcile(pr, state, pr.pages[0].markers)).toEqual(state);
    expect(go(pr, state)).toEqual({
      state: { pageId: 'a', standby: { kind: 'cue', markerId: 'a2' } },
      action: { kind: 'seekAndPlay', time: 5 },
    });
  });
});

describe('passed', () => {
  it('stands by on the cue after the one playback ran through', () => {
    const pr = project(page('a', 10, 20, 30), page('b'));
    const state = select(initialCueState(pr, 'a'), 'a3');
    expect(passed(pr, state, 'a1').standby).toEqual({ kind: 'cue', markerId: 'a2' });
    expect(passed(pr, state, 'a3').standby).toEqual({ kind: 'nextPage' });
  });
});
