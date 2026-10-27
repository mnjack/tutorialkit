import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as settle } from 'node:timers/promises';
import { followLessonPages, DISCONNECTED, EDITS_SAVED } from './drawerSession.mjs';
import { NOTHING_TO_EDIT, WORKSPACE_PANEL } from './editing.mjs';
import { editKey } from './persistence.mjs';

const digest = 'a'.repeat(64);
const lessons = {
  '/c/m/a': { course_slug: 'c', lesson_id: 'a', title: 'A', files: { '/main.js': 'A template' } },
  '/c/m/b': { course_slug: 'c', lesson_id: 'b', title: 'B', files: { '/main.js': 'B template' } },
  '/c/m/reading': { course_slug: 'c', lesson_id: 'reading', title: 'Reading' },
};
const site = {
  '/forge-courses.json': { courses: { c: { manifest_path: '/c.json', digest, routes: Object.keys(lessons) } } },
  '/c.json': { schema_version: 1, course_digest: digest, lessons },
};
const fetcher = async (path) => ({ ok: path in site, status: path in site ? 200 : 404, json: async () => structuredClone(site[path]) });

// A nanostores atom: subscribe calls the listener at once, and set notifies only on a change.
function atom(value) {
  const listeners = new Set();
  return {
    get: () => value,
    set(next) { if (next !== value) { value = next; for (const listener of [...listeners]) listener(value); } },
    subscribe(listener) { listeners.add(listener); listener(value); return () => listeners.delete(listener); },
  };
}

// TutorialKit's tutorialStore, in the order its setLesson works: not loaded, the new lesson's files
// still loading, then its files and fully loaded. A page's workspace calls setLesson from a React
// effect, which can run before or after the drawer's manifest request returns.
function tutorialStore() {
  const store = {
    lesson: undefined,
    lessonFullyLoaded: atom(false),
    documents: atom({}),
    hasEditor: () => true,
    takeSnapshot: () => ({ files: {} }),
    updateFile(path, value) { store.documents.set({ ...store.documents.get(), [path]: { type: 'file', loading: false, value } }); },
    setLesson(route) {
      store.lesson = { route };
      store.lessonFullyLoaded.set(false);
      store.documents.set(Object.fromEntries(Object.keys(lessons[route].files).map((path) => [path, { type: 'file', loading: true }])));
    },
    finishLoading() {
      const { files } = lessons[store.lesson.route];
      store.documents.set(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { type: 'file', loading: false, value }])));
      store.lessonFullyLoaded.set(true);
    },
  };
  return store;
}

function app(start) {
  const storage = new Map();
  const view = Object.assign(new EventTarget(), {
    location: { pathname: start },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  });
  const page = Object.assign(new EventTarget(), {
    workspace: Boolean(lessons[start].files),
    querySelector(selector) { return page.workspace && selector === WORKSPACE_PANEL ? {} : null; },
  });
  const store = tutorialStore();
  const drawer = { status: '', binding: null };
  const ui = {
    reset() { Object.assign(drawer, { status: '', binding: null, unavailable: false }); },
    bind(binding) { drawer.binding = binding; },
    status(text) { drawer.status = text; },
    unavailable() { drawer.unavailable = true; },
  };
  // Astro's client router: before-swap, swap the page (a persisted workspace gets the new lesson's
  // props, and its setLesson effect may run any time after this), move the address, then page-load.
  // A back or forward move changes the address before the router starts.
  const swap = (to, { traverse = false } = {}) => {
    const from = view.location.pathname;
    if (traverse) view.location.pathname = to;
    const before = new Event('astro:before-swap');
    Object.assign(before, { from: new URL(from, 'http://127.0.0.1'), to: new URL(to, 'http://127.0.0.1') });
    page.dispatchEvent(before);
    page.workspace = Boolean(lessons[to].files);
    view.location.pathname = to;
  };
  const pageLoad = () => page.dispatchEvent(new Event('astro:page-load'));
  const navigate = (to, options) => { swap(to, options); pageLoad(); };
  const saved = (route) => JSON.parse(storage.get(editKey(digest, route)) ?? '{"files":{}}').files;
  return { store, page, view, drawer, swap, pageLoad, navigate, saved, start: () => followLessonPages({ store, page, view, fetcher, ui }) };
}

async function openOnA() {
  const tk = app('/c/m/a');
  tk.store.setLesson('/c/m/a');
  tk.store.finishLoading();
  const stop = tk.start();
  await settle();
  assert.equal(tk.drawer.binding.lesson_id, 'a');
  assert.equal(tk.drawer.status, EDITS_SAVED);
  tk.store.updateFile('/main.js', 'A edited');
  return { tk, stop };
}

