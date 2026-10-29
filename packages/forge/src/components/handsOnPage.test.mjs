import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPoints, removeMountPoints, SLOT_CLASS } from './handsOnPage.mjs';

// A flat stand-in for the lesson's rendered Markdown: just what mountPoints touches.
class Element {
  constructor(tagName, textContent = '') {
    this.tagName = tagName;
    this.textContent = textContent;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.className = '';
  }
  get nextElementSibling() {
    const siblings = this.parentElement.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  insertAdjacentElement(where, child) {
    assert.equal(where, 'afterend');
    const siblings = this.parentElement.children;
    child.parentElement = this.parentElement;
    siblings.splice(siblings.indexOf(this) + 1, 0, child);
    return child;
  }
  remove() { const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); }
  querySelectorAll(selector) {
    assert.equal(selector, 'h2');
    return this.children.filter((child) => child.tagName === 'H2');
  }
}
const doc = { createElement: (tag) => new Element(tag.toUpperCase()) };
const steps = [{ id: 's1', number: 1 }, { id: 's2', number: 2 }];

function page(...tags) {
  const content = new Element('DIV');
  for (const [tag, text] of tags) content.appendChild(new Element(tag, text));
  return content;
}
const shape = (content) => content.children.map((child) => child.className === SLOT_CLASS ? `box:${child.dataset.step}` : child.tagName);

test('each paste box goes at the end of its own step', () => {
  const content = page(['H1', 'Task'], ['P', 'intro'], ['H2', 'Step 1: Install'], ['P', 'do'], ['BLOCKQUOTE', 'q'],
    ['P', 'Paste'], ['H2', 'Step 2: Run'], ['P', 'do'], ['P', 'Paste']);
  const slots = mountPoints(content, steps, doc);
  assert.deepEqual(shape(content), ['H1', 'P', 'H2', 'P', 'BLOCKQUOTE', 'P', 'box:s1', 'H2', 'P', 'P', 'box:s2']);
  removeMountPoints(slots);
  assert.deepEqual(shape(content), ['H1', 'P', 'H2', 'P', 'BLOCKQUOTE', 'P', 'H2', 'P', 'P']);
});

test('a page without the step headings still gets every box, at the end, in order', () => {
  const content = page(['H1', 'Task'], ['H2', 'Step 1: Install'], ['P', 'do']);
  mountPoints(content, steps, doc);
  assert.deepEqual(shape(content), ['H1', 'H2', 'P', 'box:s1', 'box:s2']);
});
