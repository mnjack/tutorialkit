import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The learner-facing helper is the tutor. Forge's own API names keep their identifiers.
const forgeNames = /sendMentorTurnStream|mentor_anchor/gi;
for (const path of ['src/components/ForgeTools.tsx', 'theme.css']) {
  test(`${path} says tutor, not mentor`, () => {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(forgeNames, '');
    const leftovers = text.split('\n').map((line, index) => [index + 1, line]).filter(([, line]) => /mentor/i.test(line));
    assert.deepEqual(leftovers, []);
  });
}