for (const order of ['manifest first', 'lesson first', 'back button, manifest first']) {
  test(`moving between two lessons with editors keeps each lesson's edits apart (${order})`, async () => {
    const { tk, stop } = await openOnA();
    tk.swap('/c/m/b', { traverse: order.startsWith('back') });
    if (order === 'lesson first') tk.store.setLesson('/c/m/b');
    tk.pageLoad();
    await settle(); // the drawer's manifest for B has loaded
    if (order !== 'lesson first') tk.store.setLesson('/c/m/b');
    await settle();
    tk.store.finishLoading();
    await settle();
    assert.equal(tk.drawer.binding.lesson_id, 'b');
    assert.equal(tk.drawer.status, EDITS_SAVED);
    assert.equal(tk.store.documents.get()['/main.js'].value, 'B template');
    assert.deepEqual(tk.saved('/c/m/a'), { '/main.js': 'A edited' });
    assert.notEqual(tk.saved('/c/m/b')['/main.js'], 'A edited');
    tk.store.updateFile('/main.js', 'B edited');
    tk.view.dispatchEvent(new Event('pagehide'));
    assert.deepEqual(tk.saved('/c/m/b'), { '/main.js': 'B edited' });
    assert.deepEqual(tk.saved('/c/m/a'), { '/main.js': 'A edited' });
    stop();
  });
}

test('via a reading page, the next editor lesson waits for its own files (manifest first)', async () => {
  const { tk, stop } = await openOnA();
  tk.navigate('/c/m/reading');
  await settle();
  assert.equal(tk.drawer.status, 'Nothing to edit on this page'); // D59
  assert.equal(tk.drawer.status, NOTHING_TO_EDIT);
  assert.deepEqual(tk.saved('/c/m/a'), { '/main.js': 'A edited' });
  tk.navigate('/c/m/b');
  await settle(); // the store still holds A: the reading page had no workspace to replace it
  tk.store.setLesson('/c/m/b');
  tk.store.finishLoading();
  await settle();
  assert.equal(tk.drawer.status, EDITS_SAVED);
  assert.equal(tk.store.documents.get()['/main.js'].value, 'B template');
  assert.notEqual(tk.saved('/c/m/b')['/main.js'], 'A edited');
  stop();
});

test('navigating to the page already shown keeps saving its edits', async () => {
  // The same lesson's props are unchanged, so TutorialKit's workspace calls no setLesson.
  const { tk, stop } = await openOnA();
  tk.navigate('/c/m/a');
  await settle();
  assert.equal(tk.drawer.status, EDITS_SAVED);
  tk.store.updateFile('/main.js', 'A edited again');
  tk.view.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(tk.saved('/c/m/a'), { '/main.js': 'A edited again' });
  stop();
});

test('a reload restores the lesson its edits were saved for', async () => {
  const { tk, stop } = await openOnA();
  tk.view.dispatchEvent(new Event('pagehide'));
  stop();
  const reopened = app('/c/m/a');
  for (const [key, value] of [[editKey(digest, '/c/m/a'), JSON.stringify({ version: 1, files: tk.saved('/c/m/a') })]]) {
    reopened.view.localStorage.setItem(key, value);
  }
  reopened.store.setLesson('/c/m/a');
  const stopAgain = reopened.start();
  await settle();
  reopened.store.finishLoading();
  await settle();
  assert.equal(reopened.store.documents.get()['/main.js'].value, 'A edited');
  stopAgain();
});

test('a course page whose manifest is missing says the tutor is disconnected, and saves nothing', async () => {
  const { tk, stop } = await openOnA();
  const manifest = site['/c.json'];
  delete site['/c.json'];
  try {
    tk.navigate('/c/m/b');
    tk.store.setLesson('/c/m/b');
    tk.store.finishLoading();
    await settle();
    assert.deepEqual([tk.drawer.unavailable, tk.drawer.status, tk.drawer.binding], [true, DISCONNECTED, null]);
    tk.store.updateFile('/main.js', 'B edited');
    tk.view.dispatchEvent(new Event('pagehide'));
    assert.deepEqual(tk.saved('/c/m/b'), {});
  } finally {
    site['/c.json'] = manifest;
    stop();
  }
});

test('the Tutor drawer follows lesson pages through this module', () => {
  const tools = readFileSync(new URL('./ForgeTools.tsx', import.meta.url), 'utf8');
  assert.match(tools, /followLessonPages\(\{/);
  assert.match(tools, /status: setSaveStatus/);
  assert.doesNotMatch(tools, /localStorage|lessonFullyLoaded|astro:page-load/);
});

test('the disconnected status names the next step', () => {
  assert.match(DISCONNECTED, /disconnected\. Reload the page; if this stays, check the launcher's terminal for an export error\.$/);
});

test('the drawer announces its status line and hides it while empty', () => {
  const tools = readFileSync(new URL('./ForgeTools.tsx', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../../theme.css', import.meta.url), 'utf8');
  assert.equal(tools.match(/\{saveStatus\}/g).length, 1);
  assert.match(tools, /<p role="status" aria-live="polite">\{saveStatus\}<\/p>/);
  assert.match(theme, /\.forge-tutor p:empty \{ display: none; \}/);
  assert.match(theme, /\.forge-tutor \{[^}]*overscroll-behavior: contain;/);
});
