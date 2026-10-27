import { editKey, editorSnapshot, restoredFiles } from './persistence.mjs';
import { manifestForRoute, lessonAt, normalizeRoute } from './manifest.mjs';
import { NOTHING_TO_EDIT, WORKSPACE_PANEL, nothingToEdit } from './editing.mjs';

export const DISCONNECTED = 'Course metadata unavailable; saved edits and the tutor are disconnected. Reload the page; if this stays, check the launcher\'s terminal for an export error.';
export const EDITS_SAVED = 'Edits saved in this browser';
export const STORAGE_UNAVAILABLE = 'Browser storage unavailable; edits will not survive reopening';

// Binds the Tutor drawer to each page TutorialKit shows: the page's lesson from its course
// manifest, and its edits saved in this browser. `page` is the document, `view` the window and
// `store` TutorialKit's tutorialStore. `ui` receives `reset(route)`, `bind(lesson)`, `status(text)`
// and `unavailable()` (the page belongs to a course whose metadata can't be bound). Returns the
// function that stops it.
//
// After an in-app move, the store still holds the previous page's lesson (its files, loaded flag
// and editor) until the new page's workspace calls setLesson from a React effect. That can happen
// after this page's manifest arrives, so a page with a workspace binds nothing while the store
// still holds the lesson it held when the page was swapped in.
export function followLessonPages({ store, page, view, fetcher, ui }) {
  const route = () => view.location.pathname.replace(/\/$/, '') || '/';
  const NONE = {};
  let swapped = null;
  let previousLesson = NONE;
  let disposed = false;
  let manifest = null;
  let manifestRoute = '';
  let loadSequence = 0;
  let unsubscribeDocuments = () => {};
  let flush = () => {};
  let timer;
  let currentKey = '';

  const unavailable = () => {
    ui.unavailable();
    ui.status(DISCONNECTED);
  };
  const stopSaving = () => {
    clearTimeout(timer);
    unsubscribeDocuments();
    unsubscribeDocuments = () => {};
    flush();
    flush = () => {};
  };
  const activate = () => {
    if (!manifest || manifestRoute !== route() || disposed) return;
    const pathname = route();
    const lesson = lessonAt(manifest, pathname);
    if (store.lesson === previousLesson && page.querySelector(WORKSPACE_PANEL)) return;
    if (lesson && nothingToEdit(page, store)) {
      // A reading lesson has no editor, so nothing is saved; say so instead of leaving the line blank.
      stopSaving();
      currentKey = '';
      ui.status(NOTHING_TO_EDIT);
      return;
    }
    if (!store.lessonFullyLoaded.get()) return;
    const key = editKey(manifest.course_digest, pathname);
    if (currentKey === key) return;
    stopSaving();
    currentKey = key;
    if (!lesson) return;
    try {
      for (const [path, text] of restoredFiles(view.localStorage.getItem(key), store.documents.get())) {
        store.updateFile(path, text);
      }
      view.localStorage.setItem(`forge-tutorialkit:resume:${manifest.course_digest}`, pathname);
      ui.status(EDITS_SAVED);
    } catch {
      ui.status(STORAGE_UNAVAILABLE);
    }
    // Capture each edit synchronously; unload must not read a different lesson's store.
    let saved = editorSnapshot(store);
    flush = () => {
      try {
        view.localStorage.setItem(key, JSON.stringify({ version: 1, files: saved }));
      } catch {
        if (!disposed) ui.status(STORAGE_UNAVAILABLE);
      }
    };
    unsubscribeDocuments = store.documents.subscribe(() => {
      if (!store.lessonFullyLoaded.get()) return;
      saved = editorSnapshot(store);
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
  };
  const changed = async () => {
    const pathname = route();
    const sequence = ++loadSequence;
    // The same route keeps its lesson: TutorialKit's workspace sets no new one when its props match.
    previousLesson = swapped && swapped.from !== pathname ? swapped.lesson : NONE;
    swapped = null;
    stopSaving();
    currentKey = '';
    manifest = null;
    manifestRoute = '';
    ui.reset(pathname);
    try {
      let claimed = false;
      const loaded = await manifestForRoute(pathname, fetcher, () => { claimed = true; });
      if (disposed || sequence !== loadSequence || pathname !== route()) return;
      if (claimed) {
        unavailable();
        return;
      }
      manifest = loaded;
      manifestRoute = pathname;
      // Reading and tutoring need source context even when no editor starts.
      ui.bind(lessonAt(loaded, pathname) || null);
      activate();
    } catch {
      if (!disposed && sequence === loadSequence) unavailable();
    }
  };
  // A back or forward move has already changed the address here, so read where it came from.
  const beforeSwap = (event) => { swapped = { from: normalizeRoute(event.from.pathname), lesson: store.lesson }; };
  const unsubscribeLoaded = store.lessonFullyLoaded.subscribe((loaded) => {
    if (loaded) activate();
    else { stopSaving(); currentKey = ''; }
  });
  changed();
  page.addEventListener('astro:before-swap', beforeSwap);
  page.addEventListener('astro:page-load', changed);
  view.addEventListener('pagehide', stopSaving);
  return () => {
    disposed = true;
    stopSaving();
    unsubscribeLoaded();
    page.removeEventListener('astro:before-swap', beforeSwap);
    page.removeEventListener('astro:page-load', changed);
    view.removeEventListener('pagehide', stopSaving);
  };
}
