import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editKey, editorSnapshot, restoredFiles } from './persistence.mjs';

test('reopen isolates exported versions and routes', () => {
  assert.notEqual(editKey('old', '/lesson'), editKey('new', '/lesson'));
  assert.notEqual(editKey('same', '/one'), editKey('same', '/two'));
  assert.equal(editKey('same', '/one/'), editKey('same', '/one'));
});
test('save uses latest visible editor text even before native filesystem writes finish', () => {
  const store = {
    takeSnapshot: () => ({ files: { 'main.js': 'old', 'package.json': 'template' } }),
    documents: { get: () => ({ '/main.js': { type: 'file', value: 'new', loading: false }, '/image.png': { type: 'file', value: new Uint8Array([1]), loading: false } }) },
  };
  assert.deepEqual(editorSnapshot(store), { '/main.js': 'new' });
});
test('restore cannot inject files outside the current native editable lesson', () => {
  const saved = JSON.stringify({ version: 1, files: { '/main.js': 'edited', '/unlisted.js': 'injected', '/folder': 'bad' } });
  assert.deepEqual(restoredFiles(saved, { '/main.js': { type: 'file', loading: false }, '/folder': { type: 'folder' } }), [['/main.js', 'edited']]);
});
