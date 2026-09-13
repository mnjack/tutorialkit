import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPath, manifestForRoute } from './manifest.mjs';
const digest = 'a'.repeat(64);
const manifest = { schema_version: 1, course_digest: digest, lessons: { '/second/module/lesson': { course_slug: 'second', module_id: 'M2' } } };
const index = { courses: { first: { manifest_path: '/first.json', digest, routes: ['/first/lesson'] }, second: { manifest_path: '/second.json', digest, routes: ['/second/module/lesson'] } } };
const fakeFetch = (values) => async (path) => ({ ok: path in values, json: async () => values[path] });
test('finds active lesson in its own course manifest', async () => {
  const result = await manifestForRoute('/second/module/lesson/', fakeFetch({ '/forge-courses.json': index, '/second.json': manifest }));
  assert.deepEqual(result, manifest);
});
test('stale digest or swapped course cannot supply mentor provenance', async () => {
  for (const changed of [{ ...manifest, course_digest: 'b'.repeat(64) }, { ...manifest, lessons: { '/second/module/lesson': { course_slug: 'first' } } }]) {
    assert.equal(await manifestForRoute('/second/module/lesson', fakeFetch({ '/forge-courses.json': index, '/second.json': changed })), null);
  }
});
test('redirect and manifest paths stay local', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', null]) assert.equal(localPath(value), false);
  assert.equal(localPath('/second/lesson'), true);
});

test('missing course index still allows only the bundled welcome manifest', async () => {
  const fetcher = (value) => async (path) => path === '/forge-courses.json'
    ? { ok: false, status: 404 } : { ok: true, json: async () => value };
  const welcome = { schema_version: 1, course_digest: digest, lessons: { '/welcome': { course_slug: '' } } };
  assert.deepEqual(await manifestForRoute('/welcome', fetcher(welcome)), welcome);
  assert.equal(await manifestForRoute('/second/module/lesson', fetcher(manifest)), null);
});
