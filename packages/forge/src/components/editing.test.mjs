import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSPACE_PANEL, nothingToEdit } from './editing.mjs';

const page = (workspace) => ({ querySelector: (selector) => (workspace && selector === WORKSPACE_PANEL ? {} : null) });
const store = (loaded, editor) => ({ lessonFullyLoaded: { get: () => loaded }, hasEditor: () => editor });

test('a reading lesson has nothing to edit, whatever lesson the store last loaded', () => {
  for (const [loaded, editor] of [[false, false], [true, true], [true, false]]) {
    assert.equal(nothingToEdit(page(false), store(loaded, editor)), true);
  }
});

test('a lesson with an editor has something to edit, before and after it loads', () => {
  assert.equal(nothingToEdit(page(true), store(false, true)), false);
  assert.equal(nothingToEdit(page(true), store(true, true)), false);
});

test('a loaded lesson whose workspace hides the editor has nothing to edit', () => {
  assert.equal(nothingToEdit(page(true), store(true, false)), true);
});

test("the workspace selector matches TutorialKit's main panel markup", () => {
  const astro = (path) => readFileSync(new URL(`../../../astro/src/default/${path}`, import.meta.url), 'utf8');
  assert.match(astro('utils/constants.ts'), /Main: 'main'/);
  assert.match(astro('components/MainContainer.astro'), /id=\{RESIZABLE_PANELS\.Main\}/);
  const panel = astro('components/ResizablePanel.astro');
  for (const part of ['<resizable-panel', 'data-id={id}', 'data-id="container"', 'data-id="side-panel"']) {
    assert.ok(panel.includes(part), part);
  }
});
