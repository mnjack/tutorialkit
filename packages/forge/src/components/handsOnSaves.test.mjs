import test from 'node:test';
import assert from 'node:assert/strict';
import { handsOnSaves } from './handsOnSaves.mjs';

const DIGEST = 'd1';
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for Forge: it stores a step only when the test lets that request through, and
// answers like post_hands_on_step and get_hands_on_progress, with every stored step.
function forge() {
  const held = {};
  const requests = [];
  const page = { shown: {}, line: 'none', reads: 0 };
  const queue = handsOnSaves({
    digest: DIGEST,
    send: (stepId, status) => new Promise((resolve, reject) => {
      requests.push({
        stepId,
        status,
        store() {
          if (status === 'open') delete held[stepId];
          else held[stepId] = status;
          resolve({ task_digest: DIGEST, steps: { ...held } });
        },
        refuse(code) { reject(Object.assign(new Error('refused'), { status: code })); },
      });
    }),
    read: async () => {
      page.reads += 1;
      return { task_digest: DIGEST, steps: { ...held } };
    },
    show: (states) => { page.shown = states; },
    report: (error) => { page.line = error === null ? 'SAVED' : `NOT_SAVED:${error.status}`; },
  });
  return { held, requests, page, queue };
}

test('tick then untick: the untick goes only after the tick, and SAVED waits for it', async () => {
  const { held, requests, page, queue } = forge();
  queue.save('s1', 'said_done');
  queue.save('s1', 'open');
  await settle();
  assert.equal(requests.length, 1, 'the second click waits for the first request');
  assert.deepEqual(page.shown, {});
  requests[0].store();
  await settle();
  assert.equal(page.line, 'none', 'an older save never sets the line');
  assert.deepEqual(page.shown, {}, 'the waiting untick still shows');
  assert.equal(requests.length, 2);
  requests[1].store();
  await settle();
  assert.deepEqual(held, {});
  assert.deepEqual(page.shown, held);
  assert.equal(page.line, 'SAVED');
});

test('tick then untick refused: the line says not saved and the box shows what Forge holds', async () => {
  const { held, requests, page, queue } = forge();
  queue.save('s1', 'said_done');
  queue.save('s1', 'open');
  await settle();
  requests[0].store();
  await settle();
  requests[1].refuse(409);
  await settle();
  assert.deepEqual(held, { s1: 'said_done' });
  assert.deepEqual(page.shown, held);
  assert.equal(page.line, 'NOT_SAVED:409');
  assert.equal(page.reads, 1, 'Forge is asked what it holds');
});

test('a refused step goes back to open when a later step saves', async () => {
  const { held, requests, page, queue } = forge();
  queue.save('a', 'said_done');
  queue.save('b', 'said_done');
  await settle();
  requests[0].refuse(409);
  await settle();
  assert.equal(page.line, 'none', 'the older failure leaves the line to the newer save');
  requests[1].store();
  await settle();
  assert.deepEqual(held, { b: 'said_done' });
  assert.deepEqual(page.shown, held, 'step a is open, not done');
  assert.equal(page.line, 'SAVED');
});

test('the newest save failing with no answer at all puts its step back', async () => {
  const held = {};
  let shown = {};
  let line = 'none';
  const queue = handsOnSaves({
    digest: DIGEST,
    send: async () => { throw new Error('Forge is not available'); },
    read: async () => { throw new Error('Forge is not available'); },
    show: (states) => { shown = states; },
    report: (error) => { line = error === null ? 'SAVED' : 'NOT_SAVED'; },
  });
  await queue.save('s1', 'said_done');
  assert.deepEqual(shown, held);
  assert.equal(line, 'NOT_SAVED');
});

test('the page load reads first, and a stopped page changes nothing', async () => {
  const { held, requests, page, queue } = forge();
  held.s2 = 'checked';
  await queue.load();
  assert.deepEqual(page.shown, { s2: 'checked' });
  assert.equal(page.line, 'SAVED');
  queue.save('s1', 'said_done');
  await settle();
  queue.stop();
  const before = { ...page.shown };
  requests[0].store();
  await settle();
  assert.deepEqual(page.shown, before);
  assert.equal(page.line, 'SAVED');
});

test('a reply for another task digest is not shown as stored', async () => {
  let shown = null;
  const queue = handsOnSaves({
    digest: DIGEST,
    send: async () => ({ task_digest: 'other', steps: { s1: 'said_done' } }),
    read: async () => ({ task_digest: 'other', steps: { s1: 'said_done' } }),
    show: (states) => { shown = states; },
    report: () => {},
  });
  await queue.load();
  assert.deepEqual(shown, {});
});
