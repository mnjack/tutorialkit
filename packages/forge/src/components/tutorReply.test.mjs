import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tutorReplyText } from './tutorReply.mjs';

const validated = (citations, extra = {}) => ({
  status: 'validated',
  display: { segments: [{ kind: 'claim', text: 'A retry can repeat a side effect.', citations, ...extra }] },
});

test('a tutor citation shows the quote and only the plain words Forge built for its source', () => {
  const text = tutorReplyText(validated([{ anchor: 'a1', quote: 'Retries repeat requests.', citation: 'Rate limits, docs.mistral.ai' }]));
  assert.equal(text, 'A retry can repeat a side effect.\n“Retries repeat requests.” (Rate limits, docs.mistral.ai)');
});

test('no badge and no made-up name: a citation without Forge text shows just its quote', () => {
  const text = tutorReplyText(validated([{ anchor: 'alpha#ch01', quote: 'Retries repeat requests.', evidence_status: 'REVIEW',
    evidence_label: 'Owner review required', source_course_label: 'Alpha course' }]));
  assert.equal(text, 'A retry can repeat a side effect.\n“Retries repeat requests.”');
});

test('general knowledge keeps its label, and server-authored probes pass through', () => {
  const general = tutorReplyText({ status: 'repaired', display: { segments: [{ kind: 'general_knowledge', label: 'General knowledge', text: 'HTTP 429 means slow down.' }] } });
  assert.equal(general, 'General knowledge\nHTTP 429 means slow down.');
  assert.equal(tutorReplyText({ status: 'probe', display: { content: 'Run the check again.' } }), 'Run the check again.');
  assert.equal(tutorReplyText({ status: 'withheld' }), 'The tutor could not ground an answer in this lesson’s sources.');
  assert.equal(tutorReplyText({ status: 'validated', display: { segments: [] } }), '');
});

test('the drawer builds its reply text only through tutorReplyText', () => {
  const drawer = readFileSync(new URL('./ForgeTools.tsx', import.meta.url), 'utf8');
  assert.match(drawer, /tutorReplyText\(result\)/);
  assert.doesNotMatch(drawer, /evidence_status|evidence_label|source_course_label|Course source passage/);
});
