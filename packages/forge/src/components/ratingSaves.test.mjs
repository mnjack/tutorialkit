import test from 'node:test';
import assert from 'node:assert/strict';
import { notSaved, NOT_SAVED, NOT_SAVED_NOW, ratingSaves, SAVED } from './ratingSaves.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for Forge: it keeps a block's rating only when the test lets that request through.
function forge() {
  const held = {};
  const requests = [];
  const page = { shown: {}, lines: {} };
  const saves = ratingSaves({
    send: (blockId, rating) => new Promise((resolve, reject) => {
      requests.push({
        blockId,
        rating,
        store() { held[blockId] = rating; resolve(); },
        refuse(status) { reject(Object.assign(new Error('refused'), { status })); },
      });
    }),
    show: (ratings) => { page.shown = ratings; },
    report: (blockId, error) => { page.lines[blockId] = error === null ? 'SAVED' : `NOT_SAVED:${error.status}`; },
  });
  return { held, requests, page, saves };
}

test('one press shows at once and saves, with nothing else to confirm', async () => {
  const { held, requests, page, saves } = forge();
  saves.press('a', { vote: 'down' });
  assert.deepEqual(page.shown, { a: { vote: 'down', reasons: [], note: '' } });
  await settle();
  assert.equal(requests.length, 1);
  requests[0].store();
  await settle();
  assert.deepEqual(held, { a: { vote: 'down', reasons: [], note: '' } });
  assert.equal(page.lines.a, 'SAVED');
});

test('a chip or a note sends the same block\'s whole rating, after the press before it', async () => {
  const { held, requests, page, saves } = forge();
  saves.press('a', { vote: 'down' });
  saves.press('a', { reason: 'sounds_like_ai' });
  saves.press('a', { note: 'Reads like a brochure.' });
  await settle();
  assert.equal(requests.length, 1, 'the chip waits for the press');
  requests[0].store();
  await settle();
  assert.equal(page.lines.a, undefined, 'an older save never sets the line');
  requests[1].store();
  await settle();
  requests[2].store();
  await settle();
  assert.deepEqual(held.a, { vote: 'down', reasons: ['sounds_like_ai'], note: 'Reads like a brochure.' });
  assert.equal(page.lines.a, 'SAVED');
  saves.press('a', { reason: 'sounds_like_ai' });
  assert.deepEqual(page.shown.a.reasons, [], 'pressing a chip again takes it off');
});

test('a chip or note before any thumb sends nothing', async () => {
  const { requests, page, saves } = forge();
  saves.press('a', { reason: 'too_long' });
  saves.press('a', { note: 'hm' });
  await settle();
  assert.equal(requests.length, 0);
  assert.deepEqual(page.shown, {});
});

test('a refused save says so on that block only, and a page turn stops the rest', async () => {
  const { requests, page, saves } = forge();
  saves.hold({ b: { vote: 'up', reasons: ['more_like_this'], note: '' } });
  assert.deepEqual(page.shown.b.reasons, ['more_like_this']);
  saves.press('a', { vote: 'up' });
  saves.press('b', { vote: 'down' });
  await settle();
  requests[0].refuse(409);
  await settle();
  assert.equal(page.lines.a, 'NOT_SAVED:409');
  saves.stop();
  requests[1].store();
  await settle();
  assert.equal(page.lines.b, undefined);
});

test('a failed save shows plain words: Forge\'s own reason only for a learner refusal', () => {
  const refused = (status, message) => Object.assign(new Error(message), { status });
  const keyNote = 'This note looks like an API key or token, so it wasn’t kept.';
  assert.equal(notSaved(refused(422, keyNote)), keyNote);
  assert.equal(notSaved(refused(404, 'This page isn’t part of the course.')), 'This page isn’t part of the course.');
  assert.equal(notSaved(refused(409, 'Defect admission blocked: defect-report.json is missing; rebuild the course.')), NOT_SAVED_NOW);
  assert.equal(notSaved(refused(401, 'Invalid local session')), NOT_SAVED_NOW);
  assert.equal(notSaved(refused(500, 'Internal Server Error')), NOT_SAVED_NOW);
  assert.equal(notSaved(new TypeError('Failed to fetch')), NOT_SAVED);
  assert.equal(SAVED, 'Saved.');
});
