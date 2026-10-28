import test from 'node:test';
import assert from 'node:assert/strict';
import { remarkExternalLinks } from '../lib/externalLinks.mjs';

const link = (url) => ({ type: 'link', url, children: [{ type: 'text', value: 'x' }] });

test('a citation link to another site opens in a new tab; a tutorial link opens in place', () => {
  const cited = link('https://docs.mistral.ai/capabilities/#usage-tiers');
  const plain = link('http://example.com/page');
  const inside = link('/welcome/start/');
  const anchor = link('#next');
  const tree = {
    type: 'root',
    children: [
      { type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Source: ' }, cited] }] },
      { type: 'list', children: [{ type: 'listItem', children: [{ type: 'paragraph', children: [plain, inside, anchor] }] }] },
    ],
  };
  remarkExternalLinks()(tree);
  for (const external of [cited, plain]) {
    assert.deepEqual(external.data.hProperties, { target: '_blank', rel: 'noopener noreferrer' });
  }
  assert.equal(inside.data, undefined);
  assert.equal(anchor.data, undefined);
});

test('a link keeps the properties it already had', () => {
  const cited = { ...link('https://github.com/mistralai/client-python'), data: { hProperties: { className: ['cite'] } } };
  remarkExternalLinks()({ type: 'root', children: [cited] });
  assert.deepEqual(cited.data.hProperties, { className: ['cite'], target: '_blank', rel: 'noopener noreferrer' });
});
