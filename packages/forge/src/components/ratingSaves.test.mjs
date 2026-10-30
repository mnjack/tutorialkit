import test from 'node:test';
import assert from 'node:assert/strict';
import { notSaved, NOT_SAVED, NOT_SAVED_NOW, ratingSaves, SAVED } from './ratingSaves.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for Forge: it keeps a block's rating only when the test lets that request through,
// and answers each read of the page's saved ratings only when the test says so.
function forge(saved = {}) {
  const held = { ...saved };
  const requests = [];
  const reads = [];
  const page = { shown: {}, lines: {} };
  const saves = ratingSaves({
    load: () => new Promise((resolve, reject) => {
      reads.push({
        answer() { resolve(structuredClone(held)); },
        fail(status) { reject(Object.assign(new Error('unavailable'), { status })); },
      });
    }),
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
  return { held, requests, reads, page, saves };
}

// A page whose saved ratings Forge has already read out (here, none).
async function opened(saved) {
  const page = forge(saved);
  const ready = page.saves.loaded();
  page.reads[0].answer();
  await ready;
  return page;
}

test('one press shows at once and saves, with nothing else to confirm', async () => {
  const { held, requests, page, saves } = await opened();
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
  const { held, requests, page, saves } = await opened();
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
  const { requests, page, saves } = await opened();
  saves.press('a', { reason: 'too_long' });
  saves.press('a', { note: 'hm' });
  await settle();
  assert.equal(requests.length, 0);
  assert.deepEqual(page.shown, {});
});

test('a refused save says so on that block only, and a page turn stops the rest', async () => {
  const { requests, page, saves } = await opened({ b: { vote: 'up', reasons: ['more_like_this'], note: '' } });
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

test('a press while the saved ratings are still loading lands on top of them', async () => {
  // Reload a rated page and press a thumb before Forge has answered: the saved chips and note
  // stay, with the new thumb, and nothing is sent until Forge has said what it holds.
  const { held, requests, reads, page, saves } = forge({ a: { vote: 'down', reasons: ['too_long'], note: 'Cut the intro.' } });
  const ready = saves.loaded();
  const pressed = saves.press('a', { vote: 'up' });
  await settle();
  assert.equal(reads.length, 1, 'the press waits for the same read');
  assert.equal(requests.length, 0, 'nothing is sent before the saved ratings load');
  assert.deepEqual(page.shown, {});
  reads[0].answer();
  await ready;
  await settle();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].rating, { vote: 'up', reasons: ['too_long'], note: 'Cut the intro.' });
  requests[0].store();
  await pressed;
  await settle();
  assert.deepEqual(held.a, { vote: 'up', reasons: ['too_long'], note: 'Cut the intro.' });
  assert.equal(page.lines.a, 'SAVED');
});

test('once loaded, the rows show the saved thumbs, chips and notes', async () => {
  const saved = { a: { vote: 'down', reasons: ['too_long'], note: 'Cut the intro.' }, b: { vote: 'up', reasons: [], note: '' } };
  const { requests, page } = await opened(saved);
  assert.deepEqual(page.shown, saved);
  assert.equal(requests.length, 0, 'showing what Forge holds sends nothing');
});

test('when the saved ratings can\'t load, a press sends nothing and says so', async () => {
  const { held, requests, reads, page, saves } = forge({ a: { vote: 'down', reasons: ['too_long'], note: 'Cut the intro.' } });
  const ready = saves.loaded();
  reads[0].fail(503);
  await assert.rejects(ready);
  saves.press('a', { vote: 'up' });
  await settle();
  assert.equal(reads.length, 2, 'the press reads the saved ratings again first');
  reads[1].fail(503);
  await settle();
  assert.equal(requests.length, 0, 'nothing is sent over what Forge holds');
  assert.deepEqual(page.shown, {}, 'the row doesn\'t show a thumb Forge never got');
  assert.equal(page.lines.a, 'NOT_SAVED:503');
  // Forge answers on the next press: it lands on top of the saved chips and note.
  saves.press('a', { vote: 'up' });
  await settle();
  reads[2].answer();
  await settle();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].rating, { vote: 'up', reasons: ['too_long'], note: 'Cut the intro.' });
  requests[0].store();
  await settle();
  assert.deepEqual(held.a, { vote: 'up', reasons: ['too_long'], note: 'Cut the intro.' });
  assert.equal(page.lines.a, 'SAVED');
});

test('a page turn during the load leaves the rows alone', async () => {
  const { requests, reads, page, saves } = forge({ a: { vote: 'down', reasons: [], note: '' } });
  const ready = saves.loaded();
  saves.press('a', { vote: 'up' });
  saves.stop();
  reads[0].answer();
  await ready;
  await settle();
  assert.deepEqual(page.shown, {});
  assert.equal(requests.length, 0);
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
