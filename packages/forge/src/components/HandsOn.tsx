import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { checkPaste, looksLikeSecret, REFUSED } from '@forge/lib/handsOn.js';
import { getHandsOnProgress, saveHandsOnStep } from '@forge/api';
import { establishOwnerSession } from '@forge/bootstrap';
import { lessonAt, manifestForRoute } from './manifest.mjs';
import { mountPoints, removeMountPoints } from './handsOnPage.mjs';
import { handsOnSaves } from './handsOnSaves.mjs';

// A hands-on lesson (D73): Forge exported its numbered steps as Markdown and listed each step's
// declared paste check in the course manifest. This adds a paste box under each checked step and
// an "I did this" box under each step nothing can check. What is pasted stays in this page's
// memory: it is never stored (no browser storage, no autofill, no spellcheck service) and never
// sent anywhere. Only a step's status ("checked", "said done") is saved with the course in Forge.

type Check = { kind: string; status?: number; error_type?: string; program?: string; fields?: string[] };
type Step = { id: string; number: number; title: string; check: Check | null };
type Lesson = { course_slug: string; module_id: string; hands_on: { task_digest: string; steps: Step[] } };

export const SAVED = 'Your progress on these steps is saved with the course. What you paste is never saved.';
export const NOT_SAVED = 'Your progress on these steps isn’t being saved: open Forge to save it. What you paste is never saved.';
export const NOT_SAVED_NOW = 'Forge couldn’t save your progress just now. Reload the page in a moment and try again. What you paste is never saved.';

// Forge answered but refused (a busy course, a task that changed since the page loaded): it is
// open, so reloading helps. With no answer at all, Forge isn't running.
const notSaved = (error: unknown) => (Number.isInteger((error as any)?.status) ? NOT_SAVED_NOW : NOT_SAVED);

let ownerSession: ReturnType<typeof establishOwnerSession> | undefined;
async function connected() {
  ownerSession ||= establishOwnerSession();
  if ((await ownerSession).kind !== 'ready') {
    ownerSession = undefined;
    throw new Error('Forge is not available');
  }
}

function PasteBox({ step, status, onChecked }: { step: Step; status?: string; onChecked: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ status: string; message: string; checked: string } | null>(null);
  const id = `forge-paste-${step.id}`;
  const change = (value: string) => {
    // A key never stays in the box: refuse it as it arrives, before any check.
    if (looksLikeSecret(value)) {
      setText('');
      setResult({ status: 'refused', message: REFUSED, checked: '' });
      return;
    }
    setText(value);
    // Any edit drops the last result: it was about text that is no longer in the box.
    setResult(null);
  };
  const check = () => {
    const outcome = checkPaste(step.check, text);
    setResult(outcome);
    if (outcome.status === 'passed') {
      setText('');
      onChecked();
    }
  };
  let line = '';
  if (result?.status === 'passed') line = `Step ${step.number} looks right. ${result.checked} The box is cleared.`;
  else if (result) line = result.message;
  else if (status === 'checked') line = `Step ${step.number} was checked earlier. Paste again to check it again.`;
  return <div className="forge-hands-on-box" data-state={result?.status || status || 'open'}>
    <label htmlFor={id}>Paste for step {step.number}</label>
    <textarea id={id} value={text} onChange={(event) => change(event.target.value)} rows={4}
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-gramm="false" />
    <button type="button" onClick={check} disabled={!text.trim()}>Check step {step.number}</button>
    <p role="status" aria-live="polite">{line}</p>
  </div>;
}

function DoneBox({ step, status, onDone }: { step: Step; status?: string; onDone: (done: boolean) => void }) {
  const done = status === 'said_done';
  return <div className="forge-hands-on-box" data-state={done ? 'said_done' : 'open'}>
    <label><input type="checkbox" checked={done} onChange={(event) => onDone(event.target.checked)} /> I did step {step.number}</label>
    <p role="status" aria-live="polite">{done ? 'You said done. Nothing checked this step.' : 'Nothing can check this step, so this one is up to you.'}</p>
  </div>;
}

export default function HandsOn() {
  const [page, setPage] = useState<{ lesson: Lesson; slots: HTMLElement[]; status: HTMLElement } | null>(null);
  const [states, setStates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  const sequence = useRef(0);
  const saves = useRef<ReturnType<typeof handsOnSaves> | null>(null);

  useEffect(() => {
    let disposed = false;
    let mounted: HTMLElement[] = [];
    const clear = () => {
      saves.current?.stop();
      saves.current = null;
      removeMountPoints(mounted);
      mounted = [];
      setPage(null);
      setStates({});
      setSaving('');
    };
    const load = async () => {
      const turn = ++sequence.current;
      clear();
      const path = window.location.pathname;
      let lesson: Lesson | null = null;
      try {
        const manifest = await manifestForRoute(path, fetch);
        lesson = manifest ? lessonAt(manifest, path) : null;
      } catch { return; }
      if (disposed || turn !== sequence.current || (lesson as any)?.kind !== 'hands-on' || !lesson) return;
      const content = document.querySelector('.markdown-content');
      if (!content) return;
      const slots = mountPoints(content, lesson.hands_on.steps, document);
      const status = document.createElement('p');
      status.className = 'forge-hands-on-saving';
      content.insertBefore(status, [...content.children].find((child) => child.tagName === 'H2') || null);
      mounted = [...slots, status];
      setPage({ lesson, slots, status });
      const { course_slug: slug, module_id: moduleId } = lesson;
      const digest = lesson.hands_on.task_digest;
      // This page turn's saves, one at a time in click order; the next turn starts a new queue.
      saves.current = handsOnSaves({
        digest,
        send: async (step_id, status) => {
          await connected();
          return saveHandsOnStep(slug, moduleId, { task_digest: digest, step_id, status });
        },
        read: async () => {
          await connected();
          return getHandsOnProgress(slug, moduleId);
        },
        show: setStates,
        report: (error) => setSaving(error === null ? SAVED : notSaved(error)),
      });
      saves.current.load();
    };
    load();
    document.addEventListener('astro:page-load', load);
    return () => {
      disposed = true;
      document.removeEventListener('astro:page-load', load);
      saves.current?.stop();
      removeMountPoints(mounted);
    };
  }, []);

  if (!page) return null;
  const { lesson } = page;
  const save = (step: Step, status: string) => { saves.current?.save(step.id, status); };
  return <>
    {createPortal(<span role="status" aria-live="polite">{saving}</span>, page.status)}
    {lesson.hands_on.steps.map((step, index) => createPortal(step.check
      ? <PasteBox step={step} status={states[step.id]} onChecked={() => save(step, 'checked')} />
      : <DoneBox step={step} status={states[step.id]} onDone={(done) => save(step, done ? 'said_done' : 'open')} />,
    page.slots[index], step.id))}
  </>;
}
