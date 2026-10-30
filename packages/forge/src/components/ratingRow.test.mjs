import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RatingRow, NOTE_REFUSED, noteChange } from './ratingRow.mjs';

const REASONS = [
  { id: 'wrong_fact', label: 'Wrong fact' }, { id: 'sounds_like_ai', label: 'Sounds like AI' },
  { id: 'more_like_this', label: 'More like this' },
];
const block = { id: 'blk-1', kind: 'section', name: 'Why a retry repeats' };
const row = (props) => renderToStaticMarkup(h(RatingRow, {
  block, reasons: REASONS, rating: undefined, line: '', named: false, guard: () => false,
  onVote() {}, onReason() {}, onNote() {}, ...props,
}));

test('a row shows the two thumbs, named for its block, and no chips before a press', () => {
  const html = row({});
  assert.match(html, /class="forge-rating"/);
  assert.match(html, /aria-label="Thumbs up: Why a retry repeats"/);
  assert.match(html, /aria-label="Thumbs down: Why a retry repeats"/);
  assert.match(html, /Rate this section/);
  assert.doesNotMatch(html, /Sounds like AI/);
  assert.doesNotMatch(html, /textarea/);
});

test('after a press the reason chips and the optional note appear inline', () => {
  const html = row({ rating: { vote: 'down', reasons: ['sounds_like_ai'], note: '' }, line: 'Saved.' });
  assert.match(html, /aria-label="Thumbs down: Why a retry repeats" aria-pressed="true"/);
  for (const { label } of REASONS) assert.match(html, new RegExp(`>${label}</button>`));
  assert.match(html, /aria-pressed="true"[^>]*>Sounds like AI</);
  assert.match(html, /aria-pressed="false"[^>]*>Wrong fact</);
  assert.match(html, />Add a note</, 'the optional note waits behind one small button');
  assert.doesNotMatch(html, /textarea/);
  assert.match(html, /Saved\./);
  assert.doesNotMatch(html, /role="dialog"/, 'nothing pops up');
});

test('a saved note shows in its box, at most 2,000 characters', () => {
  const html = row({ rating: { vote: 'up', reasons: [], note: 'More of these, please.' } });
  assert.match(html, /<textarea[^>]*maxLength="2000"[^>]*>More of these, please\.<\/textarea>/i);
  assert.match(html, /<button type="button" disabled="">Save note<\/button>/);
  assert.doesNotMatch(html, /autofocus/i, 'a saved note shown on load never takes focus');
});

test('a row placed away from its block names the block', () => {
  assert.match(row({ named: true }), /Rate “Why a retry repeats”/);
});

test('a note shaped like a key is never kept', () => {
  const guard = (text) => text.includes('KEY');
  assert.deepEqual(noteChange('fine note', guard), { draft: 'fine note', message: '' });
  assert.deepEqual(noteChange('my KEY here', guard), { draft: '', message: NOTE_REFUSED });
});
