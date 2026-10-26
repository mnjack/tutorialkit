import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonAt, localPath, manifestForRoute } from './manifest.mjs';
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

const app = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, app), 'utf8');
const welcome = JSON.parse(read('public/forge-manifest.json'));
const withWelcome = (values) => fakeFetch({ ...values, '/forge-manifest.json': welcome });
test('welcome route uses the bundled welcome manifest while courses are exported', async () => {
  for (const path of ['/welcome/start/lesson', '/welcome/start/lesson/']) {
    assert.deepEqual(await manifestForRoute(path, withWelcome({ '/forge-courses.json': index, '/second.json': manifest })), welcome);
  }
});
test('a course route never resolves to the bundled welcome manifest', async () => {
  assert.equal(await manifestForRoute('/second/module/lesson', withWelcome({ '/forge-courses.json': index })), null);
  const claimed = { ...welcome, lessons: { ...welcome.lessons, '/second/module/lesson': { course_slug: '' }, '/first/lesson': { course_slug: 'first' } } };
  const fetcher = fakeFetch({ '/forge-courses.json': index, '/forge-manifest.json': claimed });
  assert.equal(await manifestForRoute('/second/module/lesson', fetcher), null);
  assert.equal(await manifestForRoute('/first/lesson', fetcher), null);
});
test('lessonAt without a manifest returns nothing instead of throwing', () => {
  assert.equal(lessonAt(null, '/welcome/start/lesson'), undefined);
  assert.equal(lessonAt(undefined, '/welcome/start/lesson'), undefined);
});
test('the welcome lesson slug builds the bundled manifest route', () => {
  // TutorialKit takes each route segment from the penultimate part of an entry's
  // slug; without frontmatter, Astro's slug is the entry path.
  const slug = (path) => read(`src/content/tutorial/${path}`).match(/^slug:\s*(\S+)$/m)?.[1] ?? path.replace(/\.md$/, '');
  const segment = (path) => slug(path).split('/').at(-2);
  const route = '/' + ['1-welcome/meta.md', '1-welcome/1-start/meta.md', '1-welcome/1-start/1-lesson/content.md'].map(segment).join('/');
  assert.deepEqual(Object.keys(welcome.lessons), [route]);
  assert.equal(route, '/welcome/start/lesson');
});
test('a listed course route without a valid manifest is unavailable, not outside any course', async () => {
  const stale = { ...manifest, course_digest: 'b'.repeat(64) };
  for (const values of [{ '/second.json': stale }, {}]) {
    let unavailable = 0;
    const result = await manifestForRoute('/second/module/lesson', withWelcome({ '/forge-courses.json': index, ...values }), () => { unavailable += 1; });
    assert.equal(result, null);
    assert.equal(unavailable, 1);
  }
  let outside = 0;
  const onUnavailable = () => { outside += 1; };
  assert.deepEqual(await manifestForRoute('/welcome/start/lesson', withWelcome({ '/forge-courses.json': index }), onUnavailable), welcome);
  assert.equal(await manifestForRoute('/unlisted/page', withWelcome({ '/forge-courses.json': index }), onUnavailable), null);
  assert.equal(await manifestForRoute('/second/module/lesson', withWelcome({ '/forge-courses.json': index, '/second.json': manifest }), onUnavailable), manifest);
  assert.equal(outside, 0);
});
