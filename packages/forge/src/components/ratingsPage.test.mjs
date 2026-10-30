import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingSlots, removeSlots, SLOT_CLASS } from './ratingsPage.mjs';

// A flat stand-in for the lesson's rendered Markdown and what follows it: just what ratingSlots touches.
class Element {
  constructor(tagName, textContent = '', children = []) {
    this.tagName = tagName;
    this.ownText = textContent;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.className = '';
    for (const child of children) this.appendChild(child);
  }
  // Children first, then the element's own trailing text, as in <p><strong>label</strong> text</p>.
  get textContent() { return this.children.map((child) => child.textContent).join('') + this.ownText; }
  get firstElementChild() { return this.children[0] || null; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  insertAdjacentElement(where, child) {
    const siblings = this.parentElement.children;
    child.parentElement = this.parentElement;
    siblings.splice(siblings.indexOf(this) + (where === 'afterend' ? 1 : 0), 0, child);
    return child;
  }
  remove() { const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); }
}
const doc = { createElement: (tag) => new Element(tag.toUpperCase()) };
const quiz = (label) => new Element('P', ' Answer in two sentences.', [new Element('STRONG', `Check — ${label}:`)]);

function page(...elements) {
  const column = new Element('DIV');
  const content = column.appendChild(new Element('DIV'));
  content.className = 'markdown-content';
  for (const element of elements) content.appendChild(element);
  column.appendChild(new Element('NAV'));
  return { column, content };
}
const shape = (parent) => parent.children.map((child) => (child.className === SLOT_CLASS ? `row:${child.dataset.block}` : child.tagName));

const LESSON = [
  { id: 'a', kind: 'section', name: 'Why', section: 0 },
  { id: 'b', kind: 'section', name: 'How', section: 1 },
  { id: 'q', kind: 'quiz', name: 'Quiz: apply to scenario', section: 1 },
  { id: 'c', kind: 'section', name: 'Next', section: 2 },
];

test('a row goes under each section, and a quiz gets its own row under the quiz', () => {
  const { content, column } = page(new Element('H1', 'Title'), new Element('P', 'intro'),
    new Element('H2', 'Why'), new Element('P', 'text'), new Element('BLOCKQUOTE', 'q'),
    new Element('H2', 'How'), new Element('P', 'text'), quiz('apply to scenario'),
    new Element('H2', 'Next'), new Element('P', 'Next session'));
  const slots = ratingSlots(content, LESSON, doc);
  assert.deepEqual(slots.map((slot) => slot.dataset.block), ['a', 'b', 'q', 'c']);
  assert.deepEqual(shape(content), ['H1', 'P', 'H2', 'P', 'BLOCKQUOTE', 'row:a', 'H2', 'P', 'row:b', 'P', 'row:q',
    'H2', 'P', 'row:c']);
  assert.ok(slots.every((slot) => slot.dataset.named === undefined), 'rows in place need no block name');
  removeSlots(slots);
  assert.deepEqual(shape(content), ['H1', 'P', 'H2', 'P', 'BLOCKQUOTE', 'H2', 'P', 'P', 'H2', 'P']);
  assert.deepEqual(shape(column), ['DIV', 'NAV']);
});

test('a page rated as a whole gets one row after its text, before the page navigation', () => {
  const { content, column } = page(new Element('H1', 'Task'), new Element('H2', 'Step 1: Run'), new Element('P', 'do'));
  const slots = ratingSlots(content, [{ id: 't', kind: 'hands-on', name: 'Hands-on: Run it' }], doc);
  assert.deepEqual(shape(content), ['H1', 'H2', 'P']);
  assert.deepEqual(shape(column), ['DIV', 'row:t', 'NAV']);
  assert.equal(slots.length, 1);
});

test('when the page does not show the sections Forge listed, every row goes after the text, named', () => {
  const { content, column } = page(new Element('H1', 'Title'), new Element('H2', 'Why'), new Element('P', 'text'));
  const slots = ratingSlots(content, LESSON, doc);
  assert.deepEqual(shape(column), ['DIV', 'row:a', 'row:b', 'row:q', 'row:c', 'NAV']);
  assert.ok(slots.every((slot) => slot.dataset.named === 'true'), 'each row names its block');
});
